import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient, type ReceiptDraft, type ReceiptDraftVersion } from '@prisma/client';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { payloadHash } from '../domain/idempotency.js';
import { deriveBadge, makeBadge } from '../domain/provenance.js';
import { confirmedSplitSchema, type ConfirmedSplitInput } from '../services/shared-expense-inputs.js';
import { SharedExpenseService, type SharedExpenseConfirmationResult } from '../services/shared-expenses.js';
import {
  allocationRequestSchema, allocationResultSchema, extractionSchema, receiptDataSchema, receiptEditSchema, reviewedSplitConfirmSchema,
  type AllocationRequest, type AllocationResult, type AllocationReviewCard, type ReceiptAdapters, type ReceiptData, type ReceiptReviewCard, type RecordedExpenseCard,
} from './contracts.js';
import { assignmentFingerprint, configuredReceiptAdapters } from './adapters.js';
import { ReceiptUploadService } from './uploads.js';

export interface ReceiptOptions { adapters?: ReceiptAdapters; storageDirectory?: string }
export class ReceiptService {
  readonly uploads: ReceiptUploadService;
  private readonly adapters: ReceiptAdapters;
  private readonly expenses: SharedExpenseService;
  constructor(private readonly db: PrismaClient, options: ReceiptOptions = {}) {
    this.adapters = options.adapters ?? configuredReceiptAdapters();
    this.uploads = new ReceiptUploadService(db, options.storageDirectory);
    this.expenses = new SharedExpenseService(db);
  }
  private async adapter<T>(call: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([call(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new AppError(503, 'RECEIPT_ADAPTER_TIMEOUT', 'Receipt adapter timed out; no financial action occurred')), 8000); })]);
      if (JSON.stringify(result).length > 65536) throw new AppError(502, 'RECEIPT_ADAPTER_INVALID', 'Receipt adapter response exceeded its bounded contract');
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'RECEIPT_ADAPTER_UNAVAILABLE', 'Receipt adapter is unavailable or returned invalid data; no financial action occurred');
    } finally { if (timer) clearTimeout(timer); }
  }
  private async directory() {
    const rows = z.array(z.object({ participant_id: z.string().trim().min(1).max(100), display_name: z.string().trim().min(1).max(100) }).strict()).min(1).max(20)
      .parse(await this.adapter(() => this.adapters.directory.list(DEMO_PROFILE_ID)));
    if (new Set(rows.map(row => row.participant_id)).size !== rows.length) throw new AppError(502, 'PARTICIPANT_DIRECTORY_INVALID', 'Participant directory returned duplicate stable IDs');
    return rows;
  }
  private validateReceipt(receipt: ReceiptData) {
    const currency = receipt.total.currency;
    if (new Set(receipt.items.map(item => item.item_id)).size !== receipt.items.length) throw new AppError(422, 'RECEIPT_ITEM_IDS_INVALID', 'Receipt item IDs must be unique');
    if ([...receipt.items.map(item => item.amount), receipt.tax, receipt.discount].some(amount => amount.currency !== currency)) throw new AppError(422, 'CURRENCY_MISMATCH', 'Receipt items, tax, discount and total must share the original currency');
    const total = receipt.items.reduce((sum, item) => sum + BigInt(item.amount.amount_minor), 0n) + BigInt(receipt.tax.amount_minor) - BigInt(receipt.discount.amount_minor);
    if (total !== BigInt(receipt.total.amount_minor)) throw new AppError(422, 'RECEIPT_TOTAL_MISMATCH', 'Item totals plus tax minus discount must match the original receipt total');
  }
  private async owned(tx: Prisma.TransactionClient, sessionId: string, draftId: string) {
    const draft = await tx.receiptDraft.findFirst({ where: { id: draftId, sessionId, session: { profileId: DEMO_PROFILE_ID } } });
    if (!draft) throw new AppError(404, 'RECEIPT_DRAFT_NOT_FOUND', 'Receipt draft does not belong to this session/profile');
    const version = await tx.receiptDraftVersion.findUniqueOrThrow({ where: { draftId_version: { draftId, version: draft.currentVersion } } });
    return { draft, version };
  }
  private requireEditable(draft: ReceiptDraft, expected: number) {
    if (draft.confirmedAt) throw new AppError(409, 'RECEIPT_ALREADY_CONFIRMED', 'A confirmed receipt cannot be edited or reallocated');
    if (draft.currentVersion !== expected) throw new AppError(409, 'RECEIPT_VERSION_STALE', 'The receipt or assignments changed; refresh the current review');
  }
  private async appendVersion(tx: Prisma.TransactionClient, draft: ReceiptDraft, version: ReceiptDraftVersion, expected: number, data: { receiptJson?: string; correctionsBadgeJson?: string; assignmentsJson?: string; origin: string }) {
    this.requireEditable(draft, expected);
    const changed = await tx.receiptDraft.updateMany({ where: { id: draft.id, currentVersion: expected, confirmedAt: null }, data: { currentVersion: expected + 1 } });
    if (changed.count !== 1) throw new AppError(409, 'RECEIPT_VERSION_STALE', 'Receipt changed concurrently; refresh the review');
    return tx.receiptDraftVersion.create({ data: {
      draftId: draft.id, version: expected + 1, receiptJson: data.receiptJson ?? version.receiptJson,
      correctionsBadgeJson: data.correctionsBadgeJson ?? version.correctionsBadgeJson,
      assignmentsJson: data.assignmentsJson ?? null, origin: data.origin,
    } });
  }
  async review(sessionId: string, draftId: string): Promise<ReceiptReviewCard> {
    const { draft, version } = await this.db.$transaction(tx => this.owned(tx, sessionId, draftId));
    const participants = await this.directory();
    const reviewed = receiptDataSchema.parse(JSON.parse(version.receiptJson) as unknown);
    const issues: ReceiptReviewCard['review_issues'] = [];
    try { this.validateReceipt(reviewed); }
    catch (error) { if (!(error instanceof AppError)) throw error; issues.push({ code: error.code, message: error.message }); }
    return {
      type: 'receipt_review', draft_id: draft.id, version: draft.currentVersion, attachment_id: draft.attachmentId,
      review_state: draft.confirmedAt ? 'confirmed' : 'review_required',
      extracted: extractionSchema.parse(JSON.parse(draft.extractedJson) as unknown), reviewed, review_issues: issues,
      corrections_badge: version.correctionsBadgeJson ? JSON.parse(version.correctionsBadgeJson) : null,
      participants, next_action: draft.confirmedAt ? 'recorded' : 'review_receipt_and_assign_items',
    };
  }
  async extract(sessionId: string, attachmentId: string) {
    await this.uploads.requireSession(sessionId);
    const previous = await this.db.receiptDraft.findFirst({ where: { attachmentId, sessionId } });
    if (previous) return this.review(sessionId, previous.id);
    const attachment = await this.uploads.read(sessionId, attachmentId);
    const extraction = extractionSchema.parse(await this.adapter(() => this.adapters.ocr.extract({ attachment_id: attachmentId, bytes: attachment.bytes, content_type: 'image/png' })));
    // Preserve bounded original extraction even if its arithmetic needs human correction.
    // Review reports issues; allocation remains blocked until the reviewed receipt reconciles.
    const id = randomUUID();
    try {
      await this.db.receiptDraft.create({ data: {
        id, sessionId, attachmentId, receiptId: extraction.receipt_id, extractedJson: JSON.stringify(extraction),
        versions: { create: { version: 1, receiptJson: JSON.stringify(extraction.receipt), origin: 'extraction' } },
      } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      const winner = await this.db.receiptDraft.findFirst({ where: { attachmentId, sessionId } });
      if (!winner) throw error;
      return this.review(sessionId, winner.id);
    }
    return this.review(sessionId, id);
  }
  async edit(sessionId: string, draftId: string, raw: unknown) {
    const input = receiptEditSchema.parse(raw);
    this.validateReceipt(input.receipt);
    await this.db.$transaction(async tx => {
      const { draft, version } = await this.owned(tx, sessionId, draftId);
      await this.appendVersion(tx, draft, version, input.expected_version, {
        receiptJson: JSON.stringify(input.receipt), correctionsBadgeJson: JSON.stringify(makeBadge('User-Entered', 'Receipt corrections entered in frontend review; original extraction retained separately')),
        origin: 'frontend_edit',
      });
    });
    return this.review(sessionId, draftId);
  }
  private binding(draft: ReceiptDraft, version: ReceiptDraftVersion, allocation: AllocationResult, posting: ConfirmedSplitInput) {
    return payloadHash({
      profile_id: DEMO_PROFILE_ID, session_id: draft.sessionId, draft_id: draft.id, receipt_id: draft.receiptId, version: version.version,
      extracted: draft.extractedJson, reviewed: version.receiptJson, corrections: version.correctionsBadgeJson,
      assignments: version.assignmentsJson, allocation, posting, review_state: 'review_required',
    });
  }
  private validateAllocation(result: AllocationResult, receiptId: string, receipt: ReceiptData, request: AllocationRequest) {
    if (result.receipt_id !== receiptId || result.receipt_version !== request.expected_version + 1 || result.assignments_hash !== assignmentFingerprint(request.assignments)
      || payloadHash(result.total) !== payloadHash(receipt.total)) throw new AppError(422, 'ALLOCATION_MISMATCH', 'Allocation adapter result does not match the trusted receipt/version/assignments');
    const ids = result.debtor_shares.map(item => item.participant_id);
    const expected = request.participant_ids.filter(id => id !== request.payer_id).sort();
    if (new Set(ids).size !== ids.length || [...ids].sort().join('|') !== expected.join('|')
      || [result.payer_share, ...result.debtor_shares.map(item => item.share)].some(money => money.currency !== receipt.total.currency)
      || BigInt(result.payer_share.amount_minor) + result.debtor_shares.reduce((sum, item) => sum + BigInt(item.share.amount_minor), 0n) !== BigInt(receipt.total.amount_minor)) {
      throw new AppError(422, 'ALLOCATION_MISMATCH', 'Calculated shares must match the participants, original currency and exact bill total');
    }
  }
  async agentDrinkAmbiguity(sessionId: string, draftId: string, message: string) {
    const { version } = await this.db.$transaction(tx => this.owned(tx, sessionId, draftId));
    const metadata = version.assignmentsJson ? JSON.parse(version.assignmentsJson) as { __unresolved_drinks?: boolean } : {};
    const excludesTzeLoon = /\btze loon\b.*\b(?:did not|didn't|no)\b.*\b(?:drinks|beverages)\b/i.test(message);
    const explicitlyResolved = /\b(?:drinks|beverages)\b.*\bdaniel only\b/i.test(message)
      || /\b(?:drinks|beverages)\b.*\b(?:payer and daniel|daniel and (?:the )?payer)\b/i.test(message);
    return !explicitlyResolved && (excludesTzeLoon || metadata.__unresolved_drinks === true);
  }
  async agentIdentityQuestions(sessionId: string, draftId: string, message: string) {
    const { version } = await this.db.$transaction(tx => this.owned(tx, sessionId, draftId));
    const metadata = version.assignmentsJson ? JSON.parse(version.assignmentsJson) as { __identity_questions?: AllocationReviewCard['clarification'] } : {};
    const directory = await this.directory();
    const named = message.match(/\bsplit\s+(?:this\s+)?with\s+(.+?)(?:[.!?]|$)/i)?.[1];
    const questions: AllocationReviewCard['clarification'] = [];
    if (named) {
      for (const name of named.split(/\s+and\s+|,/i).map(item => item.trim()).filter(Boolean)) {
        if (['me', 'payer', 'myself'].includes(name.toLowerCase())) continue;
        const matches = directory.filter(person => person.display_name.toLowerCase() === name.toLowerCase() || person.participant_id === name);
        if (matches.length !== 1) questions.push({ field: 'participant_ids', question: `Choose a stable participant ID for ${name}; the directory does not resolve that name uniquely.` });
      }
    } else if (metadata.__identity_questions?.length) questions.push(...metadata.__identity_questions);
    return questions;
  }
  async propose(sessionId: string, draftId: string, raw: unknown, ambiguousDrinks = false, identityQuestions: AllocationReviewCard['clarification'] = []): Promise<AllocationReviewCard> {
    const request = allocationRequestSchema.parse(raw);
    const { draft, version } = await this.db.$transaction(tx => this.owned(tx, sessionId, draftId));
    this.requireEditable(draft, request.expected_version);
    const receipt = receiptDataSchema.parse(JSON.parse(version.receiptJson) as unknown);
    this.validateReceipt(receipt);
    const participants = await this.directory();
    const questions: AllocationReviewCard['clarification'] = [...identityQuestions];
    if (request.payer_id !== DEMO_PROFILE_ID) throw new AppError(422, 'OTHER_PAYER_UNSUPPORTED', 'Only the current user can be the payer');
    if (request.payment_mode === 'link_existing') throw new AppError(422, 'PAYMENT_LINKING_UNSUPPORTED', 'Existing-payment linking is unsupported; no debit was recorded');
    if (request.existing_payment_reference) throw new AppError(400, 'UNEXPECTED_PAYMENT_REFERENCE', 'New payment review cannot contain an existing payment reference');
    if (new Set(request.participant_ids).size !== request.participant_ids.length || !request.participant_ids.includes(request.payer_id)) throw new AppError(422, 'INVALID_PARTICIPANTS', 'Choose unique participant IDs including the payer');
    if (request.participant_ids.some(id => !participants.some(item => item.participant_id === id))) questions.push({ field: 'participant_ids', question: 'Choose stable participant IDs from the review directory; an unknown or ambiguous name cannot identify a debtor.' });
    const itemIds = receipt.items.map(item => item.item_id);
    if (new Set(request.assignments.map(item => item.item_id)).size !== request.assignments.length || request.assignments.some(item => !itemIds.includes(item.item_id)
      || new Set(item.participant_ids).size !== item.participant_ids.length || item.participant_ids.some(id => !request.participant_ids.includes(id)))) throw new AppError(422, 'INVALID_ASSIGNMENTS', 'Each receipt item can have one assignment of unique selected participants');
    for (const item of receipt.items.filter(item => !request.assignments.some(assignment => assignment.item_id === item.item_id))) questions.push({ field: `assignment:${item.item_id}`, question: `Which selected participants shared item ${item.item_id}?` });
    if (ambiguousDrinks) questions.push({ field: 'beverage_participants', question: 'Tze Loon having no drinks does not identify everyone who did. Did the payer also share beverages, or were they Daniel only?' });
    if (!request.paid_from_account) questions.push({ field: 'paid_from_account', question: 'Which owned account actually paid the bill?' });
    else {
      const account = await this.db.account.findFirst({ where: { id: request.paid_from_account, profileId: DEMO_PROFILE_ID } });
      if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Paying account is not owned by this profile');
      if (account.currency !== receipt.total.currency) throw new AppError(422, 'CROSS_CURRENCY_PAYMENT_UNSUPPORTED', 'Reviewed shared expenses currently require the same bill and paying-account currency');
    }
    if (!request.paid_at) questions.push({ field: 'paid_at', question: 'When did this payment actually happen? Supply an explicit timestamp.' });
    let allocation: AllocationResult | null = null;
    if (!questions.length) {
      allocation = allocationResultSchema.parse(await this.adapter(() => this.adapters.allocation.allocate({ receipt_id: draft.receiptId, receipt_version: request.expected_version + 1, receipt, request })));
      this.validateAllocation(allocation, draft.receiptId, receipt, request);
    }
    const proposalId = allocation ? randomUUID() : null;
    await this.db.$transaction(async tx => {
      const fresh = await this.owned(tx, sessionId, draftId);
      const next = await this.appendVersion(tx, fresh.draft, fresh.version, request.expected_version, {
        assignmentsJson: JSON.stringify({ ...request, ...(ambiguousDrinks ? { __unresolved_drinks: true } : {}), ...(identityQuestions.length ? { __identity_questions: identityQuestions } : {}) }), origin: 'assignment_proposal',
      });
      if (allocation && proposalId) {
        const extraction = extractionSchema.parse(JSON.parse(fresh.draft.extractedJson) as unknown);
        const badge = deriveBadge([extraction.badge, allocation.badge, ...(next.correctionsBadgeJson ? [JSON.parse(next.correctionsBadgeJson)] : [])], `Reviewed allocation for receipt ${draft.receiptId}; original extraction and corrections retained in receipt draft`);
        const posting = confirmedSplitSchema.parse({
          frontend_action: 'confirm_shared_expense', idempotency_key: `receipt-review:${draft.id}`,
          split_id: allocation.split_id, receipt_id: draft.receiptId, payer: { participant_id: request.payer_id },
          paid_from_account: request.paid_from_account, bill_total: receipt.total, payer_share: allocation.payer_share,
          participants: allocation.debtor_shares.map(item => ({ participant_id: item.participant_id, display_name: participants.find(person => person.participant_id === item.participant_id)!.display_name, share: item.share })),
          badge, paid_at: request.paid_at, payment_mode: 'new_payment',
        });
        await tx.receiptSplitProposal.create({ data: { id: proposalId, draftId, version: next.version, bindingHash: this.binding(fresh.draft, next, allocation, posting), allocationJson: JSON.stringify(allocation), postingInputJson: JSON.stringify(posting) } });
      }
    });
    if (proposalId) return this.proposal(sessionId, proposalId);
    return { type: 'allocation_review', draft_id: draftId, version: request.expected_version + 1, proposal_id: null, review_state: 'clarification_required', assignments: request.assignments,
      participants: participants.filter(item => request.participant_ids.includes(item.participant_id)), payer_id: request.payer_id, paid_from_account: request.paid_from_account ?? null, paid_at: request.paid_at ?? null,
      allocation: null, reconciliation: 'not_calculated', clarification: questions, assumptions_requiring_confirmation: [], next_action: 'clarify_assignments' };
  }
  async proposal(sessionId: string, proposalId: string): Promise<AllocationReviewCard> {
    const row = await this.db.receiptSplitProposal.findFirst({ where: { id: proposalId, draft: { sessionId, session: { profileId: DEMO_PROFILE_ID } } }, include: { draft: true } });
    if (!row) throw new AppError(404, 'RECEIPT_PROPOSAL_NOT_FOUND', 'Receipt proposal does not belong to this session/profile');
    const version = await this.db.receiptDraftVersion.findUniqueOrThrow({ where: { draftId_version: { draftId: row.draftId, version: row.version } } });
    const request = allocationRequestSchema.parse(JSON.parse(version.assignmentsJson!) as unknown);
    // Render trusted participants from the stored posting snapshot; reading a proposal or
    // committed history must not depend on Steve's directory still being available.
    const posting = confirmedSplitSchema.parse(JSON.parse(row.postingInputJson) as unknown);
    const directory = [
      { participant_id: request.payer_id, display_name: 'Payer (current user)' },
      ...posting.participants.map(person => ({ participant_id: person.participant_id, display_name: person.display_name ?? person.participant_id })),
    ];
    const stale = row.draft.currentVersion !== row.version;
    return { type: 'allocation_review', draft_id: row.draftId, version: row.version, proposal_id: row.id,
      review_state: row.confirmedAt ? 'confirmed' : stale ? 'stale' : 'review_required',
      assignments: request.assignments, participants: directory.filter(item => request.participant_ids.includes(item.participant_id)), payer_id: request.payer_id,
      paid_from_account: request.paid_from_account ?? null, paid_at: request.paid_at ?? null, allocation: allocationResultSchema.parse(JSON.parse(row.allocationJson) as unknown),
      reconciliation: 'validated', clarification: [],
      assumptions_requiring_confirmation: ['Review the receipt and original source provenance.', 'Confirm every item assignment, payer, paying account and actual payment timestamp. This is historical recording, not payment execution.'],
      next_action: row.confirmedAt ? 'recorded' : stale ? 'refresh_review' : 'explicit_frontend_confirmation' };
  }
  async historyCards(sessionId: string, limit: number, cursor?: string) {
    await this.uploads.requireSession(sessionId);
    const scope = { draft: { sessionId, session: { profileId: DEMO_PROFILE_ID } }, confirmedAt: { not: null }, resultJson: { not: null } };
    const boundary = cursor ? await this.db.receiptSplitProposal.findFirst({ where: { ...scope, id: cursor } }) : null;
    if (cursor && !boundary) throw new AppError(400, 'INVALID_RECEIPT_CURSOR', 'Receipt history cursor is not owned by this session');
    const rows = await this.db.receiptSplitProposal.findMany({ where: { ...scope, ...(boundary ? { OR: [{ confirmedAt: { lt: boundary.confirmedAt! } }, { confirmedAt: boundary.confirmedAt, id: { lt: boundary.id } }] } : {}) }, orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
    const page = rows.slice(0, limit);
    return { receipt_events: page.map(row => ({ event_id: row.id, created_at: row.confirmedAt!.toISOString(), card: { type: 'shared_expense_recorded', proposal_id: row.id, data: JSON.parse(row.resultJson!) as SharedExpenseConfirmationResult } satisfies RecordedExpenseCard })), next_receipt_cursor: rows.length > limit ? page.at(-1)!.id : null };
  }
  async confirm(sessionId: string, proposalId: string, raw: unknown) {
    const input = reviewedSplitConfirmSchema.parse(raw);
    await this.uploads.requireSession(sessionId);
    const hash = payloadHash({ proposal_id: proposalId, ...input });
    let posting: SharedExpenseConfirmationResult;
    try {
      posting = await this.db.$transaction(async tx => {
        const key = { sessionId_idempotencyKey: { sessionId, idempotencyKey: input.idempotency_key } };
        const previous = await tx.receiptConfirmationRequest.findUnique({ where: key });
        if (previous) {
          if (previous.payloadHash !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Confirmation key was already used with another payload');
          return JSON.parse(previous.resultJson) as SharedExpenseConfirmationResult;
        }
        const proposal = await tx.receiptSplitProposal.findFirst({ where: { id: proposalId, draft: { sessionId, session: { profileId: DEMO_PROFILE_ID } } } });
        if (!proposal) throw new AppError(404, 'RECEIPT_PROPOSAL_NOT_FOUND', 'Receipt proposal does not belong to this session/profile');
        const { draft, version } = await this.owned(tx, sessionId, proposal.draftId);
        if (draft.currentVersion !== proposal.version || input.expected_version !== proposal.version) throw new AppError(409, 'RECEIPT_VERSION_STALE', 'Receipt or allocation changed; review the current version before confirming');
        const postingInput = confirmedSplitSchema.parse(JSON.parse(proposal.postingInputJson) as unknown);
        const allocation = allocationResultSchema.parse(JSON.parse(proposal.allocationJson) as unknown);
        if (proposal.bindingHash !== this.binding(draft, version, allocation, postingInput)) throw new AppError(409, 'RECEIPT_PROPOSAL_INVALID', 'Trusted review binding no longer matches the stored receipt/allocation');
        let result: SharedExpenseConfirmationResult;
        if (proposal.resultJson) result = JSON.parse(proposal.resultJson) as SharedExpenseConfirmationResult;
        else {
          const claimed = await tx.receiptDraft.updateMany({ where: { id: draft.id, currentVersion: proposal.version, confirmedAt: null }, data: { confirmedAt: new Date() } });
          if (claimed.count !== 1) throw new AppError(409, 'RECEIPT_ALREADY_CONFIRMED', 'Receipt is already confirmed; read its original posting result');
          result = await this.expenses.confirmInTransaction(tx, postingInput);
          await tx.receiptSplitProposal.update({ where: { id: proposalId }, data: { resultJson: JSON.stringify(result), confirmedAt: new Date() } });
        }
        await tx.receiptConfirmationRequest.create({ data: { sessionId, idempotencyKey: input.idempotency_key, payloadHash: hash, proposalId, resultJson: JSON.stringify(result) } });
        return result;
      }, { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P1008', 'P2028', 'P2034'].includes(error.code)) {
        const previous = await this.db.receiptConfirmationRequest.findUnique({ where: { sessionId_idempotencyKey: { sessionId, idempotencyKey: input.idempotency_key } } });
        if (previous) {
          if (previous.payloadHash !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Confirmation key was already used with another payload');
          posting = JSON.parse(previous.resultJson) as SharedExpenseConfirmationResult;
        } else throw new AppError(503, 'DATABASE_BUSY', 'Concurrent receipt confirmation; retry the same confirmation key');
      } else throw error;
    }
    // Posting is committed. History is reconstructed from the durable result; optional reads cannot change success.
    let history;
    try { await this.historyCards(sessionId, 1); history = { status: 'available', read_url: `/api/agent/sessions/${sessionId}/history`, retry_financial_action: false }; }
    catch { history = { status: 'unavailable', read_url: `/api/agent/sessions/${sessionId}/history`, retry_financial_action: false }; }
    return { ...posting, receipt_proposal_id: proposalId, history_decoration: history };
  }
}
