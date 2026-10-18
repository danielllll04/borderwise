import type { SettlementInput } from '../services/posting-inputs.js';
import type { PostingResult } from '../services/ledger.js';
import type { Selection, SavePlanInput, ConfirmPlanInput } from '../services/plan-inputs.js';
import type { ActivityAssessment } from '../services/plan-preview.js';
import type { PlanResponse, ConfirmedPlanResponse } from '../services/plans.js';

/** Internal ports for Compare/frontend and future Priority 5 reuse. Shared models are unchanged. */
export interface SelectedQuoteReceiver {
  preview(input: Selection): Promise<ActivityAssessment['response']>;
}

/** Saves metadata only; MUST NOT post to the ledger. */
export interface PendingPlanCreator {
  save(input: SavePlanInput): Promise<PlanResponse>;
}

/** Completion requires actual principal, received amounts and fees, never quote estimates. */
export interface ConfirmedCompletionRecorder {
  confirm(planId: string, input: ConfirmPlanInput): Promise<ConfirmedPlanResponse>;
}

/** Split sends both original-currency clearing and actual repayment amounts. */
export interface SplitSettlementReceiver {
  receiveSettlement(input: SettlementInput): Promise<PostingResult>;
}
