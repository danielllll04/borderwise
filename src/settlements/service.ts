import type { Prisma, PrismaClient } from '@prisma/client';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { payloadHash } from '../domain/idempotency.js';
import { readBadge } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';
import { LedgerService } from '../services/ledger.js';
import { settlementSchema } from '../services/posting-inputs.js';
import { accountResponse, receivableContract } from '../services/serialization.js';
import { confirmRepaymentSchema, receivableQuery, settlementHistoryQuery } from './contracts.js';

const include = { sharedAllocation: { include: { sharedExpense: { select: {
  id: true, splitId: true, receiptId: true, payerId: true,
} } } } } as const;
type Debt = Prisma.ReceivableGetPayload<{ include: typeof include }>;

/** Node is the sole outstanding-debt authority. No Python state, rate lookup or bridge writes. */
export class SettlementService {
  private readonly ledger: LedgerService;
  constructor(private readonly db: PrismaClient) { this.ledger = new LedgerService(db); }

  private async owned(tx: Prisma.TransactionClient, id: string): Promise<Debt> {
    const row = await tx.receivable.findFirst({ where: { id, profileId: DEMO_PROFILE_ID }, include });
    if (!row) throw new AppError(404, 'RECEIVABLE_NOT_FOUND', 'Receivable does not belong to the current profile');
    return row;
  }

  private view(row: Debt) {
    if (row.settledMinor < 0n || row.settledMinor > row.originalAmountMinor) throw new AppError(409, 'RECEIVABLE_RECONCILIATION_REQUIRED', 'Recorded debt clearance is inconsistent; review the authoritative records');
    const receivable = receivableContract(row);
    const currency = receivable.amount.currency;
    return {
      authority: 'node_ledger' as const, receivable,
      participant_id: row.sharedAllocation?.participantId ?? null,
      split_id: row.sharedAllocation?.sharedExpense.splitId ?? null,
      receipt_id: row.sharedAllocation?.sharedExpense.receiptId ?? null,
      shared_expense_id: row.sharedAllocation?.sharedExpense.id ?? null,
      identity_link: row.sharedAllocation ? 'shared_expense_participant' as const : 'legacy_unlinked' as const,
      original_amount: receivable.amount,
      cleared_amount: { amount_minor: safeNumber(row.settledMinor), currency },
      outstanding_amount: { amount_minor: safeNumber(row.originalAmountMinor - row.settledMinor), currency },
      status: row.settledMinor === row.originalAmountMinor ? 'settled' as const : row.settledMinor === 0n ? 'open' as const : 'partial' as const,
      provenance: { original_debt: readBadge(row.amountBadgeJson), calculation: 'Original debt minus committed clearance amounts in the original currency; individual repayment provenance is retained in settlement history.' },
      settlement_history_url: `/api/receivables/${encodeURIComponent(row.id)}/settlements`,
    };
  }

  async read(receivableId: string) {
    return this.db.$transaction(async tx => this.view(await this.owned(tx, receivableId)));
  }

  async list(raw: unknown) {
    const query = receivableQuery.parse(raw);
    const where: Prisma.ReceivableWhereInput = {
      profileId: DEMO_PROFILE_ID,
      ...(query.status === 'outstanding' ? { settledMinor: { lt: this.db.receivable.fields.originalAmountMinor } }
        : query.status === 'settled' ? { settledMinor: { equals: this.db.receivable.fields.originalAmountMinor } } : {}),
      ...(query.participant_id || query.split_id || query.receipt_id ? { sharedAllocation: { is: {
        ...(query.participant_id ? { participantId: query.participant_id } : {}),
        sharedExpense: { is: { profileId: DEMO_PROFILE_ID,
          ...(query.split_id ? { splitId: query.split_id } : {}), ...(query.receipt_id ? { receiptId: query.receipt_id } : {}) } },
      } } } : {}),
    };
    return this.db.$transaction(async tx => {
      if (query.cursor && !await tx.receivable.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })) throw new AppError(400, 'INVALID_CURSOR', 'Receivable cursor does not match this profile/filter; refresh the list');
      const rows = await tx.receivable.findMany({ where: { ...where, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, include, orderBy: { id: 'asc' }, take: query.limit + 1 });
      const page = rows.slice(0, query.limit);
      return { authority: 'node_ledger' as const, items: page.map(row => this.view(row)), next_cursor: rows.length > query.limit ? page.at(-1)!.id : null };
    });
  }

  async history(receivableId: string, raw: unknown) {
    const query = settlementHistoryQuery.parse(raw);
    return this.db.$transaction(async tx => {
      await this.owned(tx, receivableId);
      const scope = { receivableId, activity: { profileId: DEMO_PROFILE_ID } };
      const boundary = query.cursor ? await tx.settlement.findFirst({ where: { ...scope, id: query.cursor } }) : null;
      if (query.cursor && !boundary) throw new AppError(400, 'INVALID_CURSOR', 'Settlement cursor does not belong to this receivable/profile');
      const rows = await tx.settlement.findMany({
        where: { ...scope, ...(boundary ? { OR: [{ createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } }] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
        include: { activity: { select: { inputJson: true, entries: { select: { id: true } } } } },
      });
      const page = rows.slice(0, query.limit);
      return {
        authority: 'node_ledger' as const, receivable_id: receivableId,
        items: page.map(row => {
          const input = settlementSchema.parse(JSON.parse(row.activity.inputJson) as unknown);
          return { settlement_id: row.id, activity_id: row.activityId, receivable_id: row.receivableId,
            amount_cleared: input.amount_cleared, amount_received: input.amount_received, receiving_account: input.receiving_account,
            received_at: input.confirmation?.received_at ?? null, recorded_at: row.createdAt.toISOString(),
            provenance: input.badge, confirmation: input.confirmation ?? null, rate_snapshot: input.rate_snapshot ?? null,
            fees: input.fees, ledger_entry_ids: row.activity.entries.map(entry => entry.id),
          };
        }), next_cursor: rows.length > query.limit ? page.at(-1)!.id : null,
      };
    });
  }

  /** Optional post-commit read. Its failure cannot turn a successful posting into a failure. */
  async currentState(receivableId: string) {
    return this.db.$transaction(async tx => ({
      receivable: this.view(await this.owned(tx, receivableId)),
      balances: (await tx.account.findMany({ where: { profileId: DEMO_PROFILE_ID }, orderBy: { id: 'asc' } })).map(accountResponse),
    }));
  }

  async confirm(receivableId: string, raw: unknown) {
    const input = confirmRepaymentSchema.parse(raw);
    // Validate immutable identity/source metadata before posting, without rejecting a replay of settled debt.
    const debt = await this.read(receivableId);
    const confirmation = { frontend_action: input.frontend_action, confirmed: input.confirmed, received_at: input.received_at, provenance: input.provenance };
    const posted = await this.ledger.post({
      kind: 'settlement', profile_id: DEMO_PROFILE_ID,
      idempotency_key: `split-repayment:${DEMO_PROFILE_ID}:${payloadHash(input.idempotency_key)}`,
      receivable_id: receivableId, receiving_account: input.receiving_account,
      amount_cleared: input.amount_cleared, amount_received: input.amount_received, fees: [], confirmation,
      badge: { status: 'User-Confirmed', source: `Explicit frontend repayment confirmation: ${input.provenance.source}`, timestamp: input.received_at },
    });
    const settlement = posted.settlement!;
    const remaining = settlement.remaining.Money;
    const cleared = safeNumber(BigInt(debt.original_amount.amount_minor) - BigInt(remaining.amount_minor));
    const atPosting = { ...debt, receivable: settlement.receivable,
      cleared_amount: { amount_minor: cleared, currency: remaining.currency }, outstanding_amount: remaining,
      status: remaining.amount_minor === 0 ? 'settled' as const : 'partial' as const };
    const readUrl = `/api/receivables/${encodeURIComponent(receivableId)}`;
    let currentState;
    try { currentState = { status: 'available' as const, ...await this.currentState(receivableId), retry_financial_action: false as const }; }
    catch { currentState = { status: 'unavailable' as const, read_url: readUrl, balances_url: '/api/balances', retry_financial_action: false as const }; }
    return {
      ...posted, financial_action_succeeded: true as const, settlement_id: settlement.settlement_id,
      recorded_at: settlement.recorded_at, confirmation: settlement.confirmation,
      receivable_at_posting: atPosting, ledger_entry_ids: posted.entries.map(entry => entry.entry_id),
      current_state: currentState,
    };
  }
}
