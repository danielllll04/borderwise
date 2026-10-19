import type { Prisma, PrismaClient } from '@prisma/client';
import { DEMO_PROFILE_ID, type AccountId } from '../domain/accounts.js';
import { payloadHash } from '../domain/idempotency.js';
import type { Badge, Receivable } from '../shared/models.js';
import type { FinancialValue } from '../domain/provenance.js';
import type { budgetResponse } from './budget.js';
import { LedgerService, type PostingResult } from './ledger.js';
import { confirmedSplitSchema } from './shared-expense-inputs.js';

/** Backend wrapper only; shared LedgerEntry and Receivable fields are preserved. */
export interface SharedExpenseDetails {
  posting_id: string;
  split_id: string;
  receipt_id: string;
  paid_from_account: AccountId;
  bill_total: FinancialValue;
  recorded_debit: FinancialValue;
  personal_expense: FinancialValue;
  receivables_total: FinancialValue;
  receivables: { participant_id: string; receivable: Receivable; amount_badge: Badge }[];
  ledger_entry_ids: string[];
  paid_at: string;
  payment_mode: 'new_payment';
  provenance: Badge;
  confirmation: { frontend_action: 'confirm_shared_expense'; acknowledged: true; recorded_at: string };
  budget: ReturnType<typeof budgetResponse>;
}

export class SharedExpenseService {
  private readonly ledger: LedgerService;
  constructor(db: PrismaClient) { this.ledger = new LedgerService(db); }

  async confirm(raw: unknown) {
    const input = confirmedSplitSchema.parse(raw);
    const posted = await this.ledger.post({
      ...input, kind: 'shared_expense', profile_id: DEMO_PROFILE_ID,
      idempotency_key: `shared-expense:${DEMO_PROFILE_ID}:${payloadHash(input.idempotency_key)}`,
    });
    return this.response(posted);
  }

  /** Trusted review workflow owns the transaction, so proposal/version and money commit together. */
  async confirmInTransaction(tx: Prisma.TransactionClient, raw: unknown) {
    const input = confirmedSplitSchema.parse(raw);
    const posted = await this.ledger.postInTransaction(tx, {
      ...input, kind: 'shared_expense', profile_id: DEMO_PROFILE_ID,
      idempotency_key: `shared-expense:${DEMO_PROFILE_ID}:${payloadHash(input.idempotency_key)}`,
    });
    return this.response(posted);
  }

  private response(posted: PostingResult) {
    if (!posted.shared_expense) throw new Error('Shared expense posting result is missing');
    return {
      ...posted.shared_expense, activity_id: posted.activity_id, entries: posted.entries, balances: posted.balances,
      pending_plan_follow_up: posted.pending_plan_follow_up,
    };
  }
}

export type SharedExpenseConfirmationResult = Awaited<ReturnType<SharedExpenseService['confirm']>>;
