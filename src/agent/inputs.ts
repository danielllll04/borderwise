import { z } from 'zod';
import { accountIdSchema, positiveMoneySchema } from '../domain/validation.js';

export const decisionSchema = z.object({
  objective: z.enum(['exchange', 'atm_withdrawal']).optional(),
  amount: positiveMoneySchema.optional(),
  amount_basis: z.enum(['principal', 'total_debit_budget', 'destination_target']).optional(),
  funding_account: accountIdSchema.optional(),
  destination_account: accountIdSchema.optional(),
  card_network: z.string().trim().min(1).max(60).transform(value => value.toLowerCase()).optional(),
}).strict();
export type Decision = z.infer<typeof decisionSchema>;
export const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  idempotency_key: z.string().trim().min(1).max(150),
  decision: decisionSchema.optional(),
  snapshot_id: z.string().uuid().optional(),
  attachment_id: z.string().uuid().optional(),
  receipt_draft: z.object({ draft_id: z.string().uuid(), version: z.number().int().positive() }).strict().optional(),
}).strict().refine(input => !(input.snapshot_id && input.decision), 'Choose either an owned snapshot or new decision fields, not both')
  .refine(input => !(input.attachment_id && input.receipt_draft), 'Select an attachment or receipt draft, not both')
  .refine(input => !((input.attachment_id || input.receipt_draft) && (input.snapshot_id || input.decision)), 'Receipt review and financial-option selection use separate messages');
export const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  cursor: z.coerce.number().int().positive().max(2147483647).optional(),
  receipt_cursor: z.string().uuid().optional(),
}).strict();
export const agentParams = z.object({ sessionId: z.string().uuid() }).strict();
export const proposalParams = agentParams.extend({ proposalId: z.string().uuid() });
export const proposalSaveSchema = z.object({
  frontend_action: z.literal('save_pending_plan'),
  idempotency_key: z.string().trim().min(1).max(150),
  preview_token: z.string().regex(/^[a-f0-9]{64}$/),
  reserve_acknowledgement: z.object({ acknowledged: z.literal(true), check_token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
}).strict();
