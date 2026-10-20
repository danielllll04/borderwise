import { z } from 'zod';
import { sharedExpensePostingSchema } from './shared-expense-inputs.js';
import {
  accountIdSchema, badgeSchema, moneySchema, positiveMoneySchema, snapshotSchema,
} from '../domain/validation.js';

const feeSchema = z.object({
  label: z.string().trim().min(1).max(200),
  account_id: accountIdSchema,
  Money: moneySchema,
  badge: badgeSchema,
}).strict();

const common = {
  profile_id: z.string().trim().min(1).max(100),
  idempotency_key: z.string().trim().min(1).max(200),
  badge: badgeSchema,
};
const movement = {
  ...common,
  source_account: accountIdSchema,
  principal: positiveMoneySchema,
  received: positiveMoneySchema,
  fees: z.array(feeSchema).max(50),
  rate_snapshot: snapshotSchema.optional(),
};

export const incomeSchema = z.object({
  ...common,
  kind: z.literal('income'),
  account_id: accountIdSchema,
  amount: positiveMoneySchema,
}).strict();
export const exchangeSchema = z.object({
  ...movement,
  kind: z.literal('exchange'),
  destination_account: accountIdSchema,
}).strict();
export const atmSchema = z.object({
  ...movement,
  kind: z.literal('atm_withdrawal'),
  source_account: z.enum(['myr_funding', 'krw_card']),
  destination_account: z.literal('krw_cash'),
}).strict();
/** Optional audit metadata for the explicit repayment boundary; legacy internal callers remain valid. */
export const settlementConfirmationSchema = z.object({
  frontend_action: z.literal('confirm_repayment'), confirmed: z.literal(true),
  received_at: z.string().datetime({ offset: true }),
  provenance: z.object({ source: z.string().trim().min(1).max(600) }).strict(),
}).strict();
export const settlementSchema = z.object({
  ...common,
  kind: z.literal('settlement'),
  receivable_id: z.string().trim().min(1).max(100),
  receiving_account: accountIdSchema,
  amount_cleared: positiveMoneySchema,
  amount_received: positiveMoneySchema,
  fees: z.array(feeSchema).max(50),
  rate_snapshot: snapshotSchema.optional(),
  confirmation: settlementConfirmationSchema.optional(),
}).strict();

export const postingSchema = z.discriminatedUnion('kind', [
  incomeSchema, exchangeSchema, atmSchema, settlementSchema, sharedExpensePostingSchema,
]);
export type IncomeInput = z.infer<typeof incomeSchema>;
export type ExchangeInput = z.infer<typeof exchangeSchema>;
export type AtmInput = z.infer<typeof atmSchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
export type PostingInput = z.infer<typeof postingSchema>;
