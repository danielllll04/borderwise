import type { AccountId, Badge, BalanceItem, FV, Money, Page } from './types'

// Node review/read wrappers; shared financial models remain unchanged.
export interface ReceiptData {
  merchant?: string; date?: string
  items: {item_id: string; label: string; quantity: string; amount: Money}[]
  tax: Money; discount: Money; total: Money
}
export interface Participant {participant_id: string; display_name: string}
export interface ReceiptReviewCard {
  type: 'receipt_review'; draft_id: string; version: number; attachment_id: string
  review_state: 'review_required' | 'confirmed'
  extracted: {receipt_id: string; receipt: ReceiptData; badge: Badge; confidence?: number; fixture_notice?: string; integration?: {reads_image_content: boolean; mode: 'sample'}}
  reviewed: ReceiptData; corrections_badge: Badge | null; participants: Participant[]
  review_issues: {code: string; message: string}[]; next_action: string
}
export interface AllocationInput {
  expected_version: number; participant_ids: string[]; payer_id: string
  paid_from_account?: AccountId; paid_at?: string
  assignments: {item_id: string; participant_ids: string[]}[]; payment_mode: 'new_payment'
}
export interface AllocationReviewCard {
  type: 'allocation_review'; draft_id: string; version: number; proposal_id: string | null
  review_state: 'clarification_required' | 'review_required' | 'stale' | 'confirmed'
  assignments: AllocationInput['assignments']; participants: Participant[]; payer_id: string
  paid_from_account: string | null; paid_at: string | null
  allocation: null | {total: Money; payer_share: Money; debtor_shares: {participant_id: string; share: Money}[]; badge: Badge}
  reconciliation: 'validated' | 'not_calculated'; clarification: {field: string; question: string}[]
  assumptions_requiring_confirmation: string[]; next_action: string
}
export interface BillConfirmation {
  frontend_action: 'confirm_reviewed_split'; idempotency_key: string; expected_version: number
  receipt_review_acknowledged: true; allocation_review_acknowledged: true
}
export interface BillResult {
  paid_at?: string
  activity_id: string; receipt_proposal_id?: string; ledger_entry_ids: string[]
  bill_total: FV; recorded_debit: FV; personal_expense: FV; receivables_total: FV
  provenance: Badge; balances: BalanceItem[]
  receivables: {participant_id: string; receivable: {receivable_id: string; debtor: string; amount: Money}; amount_badge: Badge}[]
}
export type ReceiptCard = ReceiptReviewCard | AllocationReviewCard
  | {type: 'shared_expense_recorded'; proposal_id: string; data: BillResult}
  | {type: 'receipt_workflow_unavailable'; code: string; reason: string; financial_mutation: false}
export interface ReceiptEvent {event_id: string; created_at: string; card: Extract<ReceiptCard, {type: 'shared_expense_recorded'}>}
export interface Debt {
  authority: 'node_ledger'; receivable: {receivable_id: string; debtor: string; amount: Money}
  participant_id: string | null; split_id: string | null; receipt_id: string | null; shared_expense_id: string | null
  identity_link: 'shared_expense_participant' | 'legacy_unlinked'
  original_amount: Money; cleared_amount: Money; outstanding_amount: Money; status: 'open' | 'partial' | 'settled'
  provenance: {original_debt: Badge; calculation: string}
}
export interface RepaymentInput {
  frontend_action: 'confirm_repayment'; confirmed: true; idempotency_key: string
  amount_cleared: Money; amount_received: Money; receiving_account: AccountId
  received_at: string; provenance: {source: string}
}
export interface SettlementHistory {
  settlement_id: string; activity_id: string; amount_cleared: Money; amount_received: Money
  receiving_account: AccountId; received_at: string | null; recorded_at: string
  provenance: Badge; ledger_entry_ids: string[]
}
export interface RepaymentResult {
  financial_action_succeeded: true; activity_id: string; settlement_id: string; ledger_entry_ids: string[]
  receivable_at_posting: Debt
  current_state: {status: 'available'; receivable: Debt; balances: BalanceItem[]} | {status: 'unavailable'; retry_financial_action: false}
}
export interface SplitBackendApi {
  storageNamespace: string
  upload(session: string, image: File): Promise<{attachment_id: string; expires_at: string}>
  extract(session: string, attachment: string): Promise<ReceiptReviewCard>
  review(session: string, draft: string): Promise<ReceiptReviewCard>
  edit(session: string, draft: string, input: {expected_version: number; receipt: ReceiptData}): Promise<ReceiptReviewCard>
  allocate(session: string, draft: string, input: AllocationInput): Promise<AllocationReviewCard>
  proposal(session: string, proposal: string): Promise<AllocationReviewCard>
  confirmBill(session: string, proposal: string, input: BillConfirmation): Promise<BillResult>
  debts(status: 'all' | 'outstanding' | 'settled', cursor?: string): Promise<Page<Debt>>
  debt(id: string): Promise<Debt>
  history(id: string, cursor?: string): Promise<Page<SettlementHistory>>
  repay(id: string, input: RepaymentInput): Promise<RepaymentResult>
}
