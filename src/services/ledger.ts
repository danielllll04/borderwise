import { randomUUID } from 'node:crypto';
import { payloadHash as hashPayload } from '../domain/idempotency.js';
import { Prisma, type PrismaClient, type Profile, type Account } from '@prisma/client';
import type { AccountId } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { deriveBadge, financialValue, readBadge, type FinancialValue } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';
import type { Badge, Currency, LedgerEntry, Money, RateSnapshot, Receivable } from '../shared/models.js';
import { postingSchema, type PostingInput } from './posting-inputs.js';
import { accountResponse, ledgerContract, receivableContract, type AccountResponse } from './serialization.js';
import { budgetResponse } from './budget.js';
import type { SharedExpenseDetails } from './shared-expenses.js';
import { ASSESSMENT_FOLLOW_UP } from './post-action-follow-up.js';

export interface PostingResult {
  activity_id: string;
  entries: LedgerEntry[];
  balances: AccountResponse[];
  shared_expense?: SharedExpenseDetails;
  pending_plan_follow_up?: typeof ASSESSMENT_FOLLOW_UP;
  settlement?: {
    receivable: Receivable;
    amount_badge: Badge;
    cleared: FinancialValue;
    received: FinancialValue;
    remaining: FinancialValue;
  };
}

interface DraftEntry {
  type: LedgerEntry['type'];
  badge: Badge;
  lines: { account: AccountId; Money: Money }[];
}

/** One transaction's recorded balances/reserves, reusable for a read-only assessment batch. */
export interface FinancialSnapshot { profile: Profile; accounts: Account[] }

function sameCurrency(left: Money, right: Money): void {
  if (left.currency === right.currency && left.amount_minor !== right.amount_minor) {
    throw new AppError(422, 'PRINCIPAL_MISMATCH', 'Same-currency principal and received amounts must match; record fees separately');
  }
}

function validateSnapshot(snapshot: RateSnapshot | undefined, from: Currency, to: Currency): void {
  if (snapshot && snapshot.pair !== `${from}/${to}`) {
    throw new AppError(422, 'RATE_PAIR_MISMATCH', 'The supplied rate snapshot must describe source/receiving currencies');
  }
  // No multiplication: actual user-reported received amounts are authoritative.
}

/** Sole writer of balances/ledger. Trusted workflow adapters compose transaction-bound methods. */
export class LedgerService {
  constructor(private readonly db: PrismaClient) {}

  async post(rawInput: PostingInput): Promise<PostingResult> {
    const input = postingSchema.parse(rawInput);
    const payloadHash = hashPayload(input);
    try {
      return await this.db.$transaction(tx => this.postInTransaction(tx, input), { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // A simultaneous identical request may win the unique-key race or SQLite write lock.
        if (['P2002', 'P1008', 'P2028', 'P2034'].includes(error.code)) {
          const previous = await this.db.activity.findUnique({ where: { idempotencyKey: input.idempotency_key } });
          if (previous) return this.replay(previous, payloadHash);
          if (input.kind === 'shared_expense') {
            const duplicate = await this.db.sharedExpense.findFirst({ where: {
              profileId: input.profile_id, OR: [{ splitId: input.split_id }, { receiptId: input.receipt_id }],
            } });
            if (duplicate) throw new AppError(409, 'SPLIT_ALREADY_RECORDED', 'This split or receipt payment is already allocated; do not submit it with another key');
          }
          throw new AppError(503, 'DATABASE_BUSY', 'Concurrent database activity; retry with the same idempotency key');
        }
      }
      throw error;
    }
  }

  /** Read-only validation and account projections, shared by previews and posting. */
  async prepareInTransaction(tx: Prisma.TransactionClient, rawInput: PostingInput) {
    const prepared = await this.projectInTransaction(tx, rawInput);
    for (const change of prepared.changes) {
      if (change.next < 0n) {
        if (rawInput.kind === 'shared_expense') throw new AppError(409, 'RECONCILIATION_REQUIRED', 'This historical payment exceeds tracked funds. Correct the recorded balance through an explicit supported reconciliation process before retrying; no adjustment or income was fabricated');
        throw new AppError(409, 'INSUFFICIENT_FUNDS', `Activity would make ${change.account.displayName} negative`);
      }
    }
    return prepared;
  }

  /** Forecast only: negative projections are returned, never permitted by prepare/post. */
  async projectInTransaction(tx: Prisma.TransactionClient, rawInput: PostingInput, snapshot?: FinancialSnapshot) {
    const input = postingSchema.parse(rawInput);
    const profile = snapshot?.profile ?? await tx.profile.findUnique({ where: { id: input.profile_id } });
    if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Financial profile does not exist; run the seed command');
    if (profile.id !== input.profile_id) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Snapshot belongs to a different financial profile');
    const accounts = snapshot?.accounts ?? await tx.account.findMany({ where: { profileId: input.profile_id }, orderBy: { id: 'asc' } });
    const byId = new Map(accounts.map(account => [account.id, account]));
    const drafts: DraftEntry[] = [];
    const addLine = (account: AccountId, money: Money, negative = false) => {
      const stored = byId.get(account);
      if (!stored || stored.profileId !== input.profile_id) throw new AppError(404, 'ACCOUNT_NOT_FOUND', `Account ${account} does not belong to this profile`);
      if (stored.currency !== money.currency) throw new AppError(422, 'CURRENCY_MISMATCH', `Account ${account} uses ${stored.currency}`);
      return { account, Money: { ...money, amount_minor: negative ? safeNumber(-BigInt(money.amount_minor)) : money.amount_minor } };
    };

    let receivable: Awaited<ReturnType<typeof tx.receivable.findUnique>> = null;
    if (input.kind === 'shared_expense') {
      if (input.payer.participant_id !== input.profile_id) {
        throw new AppError(422, 'OTHER_PAYER_UNSUPPORTED', 'Only a payment made by the current user can be recorded; another payer must not debit this profile');
      }
      if (input.payment_mode === 'link_existing') {
        if (!input.existing_payment_reference) throw new AppError(400, 'PAYMENT_REFERENCE_REQUIRED', 'Linking requires an existing payment reference');
        throw new AppError(422, 'PAYMENT_LINKING_UNSUPPORTED', 'No compatible standalone payment representation exists yet; linking is not supported and no debit was recorded');
      }
      if (input.existing_payment_reference) throw new AppError(400, 'UNEXPECTED_PAYMENT_REFERENCE', 'A new payment cannot include an existing payment reference');
      const account = byId.get(input.paid_from_account);
      if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Paying account does not belong to this profile');
      if (account.currency !== input.bill_total.currency) {
        throw new AppError(422, 'CROSS_CURRENCY_PAYMENT_UNSUPPORTED', 'Bill currency and actual funding debit differ; this handover supports same-currency payments only and never derives an actual debit from a rate');
      }
      if (input.payer_share.currency !== input.bill_total.currency || input.participants.some(item => item.share.currency !== input.bill_total.currency)) {
        throw new AppError(422, 'CURRENCY_MISMATCH', 'All allocations must use the original bill currency');
      }
      const ids = input.participants.map(item => item.participant_id);
      if (new Set(ids).size !== ids.length || ids.includes(input.payer.participant_id)) {
        throw new AppError(422, 'INVALID_PARTICIPANTS', 'Participant IDs must be unique and exclude the payer');
      }
      const allocated = BigInt(input.payer_share.amount_minor) + input.participants.reduce((sum, item) => sum + BigInt(item.share.amount_minor), 0n);
      if (allocated !== BigInt(input.bill_total.amount_minor)) {
        throw new AppError(422, 'ALLOCATION_MISMATCH', 'Payer share plus participant shares must equal the original bill exactly');
      }
      const duplicate = await tx.sharedExpense.findFirst({ where: {
        profileId: input.profile_id, OR: [{ splitId: input.split_id }, { receiptId: input.receipt_id }],
      } });
      if (duplicate) throw new AppError(409, 'SPLIT_ALREADY_RECORDED', 'This split or receipt payment is already allocated; do not submit it with another key');
      drafts.push({ type: 'shared_expense', badge: input.badge, lines: [addLine(input.paid_from_account, input.bill_total, true)] });
    } else if (input.kind === 'income') {
      drafts.push({ type: 'income', badge: input.badge, lines: [addLine(input.account_id, input.amount)] });
    } else if (input.kind === 'settlement') {
      receivable = await tx.receivable.findUnique({ where: { id: input.receivable_id } });
      if (!receivable || receivable.profileId !== input.profile_id) throw new AppError(404, 'RECEIVABLE_NOT_FOUND', 'Receivable does not belong to this profile');
      if (receivable.currency !== input.amount_cleared.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Clear the receivable in its original receipt currency');
      if (receivable.settledMinor + BigInt(input.amount_cleared.amount_minor) > receivable.originalAmountMinor) {
        throw new AppError(409, 'OVER_SETTLEMENT', 'Settlement exceeds the remaining receivable');
      }
      sameCurrency(input.amount_cleared, input.amount_received);
      validateSnapshot(input.rate_snapshot, input.amount_cleared.currency, input.amount_received.currency);
      drafts.push({ type: 'settlement', badge: input.badge, lines: [addLine(input.receiving_account, input.amount_received)] });
    } else {
      if (input.source_account === input.destination_account) throw new AppError(422, 'SAME_ACCOUNT', 'Source and destination accounts must differ');
      if (input.kind === 'exchange' && input.principal.currency === input.received.currency) {
        throw new AppError(422, 'EXCHANGE_CURRENCY_MISMATCH', 'An exchange must use different currencies');
      }
      sameCurrency(input.principal, input.received);
      validateSnapshot(input.rate_snapshot, input.principal.currency, input.received.currency);
      drafts.push({
        type: input.kind, badge: input.badge,
        lines: [addLine(input.source_account, input.principal, true), addLine(input.destination_account, input.received)],
      });
    }

    if (input.kind !== 'income' && input.kind !== 'shared_expense') {
      for (const fee of input.fees) {
        drafts.push({ type: 'fee', badge: fee.badge, lines: [addLine(fee.account_id, fee.Money, true)] });
      }
    }

    const deltas = new Map<string, bigint>();
    const accountInputs = new Map<string, Badge[]>();
    for (const draft of drafts) {
      for (const line of draft.lines) {
        deltas.set(line.account, (deltas.get(line.account) ?? 0n) + BigInt(line.Money.amount_minor));
        accountInputs.set(line.account, [...(accountInputs.get(line.account) ?? []), draft.badge]);
      }
    }

    const changes = [...deltas].map(([id, delta]) => {
      const account = byId.get(id)!;
      const next = account.balanceMinor + delta;
      safeNumber(next);
      const lines = drafts.flatMap(draft => draft.lines).filter(line => line.account === id);
      const debit = lines.reduce((sum, line) => sum + (line.Money.amount_minor < 0 ? -BigInt(line.Money.amount_minor) : 0n), 0n);
      const credit = lines.reduce((sum, line) => sum + (line.Money.amount_minor > 0 ? BigInt(line.Money.amount_minor) : 0n), 0n);
      return { account, delta, next, debit, credit, inputBadges: accountInputs.get(id)! };
    });
    return { profile, accounts, byId, drafts, deltas, accountInputs, receivable, changes };
  }

  /** Trusted caller owns the transaction: ledger posting and plan completion commit together. */
  async postInTransaction(tx: Prisma.TransactionClient, rawInput: PostingInput): Promise<PostingResult> {
    const input = postingSchema.parse(rawInput);
    const payloadHash = hashPayload(input);
    const previous = await tx.activity.findUnique({ where: { idempotencyKey: input.idempotency_key } });
    if (previous) return this.replay(previous, payloadHash);

    const { profile, byId, drafts, deltas, accountInputs, receivable } = await this.prepareInTransaction(tx, input);
    const activityId = randomUUID();
    const provenance = [];
    for (const [id, delta] of deltas) {
      const account = byId.get(id)!;
      const next = account.balanceMinor + delta;
      if (next < 0n) throw new AppError(409, 'INSUFFICIENT_FUNDS', `Activity would make ${account.displayName} negative`);
      safeNumber(next);
      const inputs = [readBadge(account.balanceBadgeJson), ...accountInputs.get(id)!];
      const badge = deriveBadge(inputs, `Previous ${account.displayName} balance + signed ledger lines for activity ${activityId}; includes principal and separate fees`);
      provenance.push({ account_id: id, previous_balance_minor: safeNumber(account.balanceMinor), delta_minor: delta.toString(), input_badges: inputs });
      // Compare-and-update also guards concurrent writers. All mutations roll back together.
      const updated = await tx.account.updateMany({
        where: { id, balanceMinor: account.balanceMinor },
        data: { balanceMinor: next, balanceBadgeJson: JSON.stringify(badge), balanceProvenanceJson: JSON.stringify({ activity_id: activityId, input_badges: inputs }) },
      });
      if (updated.count !== 1) throw new AppError(409, 'CONCURRENT_UPDATE', 'Balance changed concurrently; retry with the same idempotency key');
    }
    await tx.activity.create({ data: {
      id: activityId, profileId: input.profile_id, kind: input.kind,
      idempotencyKey: input.idempotency_key, payloadHash, inputJson: JSON.stringify(input),
      inputProvenanceJson: JSON.stringify(provenance), resultJson: '{}',
    } });
    const entries: LedgerEntry[] = [];
    for (const draft of drafts) {
      const entry = await tx.ledgerEntry.create({ data: {
        id: randomUUID(), profileId: input.profile_id, activityId, type: draft.type,
        badgeJson: JSON.stringify(draft.badge),
        lines: { create: draft.lines.map(line => ({ id: randomUUID(), accountId: line.account, amountMinor: BigInt(line.Money.amount_minor), currency: line.Money.currency })) },
      }, include: { lines: true } });
      entries.push(ledgerContract(entry));
    }
    const result: PostingResult = {
      activity_id: activityId, entries,
      balances: (await tx.account.findMany({ where: { profileId: input.profile_id }, orderBy: { id: 'asc' } })).map(accountResponse),
    };
    if (input.kind === 'shared_expense' || input.kind === 'settlement') result.pending_plan_follow_up = ASSESSMENT_FOLLOW_UP;
    if (input.kind === 'shared_expense') {
      const postingId = randomUUID();
      const entryId = entries[0]!.entry_id;
      await tx.sharedExpense.create({ data: {
        id: postingId, profileId: input.profile_id, splitId: input.split_id, receiptId: input.receipt_id,
        activityId, ledgerEntryId: entryId, payerId: input.payer.participant_id,
        paidFromAccount: input.paid_from_account, currency: input.bill_total.currency,
        billTotalMinor: BigInt(input.bill_total.amount_minor), payerShareMinor: BigInt(input.payer_share.amount_minor),
        paidAt: new Date(input.paid_at),
      } });
      const receivables: SharedExpenseDetails['receivables'] = [];
      // A same-currency identity snapshot satisfies the existing shared Receivable contract.
      // It is not a conversion or an inferred funding debit. Original FX context stays in inputJson.
      const snapshot: RateSnapshot = {
        pair: `${input.bill_total.currency}/${input.bill_total.currency}`, rate: '1',
        badge: deriveBadge([input.badge], 'Original-currency receivable identity snapshot; no currency conversion'),
      };
      for (const participant of input.participants) {
        const row = await tx.receivable.create({ data: {
          id: randomUUID(), profileId: input.profile_id, debtor: participant.display_name ?? participant.participant_id,
          originalAmountMinor: BigInt(participant.share.amount_minor), currency: participant.share.currency,
          snapshotJson: JSON.stringify(snapshot), amountBadgeJson: JSON.stringify(input.badge),
        } });
        await tx.sharedExpenseAllocation.create({ data: {
          id: randomUUID(), sharedExpenseId: postingId, participantId: participant.participant_id,
          shareMinor: row.originalAmountMinor, receivableId: row.id,
        } });
        receivables.push({ participant_id: participant.participant_id, receivable: receivableContract(row), amount_badge: input.badge });
      }
      const funding = await tx.account.findUniqueOrThrow({ where: { id: 'myr_funding' } });
      result.shared_expense = {
        posting_id: postingId, split_id: input.split_id, receipt_id: input.receipt_id,
        paid_from_account: input.paid_from_account,
        bill_total: financialValue(input.bill_total.amount_minor, input.bill_total.currency, input.badge),
        recorded_debit: financialValue(input.bill_total.amount_minor, input.bill_total.currency, input.badge),
        personal_expense: financialValue(input.payer_share.amount_minor, input.payer_share.currency, input.badge),
        receivables_total: financialValue(safeNumber(BigInt(input.bill_total.amount_minor) - BigInt(input.payer_share.amount_minor)), input.bill_total.currency, input.badge),
        receivables, ledger_entry_ids: [entryId], paid_at: input.paid_at, payment_mode: 'new_payment',
        provenance: input.badge,
        confirmation: { frontend_action: input.frontend_action, acknowledged: true, recorded_at: new Date().toISOString() },
        budget: budgetResponse(profile, funding),
      };
    }
    if (input.kind === 'settlement' && receivable) {
      const settled = receivable.settledMinor + BigInt(input.amount_cleared.amount_minor);
      const changed = await tx.receivable.updateMany({
        where: { id: receivable.id, settledMinor: receivable.settledMinor }, data: { settledMinor: settled },
      });
      if (changed.count !== 1) throw new AppError(409, 'CONCURRENT_UPDATE', 'Receivable changed concurrently; retry with the same idempotency key');
      await tx.settlement.create({ data: {
        id: randomUUID(), activityId, receivableId: receivable.id,
        clearingMinor: BigInt(input.amount_cleared.amount_minor), clearingCurrency: input.amount_cleared.currency,
        receivedMinor: BigInt(input.amount_received.amount_minor), receivedCurrency: input.amount_received.currency,
        receivingAccountId: input.receiving_account,
      } });
      const historical = await tx.settlement.findMany({
        where: { receivableId: receivable.id }, include: { activity: { select: { inputJson: true } } },
      });
      const remainingInputs = [readBadge(receivable.amountBadgeJson), ...historical.map(item => (JSON.parse(item.activity.inputJson) as PostingInput).badge)];
      result.settlement = {
        receivable: receivableContract({ ...receivable, settledMinor: settled }),
        amount_badge: readBadge(receivable.amountBadgeJson),
        cleared: financialValue(input.amount_cleared.amount_minor, input.amount_cleared.currency, input.badge),
        received: financialValue(input.amount_received.amount_minor, input.amount_received.currency, input.badge),
        remaining: financialValue(safeNumber(receivable.originalAmountMinor - settled), receivable.currency as Currency,
          deriveBadge(remainingInputs, 'Original receivable amount - sum of confirmed settlement clearing amounts in original receipt currency')),
      };
    }
    await tx.activity.update({ where: { id: activityId }, data: { resultJson: JSON.stringify(result) } });
    return result;
  }

  private replay(previous: { payloadHash: string; resultJson: string }, payloadHash: string): PostingResult {
    if (previous.payloadHash !== payloadHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload');
    return JSON.parse(previous.resultJson) as PostingResult;
  }
}
