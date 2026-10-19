import { z } from 'zod';
import { accountIdSchema, badgeSchema, moneySchema, positiveMoneySchema } from '../domain/validation.js';
import type { SharedExpenseConfirmationResult } from '../services/shared-expenses.js';

const stableId = z.string().trim().min(1).max(100);
export const receiptDataSchema = z.object({
  merchant: z.string().trim().min(1).max(200).optional(),
  date: z.string().date().optional(),
  items: z.array(z.object({
    item_id: stableId, label: z.string().trim().min(1).max(200),
    quantity: z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/).refine(value => !/^0(?:\.0+)?$/.test(value), 'Quantity must be positive'),
    amount: positiveMoneySchema,
  }).strict()).min(1).max(20),
  tax: moneySchema, discount: moneySchema, total: positiveMoneySchema,
}).strict();
export type ReceiptData = z.infer<typeof receiptDataSchema>;
export const extractionSchema = z.object({
  receipt_id: stableId, receipt: receiptDataSchema, badge: badgeSchema,
  confidence: z.number().min(0).max(1).optional(), fixture_notice: z.string().max(500).optional(),
}).strict();
export type ReceiptExtraction = z.infer<typeof extractionSchema>;
export const assignmentSchema = z.object({ item_id: stableId, participant_ids: z.array(stableId).min(1).max(20) }).strict();
export const allocationRequestSchema = z.object({
  expected_version: z.number().int().positive().max(2147483646),
  participant_ids: z.array(stableId).min(1).max(20),
  payer_id: stableId,
  paid_from_account: accountIdSchema.optional(),
  paid_at: z.string().datetime({ offset: true }).optional(),
  assignments: z.array(assignmentSchema).max(20),
  payment_mode: z.enum(['new_payment', 'link_existing']).default('new_payment'),
  existing_payment_reference: stableId.optional(),
}).strict();
export type AllocationRequest = z.infer<typeof allocationRequestSchema>;
export const allocationResultSchema = z.object({
  split_id: stableId, receipt_id: stableId, receipt_version: z.number().int().positive(),
  assignments_hash: z.string().regex(/^[a-f0-9]{64}$/),
  total: positiveMoneySchema, payer_share: moneySchema,
  debtor_shares: z.array(z.object({ participant_id: stableId, share: positiveMoneySchema }).strict()).max(19),
  badge: badgeSchema,
}).strict();
export type AllocationResult = z.infer<typeof allocationResultSchema>;
export interface Participant { participant_id: string; display_name: string }

/** Proposed ports only. No Steve endpoint URL or agreed schema exists in this repository. */
export interface ReceiptOcrAdapter {
  extract(input: { attachment_id: string; bytes: Buffer; content_type: 'image/png' }): Promise<unknown>;
}
export interface SplitAllocationAdapter {
  allocate(input: { receipt_id: string; receipt_version: number; receipt: ReceiptData; request: AllocationRequest }): Promise<unknown>;
}
export interface ParticipantDirectoryAdapter { list(profileId: string): Promise<Participant[]> }
export interface ReceiptAdapters { ocr: ReceiptOcrAdapter; allocation: SplitAllocationAdapter; directory: ParticipantDirectoryAdapter }

export const receiptEditSchema = z.object({ expected_version: z.number().int().positive(), receipt: receiptDataSchema }).strict();
export const reviewedSplitConfirmSchema = z.object({
  frontend_action: z.literal('confirm_reviewed_split'), idempotency_key: z.string().trim().min(1).max(150),
  expected_version: z.number().int().positive(), receipt_review_acknowledged: z.literal(true), allocation_review_acknowledged: z.literal(true),
}).strict();
export type ReceiptReviewCard = {
  type: 'receipt_review'; draft_id: string; version: number; attachment_id: string;
  review_state: 'review_required' | 'confirmed'; extracted: ReceiptExtraction; reviewed: ReceiptData;
  corrections_badge: z.infer<typeof badgeSchema> | null; participants: Participant[];
  review_issues: { code: string; message: string }[];
  next_action: 'review_receipt_and_assign_items' | 'recorded';
};
export type AllocationReviewCard = {
  type: 'allocation_review'; draft_id: string; version: number; proposal_id: string | null;
  review_state: 'clarification_required' | 'review_required' | 'stale' | 'confirmed';
  assignments: AllocationRequest['assignments']; participants: Participant[]; payer_id: string;
  paid_from_account: string | null; paid_at: string | null; allocation: AllocationResult | null;
  reconciliation: 'validated' | 'not_calculated';
  clarification: { field: string; question: string }[]; assumptions_requiring_confirmation: string[];
  next_action: 'clarify_assignments' | 'explicit_frontend_confirmation' | 'refresh_review' | 'recorded';
};
export type RecordedExpenseCard = { type: 'shared_expense_recorded'; proposal_id: string; data: SharedExpenseConfirmationResult };
export type ReceiptCard = ReceiptReviewCard | AllocationReviewCard | RecordedExpenseCard
  | { type: 'receipt_workflow_unavailable'; code: string; reason: string; financial_mutation: false };
