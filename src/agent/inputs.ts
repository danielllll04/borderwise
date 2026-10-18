import { z } from 'zod';
import { accountIdSchema, positiveMoneySchema } from '../domain/validation.js';

export const decisionSchema = z.object({
  objective: z.enum(['exchange', 'atm_withdrawal']).optional(),
  amount: positiveMoneySchema.optional(),
  amount_basis: z.enum(['principal', 'total_debit_budget', 'destination_target']).optional(),
  funding_account: accountIdSchema.optional(),
  destination_account: accountIdSchema.optional(),
}).strict();
export type Decision = z.infer<typeof decisionSchema>;
export const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  idempotency_key: z.string().trim().min(1).max(150),
  decision: decisionSchema.optional(),
  snapshot_id: z.string().uuid().optional(),
}).strict().refine(input => !(input.snapshot_id && input.decision), 'Choose either an owned snapshot or new decision fields, not both');
export const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  cursor: z.coerce.number().int().positive().max(2147483647).optional(),
}).strict();
export const agentParams = z.object({ sessionId: z.string().uuid() }).strict();
export const proposalParams = agentParams.extend({ proposalId: z.string().uuid() });
export const proposalSaveSchema = z.object({
  frontend_action: z.literal('save_pending_plan'),
  idempotency_key: z.string().trim().min(1).max(150),
  preview_token: z.string().regex(/^[a-f0-9]{64}$/),
  reserve_acknowledgement: z.object({ acknowledged: z.literal(true), check_token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
}).strict();
