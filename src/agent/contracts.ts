import type { HomeService } from '../services/home.js';
import type { PlanResponse } from '../services/plans.js';
import type { ActivityAssessment } from '../services/plan-preview.js';
import type { ComparisonOption } from './compare.js';
import type { Decision } from './inputs.js';
import type { Understanding } from './decision.js';
import type { Badge } from '../shared/models.js';
import type { PendingPlanRiskService } from '../services/pending-plan-risk.js';
import type { ReceiptCard } from '../receipts/contracts.js';
import type { RiskPaginationNotice } from './risk-pagination.js';

type PlanReadCard = Pick<PlanResponse, 'plan' | 'created_at' | 'updated_at'>;

export interface ProposalCard {
  type: 'proposed_plan'; proposal_id: string; snapshot_id: string; quote_id: string;
  preview: ActivityAssessment['response']; stale: boolean;
  next_action: 'preview_before_frontend_save';
}
export type AgentCard =
  | { type: 'balance_summary'; data: Awaited<ReturnType<HomeService['summary']>> }
  | { type: 'ledger_history'; data: { items: { entry: import('../shared/models.js').LedgerEntry; activity_id: string; created_at: string }[]; next_cursor: string | null } }
  | { type: 'plan_list'; data: { items: PlanReadCard[]; next_cursor: string | null } }
  | { type: 'plan_detail'; data: PlanReadCard }
  | { type: 'pending_plan_risk'; data: Awaited<ReturnType<PendingPlanRiskService['list']>>; pagination?: RiskPaginationNotice }
  | ReceiptCard
  | { type: 'quote_comparison'; source: 'simulated_fixture' | 'compare'; ranking: string; options: (ComparisonOption & { snapshot_id: string; preview: ActivityAssessment['response'] | null; blocking_error: string | null })[] }
  | { type: 'reserve_warning'; proposal_id: string; data: ActivityAssessment['response'] }
  | { type: 'comparison_unavailable'; status: 'requote_required' | 'unsupported' | 'unavailable'; reason: string; code?: string }
  | { type: 'existing_balance_alternative'; account_id: string; balance: import('../domain/provenance.js').FinancialValue; reason: string }
  | ProposalCard;

export interface AgentResponse {
  status: 'ok' | 'clarification_required' | 'unsupported' | 'unavailable' | 'provider_error';
  explanation: string;
  provider: { name: 'groq' | 'demo'; simulated: boolean };
  cards: AgentCard[];
  clarification: Understanding['clarification'];
  decision: Decision;
  decision_badge: Badge;
  defaults_used: string[];
  next_action: 'provide_details' | 'review_cards' | 'preview_before_frontend_save' | 'request_revised_quote' | 'configure_provider' | 'retry_later' | 'ask_supported_question';
  active_proposal_id: string | null;
  error_code?: string;
}

export interface AgentMessageResult { turn_id: string; session_id: string; response: AgentResponse }
