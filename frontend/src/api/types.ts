// Mirrors backend src/shared/models.ts + response wrappers (docs/priority-3.md, docs/agent.md).
export type Currency = 'MYR' | 'KRW'
export interface Money { amount_minor: number; currency: Currency }
export type BadgeStatus = 'User-Entered' | 'User-Confirmed' | 'Simulated' | 'Indicative' | 'Live'
export interface Badge { status: BadgeStatus; source?: string; timestamp: string }
export interface FV { Money: Money; badge: Badge } // backend { Money, badge } wrapper
export type AccountId = 'myr_funding' | 'krw_card' | 'krw_cash'

export interface Quote {
  quote_id: string; objective: string; mode: string; funding_source: string; provider: string
  rate: string; principal: Money; fees: { label: string; Money: Money }[]
  total_debit: Money; net_received: Money; badge: Badge
}
export interface Selection {
  quote: Quote
  context: { destination_account: AccountId; fee_accounts: AccountId[]; fee_behavior: 'fixed' | 'percentage' | 'tiered' | 'unspecified' }
}
export interface Plan { plan_id: string; quote: Quote; status: 'pending' | 'completed' | 'cancelled'; reserve_breached: boolean }
export interface PlanResponse { plan: Plan; context: Selection['context']; created_at: string; updated_at: string }
export interface LedgerEntry {
  entry_id: string; type: 'income' | 'expense' | 'shared_expense' | 'exchange' | 'atm_withdrawal' | 'fee' | 'settlement'
  lines: { account: string; Money: Money }[]; badge: Badge
}
export interface LedgerItem { entry: LedgerEntry; activity_id: string; created_at: string }

export interface Profile {
  profile_id: string; display_name: string
  fixed_expense_reserve: FV; emergency_reserve: FV
}
export interface BalanceItem { account_id: AccountId; display_name: string; balance: FV }
export interface Budget {
  status: 'Above reserve' | 'At reserve' | 'Below reserve'; badge: Badge
  total_reserve: FV; available_above_reserve: FV; max_safe_total_debit: FV; reserve_shortfall: FV
}
export interface HomeData { profile: Profile; balances: BalanceItem[]; budget: Budget }

/** Modal A / Modal B payload (PlanService.preview / completionPreview). */
export interface Assessment {
  check_token: string
  current_balance: FV; projected_balance: FV; total_reserve: FV; projected_reserve_shortfall: FV
  total_debit: FV; amount_received: FV; principal: FV
  requires_reserve_acknowledgement: boolean
  reserve_check?: { max_safe_total_debit: FV | null }
  safe_principal: { status: 'available' | 'no_positive_principal' | 'revised_quote_required' | 'not_applicable'; amount: FV | null; reason: string }
  checked_at?: string
}
export interface ActualActivity {
  activity_type: 'exchange' | 'atm_withdrawal'
  funding_account: AccountId; destination_account: AccountId
  principal: Money; amount_received: Money
  fees: { label: string; account_id: AccountId; Money: Money }[]
  completed_at: string
}
export interface Receivable { receivable_id: string; debtor: string; amount: Money; remaining: Money; snapshot: { pair: string; rate: string; badge: Badge } }

// Agent (src/agent/contracts.ts)
export interface AgentOption { snapshot_id: string; rank: number; selection: Selection; preview: Assessment | null; blocking_error: string | null }
export type AgentCard =
  | { type: 'balance_summary'; data: HomeData }
  | { type: 'quote_comparison'; source: string; ranking: string; options: AgentOption[] }
  | { type: 'proposed_plan'; proposal_id: string; snapshot_id: string; quote_id: string; preview: Assessment; stale: boolean; next_action: string }
  | { type: 'reserve_warning'; proposal_id: string; data: Assessment }
  | { type: 'comparison_unavailable'; status: string; reason: string }
export interface AgentResponse {
  status: 'ok' | 'clarification_required' | 'unsupported' | 'unavailable' | 'provider_error'
  explanation: string; provider: { name: string; simulated: boolean }
  cards: AgentCard[]; clarification: { field: string; question: string }[]
  next_action: string; active_proposal_id: string | null
}
export interface AgentDecision {
  objective?: string; amount?: Money; amount_basis?: 'principal' | 'total_debit_budget' | 'destination_target'
  funding_account?: AccountId; destination_account?: AccountId
}
export class ApiError extends Error {
  code: string
  details?: unknown
  status: number
  constructor(code: string, message: string, details?: unknown, status = 0) {
    super(message); this.code = code; this.details = details; this.status = status
  }
}
export interface CompareRequest {
  objective: 'exchange' | 'atm_withdrawal' | 'card'
  amount: Money; amount_basis: 'total_debit_budget' | 'destination_target'
  funding_account: AccountId; destination_account: AccountId; card_network?: string
}
export interface CompareOption extends AgentOption {
  proposal_id: string | null
  compatibility?: { status: 'unknown'; reason: string } | { status: 'compatible' | 'incompatible'; card_network: string; evidence: { source: string; timestamp: string } }
  atm_info?: { bank_name: string; location_name: string; supported_networks: string[] }
}
export type CompareResult = { status: 'ready'; session_id: string; source: string; ranking: string; options: CompareOption[] }
  | { status: 'unsupported' | 'requote_required'; reason: string; options: [] }
export interface ProposalPreview { proposal_id: string; quote_id: string; selection: Selection; preview: Assessment }
export interface ManualCompareApi {
  quotes(input: CompareRequest): Promise<CompareResult>
  preview(sessionId: string, proposalId: string): Promise<ProposalPreview>
  save(sessionId: string, proposalId: string, key: string, token: string, ack?: { acknowledged: true; check_token: string }): Promise<PlanResponse>
}

// Home wrappers mirror existing Node read/completion APIs; shared financial contracts are unchanged.
export interface Page<T> { items: T[]; next_cursor: string | null }
export interface ReserveImpact {
  applicability: 'applicable' | 'not_applicable'; reason: string
  current_balance: FV | null; total_debit: FV | null; projected_balance: FV | null
  total_reserve: FV | null; projected_reserve_shortfall: FV | null; max_safe_total_debit: FV | null
}
export interface AccountImpact { account_id: AccountId; current_balance: FV; total_debits: FV; total_credits: FV; projected_balance: FV }
export interface Difference { quoted: FV; actual: FV; currency_changed: boolean; difference: FV | null }
export interface CompletionAssessment extends Omit<Assessment, 'total_reserve' | 'projected_reserve_shortfall' | 'reserve_check'> {
  total_reserve: FV | null; projected_reserve_shortfall: FV | null
  reserve_check: ReserveImpact; other_account_reserve_check: ReserveImpact | null
  account_impacts: AccountImpact[]
  differences: {
    principal: Difference; total_debit: Difference; amount_received: Difference
    fees: { quoted: ({label: string; account_id: AccountId} & FV)[]; actual: ({label: string; account_id: AccountId} & FV)[]; changed: boolean }
    funding_account: {quoted: AccountId; actual: AccountId; changed: boolean}
    destination_account: {quoted: AccountId; actual: AccountId; changed: boolean}
  }
}
export interface PendingRisk {
  plan_id: string; state: 'Within reserve' | 'Would breach reserve' | 'Insufficient tracked funds' | 'Reserve check not applicable' | 'Cannot assess'
  reason: {code: string; message: string}; assessed_at: string
  quote: {quote_id: string; badge: Badge} | null
  projected_deficits: {account_id: string; deficit: FV}[]
  preview: {projected_reserve_shortfall: FV | null; other_account_reserve_check: ReserveImpact | null} | null
}
export interface RiskPage extends Page<PendingRisk> { status: 'available'; notice: string; assessed_at: string }
export interface HomeBackendApi {
  summary(): Promise<HomeData>
  ledger(cursor?: string): Promise<Page<LedgerItem>>
  pending(cursor?: string): Promise<Page<PlanResponse>>
  assessments(cursor?: string): Promise<RiskPage>
  readPlan(id: string): Promise<PlanResponse>
  preview(id: string, actual: ActualActivity): Promise<CompletionAssessment>
  confirm(id: string, input: {actual: ActualActivity; confirmed: true; idempotency_key: string; reserve_acknowledgement?: {acknowledged: true; check_token: string}}): Promise<unknown>
  cancel(id: string): Promise<PlanResponse>
}
