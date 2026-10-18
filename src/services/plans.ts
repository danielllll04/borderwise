import { randomUUID } from 'node:crypto';
import { Prisma, type PlanRecord, type PrismaClient } from '@prisma/client';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { payloadHash } from '../domain/idempotency.js';
import { deriveBadge, financialValue, type FinancialValue } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';
import { actualActivity, quoteActivity } from '../integrations/compare-adapter.js';
import type { Badge, Money, Plan } from '../shared/models.js';
import { LedgerService } from './ledger.js';
import { assessActivity, type ActivityAssessment } from './plan-preview.js';
import {
  actualSchema, confirmPlanSchema, listPlansSchema, savePlanSchema, selectionSchema,
  type ActualActivity, type ReserveAcknowledgement, type Selection,
} from './plan-inputs.js';

interface CompletionMetadata {
  actual: ActualActivity;
  badge: Badge;
  completed_at: string;
  recorded_at: string;
  activity_id: string;
  ledger_entry_ids: string[];
}

function view(row: PlanRecord) {
  const plan: Plan = {
    plan_id: row.id, quote: JSON.parse(row.quoteJson) as Plan['quote'],
    status: row.status as Plan['status'], reserve_breached: row.reserveBreached,
  };
  return {
    plan,
    context: JSON.parse(row.contextJson) as Selection['context'],
    created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    cancelled_at: row.cancelledAt?.toISOString() ?? null,
    checks: {
      saved: (JSON.parse(row.saveCheckJson) as ActivityAssessment).response,
      completion: row.completionCheckJson ? (JSON.parse(row.completionCheckJson) as ActivityAssessment).response : null,
    },
    completion: row.completionJson ? JSON.parse(row.completionJson) as CompletionMetadata : null,
  };
}

export type PlanResponse = ReturnType<typeof view>;
export type ConfirmedPlanResponse = Awaited<ReturnType<PlanService['confirm']>>;

function requireAcknowledgement(check: ActivityAssessment, acknowledgement?: ReserveAcknowledgement) {
  if (acknowledgement && acknowledgement.check_token !== check.response.check_token) {
    throw new AppError(409, 'STALE_RESERVE_CHECK', 'Amounts, balances or reserves have changed; review the current preview and acknowledge it again', { preview: check.response });
  }
  if (check.response.requires_reserve_acknowledgement && !acknowledgement) {
    throw new AppError(409, 'RESERVE_ACKNOWLEDGEMENT_REQUIRED', 'Explicitly acknowledge the reserve warning for these amounts and current balances', { preview: check.response });
  }
  return acknowledgement ? JSON.stringify({
    ...acknowledgement, acknowledged_at: new Date().toISOString(),
    checked_amounts: check.response, input_provenance: check.input_provenance,
  }) : null;
}

function moneyDifference(quoted: Money, actual: Money, quotedBadge: Badge, actualBadge: Badge) {
  return {
    quoted: financialValue(quoted.amount_minor, quoted.currency, quotedBadge),
    actual: financialValue(actual.amount_minor, actual.currency, actualBadge),
    currency_changed: quoted.currency !== actual.currency,
    difference: quoted.currency === actual.currency
      ? financialValue(safeNumber(BigInt(actual.amount_minor) - BigInt(quoted.amount_minor)), actual.currency,
        deriveBadge([quotedBadge, actualBadge], 'Actual amount - saved quote amount in the same currency')) : null,
  };
}

function differences(selection: Selection, actual: ActualActivity, actualBadge: Badge, actualTotalDebit: FinancialValue) {
  const quoted = quoteActivity(selection);
  return {
    principal: moneyDifference(quoted.principal, actual.principal, quoted.badge, actualBadge),
    total_debit: moneyDifference(selection.quote.total_debit, actualTotalDebit.Money, quoted.badge, actualTotalDebit.badge),
    amount_received: moneyDifference(quoted.received, actual.amount_received, quoted.badge, actualBadge),
    fees: {
      quoted: quoted.fees.map(fee => ({ label: fee.label, account_id: fee.account_id, ...financialValue(fee.Money.amount_minor, fee.Money.currency, fee.badge) })),
      actual: actual.fees.map(fee => ({ label: fee.label, account_id: fee.account_id, ...financialValue(fee.Money.amount_minor, fee.Money.currency, actualBadge) })),
      changed: payloadHash(quoted.fees.map(({ label, account_id, Money }) => ({ label, account_id, Money }))) !== payloadHash(actual.fees),
    },
    funding_account: { quoted: quoted.source_account, actual: actual.funding_account, changed: quoted.source_account !== actual.funding_account },
    destination_account: { quoted: quoted.destination_account, actual: actual.destination_account, changed: quoted.destination_account !== actual.destination_account },
    rate: { quoted: { rate: selection.quote.rate, badge: selection.quote.badge }, actual_snapshot: actual.rate_snapshot ?? null },
  };
}

export class PlanService {
  private readonly ledger: LedgerService;

  constructor(private readonly db: PrismaClient) {
    this.ledger = new LedgerService(db);
  }

  /** Stateless preview: no plan, acknowledgement or other financial state is saved. */
  async preview(raw: unknown) {
    const selection = selectionSchema.parse(raw);
    const activity = quoteActivity(selection);
    return this.db.$transaction(async tx => (await assessActivity(tx, this.ledger, activity, {
      stage: 'save', binding: selection, feeBehavior: selection.context.fee_behavior,
    })).response);
  }

  async save(raw: unknown, expectedPreviewToken?: string) {
    const input = savePlanSchema.parse(raw);
    const workflowPayload = expectedPreviewToken ? { ...input, expected_preview_token: expectedPreviewToken } : input;
    return this.workflow('create-plan', input.idempotency_key, workflowPayload, async tx => {
      const activity = quoteActivity(input.selection);
      const check = await assessActivity(tx, this.ledger, activity, {
        stage: 'save', binding: input.selection, feeBehavior: input.selection.context.fee_behavior,
      });
      if (expectedPreviewToken && expectedPreviewToken !== check.response.check_token) {
        throw new AppError(409, 'PROPOSAL_STALE', 'Relevant balances or reserves changed. Re-preview this proposal before tapping Save.', { preview: check.response });
      }
      const acknowledgement = requireAcknowledgement(check, input.reserve_acknowledgement);
      const row = await tx.planRecord.create({ data: {
        id: randomUUID(), profileId: DEMO_PROFILE_ID, quoteJson: JSON.stringify(input.selection.quote),
        contextJson: JSON.stringify(input.selection.context), status: 'pending',
        reserveBreached: check.response.requires_reserve_acknowledgement,
        saveCheckJson: JSON.stringify(check), saveAcknowledgementJson: acknowledgement,
      } });
      return view(row);
    });
  }

  async read(planId: string) {
    return this.db.$transaction(async tx => view(await this.requirePlan(tx, planId)));
  }

  async list(raw: unknown) {
    const query = listPlansSchema.parse(raw);
    return this.db.$transaction(async tx => {
      const boundary = query.cursor ? await tx.planRecord.findUnique({ where: { id: query.cursor } }) : null;
      if (query.cursor && (!boundary || boundary.profileId !== DEMO_PROFILE_ID)) throw new AppError(400, 'INVALID_CURSOR', 'Plan cursor does not exist for this profile');
      if (boundary && query.status && boundary.status !== query.status) throw new AppError(400, 'INVALID_CURSOR', 'Plan cursor no longer matches the status filter; restart pagination');
      const rows = await tx.planRecord.findMany({
        where: { profileId: DEMO_PROFILE_ID, ...(query.status ? { status: query.status } : {}),
          ...(boundary ? { OR: [{ createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } }] } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      return { items: page.map(view), next_cursor: rows.length > query.limit ? page.at(-1)!.id : null };
    });
  }

  async cancel(planId: string) {
    return this.db.$transaction(async tx => {
      const row = await this.requirePlan(tx, planId);
      if (row.status === 'cancelled') return view(row);
      this.requirePending(row);
      const changed = await tx.planRecord.updateMany({ where: { id: planId, status: 'pending' }, data: { status: 'cancelled', cancelledAt: new Date() } });
      if (changed.count !== 1) throw new AppError(409, 'PLAN_NOT_PENDING', 'Plan changed concurrently; read its current status');
      return view(await this.requirePlan(tx, planId));
    });
  }

  async completionPreview(planId: string, raw: unknown) {
    const actual = actualSchema.parse(raw);
    return this.db.$transaction(async tx => {
      const row = await this.requirePlan(tx, planId);
      this.requirePending(row);
      return (await this.completionAssessment(tx, row, actual)).response;
    });
  }

  async confirm(planId: string, raw: unknown) {
    const input = confirmPlanSchema.parse(raw);
    return this.workflow('confirm-plan', input.idempotency_key, { plan_id: planId, ...input }, async tx => {
      const row = await this.requirePlan(tx, planId);
      this.requirePending(row);
      const check = await this.completionAssessment(tx, row, input.actual);
      const acknowledgement = requireAcknowledgement(check, input.reserve_acknowledgement);
      // Claim within the transaction. Any later failure rolls this change back with ledger writes.
      const claimed = await tx.planRecord.updateMany({ where: { id: planId, status: 'pending' }, data: { status: 'completed' } });
      if (claimed.count !== 1) throw new AppError(409, 'PLAN_NOT_PENDING', 'Another confirmation or cancellation already changed this plan');
      const activity = actualActivity(input.actual, planId);
      const posting = await this.ledger.postInTransaction(tx, activity);
      const completion: CompletionMetadata = {
        actual: input.actual, badge: activity.badge, completed_at: input.actual.completed_at,
        recorded_at: new Date().toISOString(), activity_id: posting.activity_id,
        ledger_entry_ids: posting.entries.map(entry => entry.entry_id),
      };
      const completed = await tx.planRecord.update({ where: { id: planId }, data: {
        status: 'completed', reserveBreached: check.response.requires_reserve_acknowledgement,
        completionCheckJson: JSON.stringify(check), completionAcknowledgementJson: acknowledgement,
        completionActivityId: posting.activity_id, completionJson: JSON.stringify(completion),
      } });
      return { ...view(completed), posting };
    });
  }

  private async completionAssessment(tx: Prisma.TransactionClient, row: PlanRecord, actual: ActualActivity) {
    const selection = selectionSchema.parse({ quote: JSON.parse(row.quoteJson) as unknown, context: JSON.parse(row.contextJson) as unknown });
    const quoted = quoteActivity(selection);
    if (actual.activity_type !== quoted.kind) throw new AppError(422, 'ACTIVITY_TYPE_MISMATCH', 'Actual activity must match the saved plan objective; create a new plan for another objective');
    const activity = actualActivity(actual, row.id);
    const check = await assessActivity(tx, this.ledger, activity, { stage: 'completion', binding: { plan_id: row.id, actual } });
    return { ...check, response: { ...check.response, differences: differences(selection, actual, activity.badge, check.response.total_debit) } };
  }

  private async requirePlan(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.planRecord.findUnique({ where: { id } });
    if (!row || row.profileId !== DEMO_PROFILE_ID) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan does not exist for the demo profile');
    return row;
  }

  private requirePending(row: PlanRecord) {
    if (row.status !== 'pending') throw new AppError(409, 'PLAN_NOT_PENDING', `Plan is ${row.status}; only pending plans can be completed or cancelled`);
  }

  /** Workflow replay is scoped by operation; payload includes plan ID for confirmations. */
  private async workflow<T>(operation: string, key: string, payload: unknown, execute: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const hash = payloadHash(payload);
    const where = { operation_idempotencyKey: { operation, idempotencyKey: key } };
    const replay = (record: { payloadHash: string; resultJson: string }): T => {
      if (record.payloadHash !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This workflow key was already used with a different payload');
      return JSON.parse(record.resultJson) as T;
    };
    try {
      return await this.db.$transaction(async tx => {
        const previous = await tx.workflowRequest.findUnique({ where });
        if (previous) return replay(previous);
        const result = await execute(tx);
        await tx.workflowRequest.create({ data: { operation, idempotencyKey: key, payloadHash: hash, resultJson: JSON.stringify(result) } });
        return result;
      }, { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P1008', 'P2028', 'P2034'].includes(error.code)) {
        const previous = await this.db.workflowRequest.findUnique({ where });
        if (previous) return replay(previous);
        throw new AppError(503, 'DATABASE_BUSY', 'Concurrent workflow activity; retry with the same idempotency key');
      }
      throw error;
    }
  }
}
