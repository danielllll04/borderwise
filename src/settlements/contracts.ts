import { z } from 'zod';
import { accountIdSchema, positiveMoneySchema } from '../domain/validation.js';
import { settlementConfirmationSchema } from '../services/posting-inputs.js';

const stableId = z.string().trim().min(1).max(100);
export const receivableParams = z.object({ receivableId: stableId }).strict();
export const receivableQuery = z.object({
  status: z.enum(['outstanding', 'settled', 'all']).default('outstanding'),
  participant_id: stableId.optional(), split_id: stableId.optional(), receipt_id: stableId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20), cursor: stableId.optional(),
}).strict();
export const settlementHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().uuid().optional(),
}).strict();
export const confirmRepaymentSchema = settlementConfirmationSchema.extend({
  idempotency_key: z.string().trim().min(1).max(150),
  amount_cleared: positiveMoneySchema, amount_received: positiveMoneySchema,
  receiving_account: accountIdSchema,
}).strict();
