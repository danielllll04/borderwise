import { z } from 'zod';
import { accountIdSchema, badgeSchema, moneySchema, positiveMoneySchema, rateSchema, snapshotSchema } from '../domain/validation.js';

// Preserve optional source in the shared contract; supply a source at this backend boundary.
const suppliedBadge = badgeSchema.extend({ source: badgeSchema.shape.source.optional() })
  .transform(badge => ({ ...badge, source: badge.source ?? 'Selected quote or rate snapshot supplied by the client; source unspecified' }));
export const quoteSchema = z.object({
  quote_id: z.string().min(1).max(200),
  objective: z.string().min(1).max(100),
  mode: z.string().min(1).max(100),
  funding_source: z.string().min(1).max(100),
  provider: z.string().min(1).max(200),
  rate: rateSchema,
  principal: positiveMoneySchema,
  fees: z.array(z.object({ label: z.string().min(1).max(200), Money: moneySchema }).strict()).max(50),
  total_debit: positiveMoneySchema,
  net_received: positiveMoneySchema,
  badge: suppliedBadge,
}).strict();

/** Internal Compare routing/fee assertions, not new fields or enums in shared Quote. */
export const selectionSchema = z.object({
  quote: quoteSchema,
  context: z.object({
    destination_account: accountIdSchema,
    fee_accounts: z.array(accountIdSchema).max(50).optional(),
    fee_behavior: z.enum(['fixed', 'percentage', 'tiered', 'unspecified']).default('unspecified'),
  }).strict(),
}).strict();
export const acknowledgementSchema = z.object({
  acknowledged: z.literal(true),
  check_token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const savePlanSchema = z.object({
  selection: selectionSchema,
  idempotency_key: z.string().trim().min(1).max(200),
  reserve_acknowledgement: acknowledgementSchema.optional(),
}).strict();

const actualCommon = {
  funding_account: accountIdSchema,
  principal: positiveMoneySchema,
  amount_received: positiveMoneySchema,
  fees: z.array(z.object({
    label: z.string().trim().min(1).max(200), account_id: accountIdSchema, Money: moneySchema,
  }).strict()).max(50),
  rate_snapshot: snapshotSchema.extend({ badge: suppliedBadge }).optional(),
  completed_at: z.string().datetime({ offset: true }),
};
export const actualSchema = z.discriminatedUnion('activity_type', [
  z.object({ ...actualCommon, activity_type: z.literal('exchange'), destination_account: accountIdSchema }).strict(),
  z.object({
    ...actualCommon, activity_type: z.literal('atm_withdrawal'),
    funding_account: z.enum(['myr_funding', 'krw_card']), destination_account: z.literal('krw_cash'),
  }).strict(),
]);
export const completionPreviewSchema = z.object({ actual: actualSchema }).strict();
export const confirmPlanSchema = z.object({
  actual: actualSchema,
  confirmed: z.literal(true),
  idempotency_key: z.string().trim().min(1).max(200),
  reserve_acknowledgement: acknowledgementSchema.optional(),
}).strict();
export const listPlansSchema = z.object({
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
}).strict();
export type Selection = z.infer<typeof selectionSchema>;
export type ActualActivity = z.infer<typeof actualSchema>;
export type SavePlanInput = z.infer<typeof savePlanSchema>;
export type ConfirmPlanInput = z.infer<typeof confirmPlanSchema>;
export type ReserveAcknowledgement = z.infer<typeof acknowledgementSchema>;
