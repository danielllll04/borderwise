import { z } from 'zod';
import { accountIdSchema, badgeSchema, moneySchema, positiveMoneySchema, snapshotSchema } from '../domain/validation.js';

const referenceSchema = z.string().trim().min(1).max(100);

/** Proposed Split -> Money & Ledger handover; not yet agreed with Steve. */
export const confirmedSplitSchema = z.object({
  frontend_action: z.literal('confirm_shared_expense'),
  idempotency_key: z.string().trim().min(1).max(200),
  split_id: referenceSchema,
  receipt_id: referenceSchema,
  // Until authentication exists, the current user's stable participant ID is demo-profile.
  payer: z.object({ participant_id: referenceSchema }).strict(),
  paid_from_account: accountIdSchema,
  bill_total: positiveMoneySchema,
  payer_share: moneySchema,
  participants: z.array(z.object({
    participant_id: referenceSchema,
    display_name: z.string().trim().min(1).max(100).optional(),
    share: positiveMoneySchema,
  }).strict()).max(100),
  rate_snapshot: snapshotSchema.optional(),
  badge: badgeSchema,
  paid_at: z.string().datetime({ offset: true }),
  payment_mode: z.enum(['new_payment', 'link_existing']),
  existing_payment_reference: referenceSchema.optional(),
}).strict();

export type ConfirmedSplitInput = z.infer<typeof confirmedSplitSchema>;

/** Internal posting input only; HTTP callers cannot choose their profile or ledger kind. */
export const sharedExpensePostingSchema = confirmedSplitSchema.extend({
  kind: z.literal('shared_expense'),
  profile_id: referenceSchema,
});
