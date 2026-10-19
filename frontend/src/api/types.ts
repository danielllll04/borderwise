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
export interface PlanResponse {
  plan: Plan; context: Selection['context']; created_at: string; updated_at: string
  cancelled_at?: string | null
  checks?: { saved: Assessment; completion: Assessment | null }
  completion?: { actual: ActualActivity; completed_at: string; recorded_at: string; activity_id: string; ledger_entry_ids: string[] } | null
}
export interface LedgerEntry {
  entry_id: string; type: 'income' | 'expense' | 'exchange' | 'atm_withdrawal' | 'fee' | 'settlement'
  lines: { account: string; Money: Money }[]; badge: Badge
}
export interface LedgerItem { entry: LedgerEntry; activity_id: string; created_at: string; activity?: unknown }

export interface Profile {
  profile_id: string; display_name: string
  home_currency?: Currency; destination_currency?: Currency
  fixed_expense_reserve: FV; emergency_reserve: FV; updated_at?: string
}
export interface BalanceItem { account_id: AccountId; display_name: string; balance: FV }
export interface Budget {
  status: 'Above reserve' | 'At reserve' | 'Below reserve'; badge: Badge
  total_reserve: FV; available_above_reserve: FV; max_safe_total_debit: FV; reserve_shortfall: FV
}
export interface HomeData {
  profile: Profile; balances: BalanceItem[]; budget: Budget
  shared_expense_totals?: unknown[]
  pending_plan_risk?: unknown
}

/** Modal A / Modal B payload (PlanService.preview / completionPreview). */
export interface Assessment {
  check_token: string
  funding_account?: AccountId; destination_account?: AccountId
  current_balance: FV; projected_balance: FV; total_reserve: FV | null; projected_reserve_shortfall: FV | null
  total_debit: FV; amount_received: FV; principal: FV; fees?: { label: string; account_id: AccountId; Money: Money; badge?: Badge }[]
  requires_reserve_acknowledgement: boolean
  safe_principal: { status: 'available' | 'no_positive_principal' | 'revised_quote_required' | 'not_applicable'; amount: FV | null; reason: string; revised_quote_required_to_change_principal?: boolean }
  checked_at?: string
  reserve_check?: unknown
  account_impacts?: unknown[]
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
  | { type: 'ledger_history'; data: { items: LedgerItem[]; next_cursor: string | null } }
  | { type: 'plan_list'; data: { items: Pick<PlanResponse, 'plan' | 'created_at' | 'updated_at'>[]; next_cursor: string | null } }
  | { type: 'plan_detail'; data: Pick<PlanResponse, 'plan' | 'created_at' | 'updated_at'> }
  | { type: 'pending_plan_risk'; data: unknown }
  | { type: 'quote_comparison'; source: string; ranking: string; options: (AgentOption & { assumptions?: unknown; compatibility?: unknown; funding_match?: string })[] }
  | { type: 'proposed_plan'; proposal_id: string; snapshot_id: string; quote_id: string; preview: Assessment; stale: boolean; next_action: string }
  | { type: 'reserve_warning'; proposal_id: string; data: Assessment }
  | { type: 'comparison_unavailable'; status: string; reason: string }
  | { type: 'existing_balance_alternative'; account_id: string; balance: FV; reason: string }
  | { type: 'receipt_review' | 'allocation_review' | 'shared_expense_recorded' | 'receipt_workflow_unavailable'; [key: string]: unknown }
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
  public readonly code: string
  public readonly details: unknown
  public readonly status: number
  constructor(code: string, message: string, details?: unknown, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.status = status
  }
}
