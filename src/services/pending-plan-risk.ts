import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { payloadHash } from '../domain/idempotency.js';
import { financialValue, readBadge } from '../domain/provenance.js';
import { quoteActivity } from '../integrations/compare-adapter.js';
import type { Badge } from '../shared/models.js';
import { budgetResponse } from './budget.js';
import { LedgerService, type FinancialSnapshot } from './ledger.js';
import { selectionSchema } from './plan-inputs.js';
import { assessActivity, type ActivityAssessment } from './plan-preview.js';

export const assessmentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
}).strict();

export const INDEPENDENT_PLAN_NOTICE = 'Each pending plan is assessed independently against the same recorded funds. Pending plans do not reserve funds. These assessments do not guarantee all plans are affordable together. Receivables are excluded.';

export type AssessmentState = 'Within reserve' | 'Would breach reserve' | 'Insufficient tracked funds' | 'Reserve check not applicable' | 'Cannot assess';
type PlanSnapshot = { id: string; quoteJson: string; contextJson: string; createdAt: Date };
const planSelect = { id: true, quoteJson: true, contextJson: true, createdAt: true } as const;

export interface PendingPlanAssessment {
  plan_id: string;
  plan_status: 'pending';
  state: AssessmentState;
  reason: { code: string; message: string };
  assessed_at: string;
  financial_context_fingerprint: string;
  plan_snapshot_fingerprint: string;
  quote: { quote_id: string; badge: Badge } | null;
  funding_account: string | null;
  affordability: 'sufficient' | 'insufficient' | 'unknown';
  acknowledgement_cannot_override_insufficient_funds: true;
  projected_deficits: { account_id: string; deficit: ReturnType<typeof financialValue> }[];
  preview: ActivityAssessment['response'] | null;
  assessment_scope: 'individual_plan';
}

export function financialContextFingerprint(snapshot: FinancialSnapshot) {
  return payloadHash({
    profile_id: snapshot.profile.id,
    reserves: {
      fixed: snapshot.profile.fixedReserveMinor.toString(), emergency: snapshot.profile.emergencyReserveMinor.toString(),
      fixed_badge: readBadge(snapshot.profile.fixedReserveBadgeJson), emergency_badge: readBadge(snapshot.profile.emergencyBadgeJson),
    },
    accounts: [...snapshot.accounts].sort((a, b) => a.id.localeCompare(b.id)).map(row => ({
      id: row.id, currency: row.currency, balance_minor: row.balanceMinor.toString(), badge: readBadge(row.balanceBadgeJson),
    })),
  });
}

export function assessmentsUnavailable() {
  return {
    status: 'unavailable' as const, code: 'PENDING_PLAN_ASSESSMENTS_UNAVAILABLE', assessed_at: new Date().toISOString(),
    reason: 'Pending-plan risk could not be refreshed. Recorded financial actions are unaffected; refresh this read separately.',
    refresh: { method: 'GET', url: '/api/plans/assessments' }, retry_financial_action: false,
    assessment_scope: 'individual_plan' as const, notice: INDEPENDENT_PLAN_NOTICE,
  };
}

export class PendingPlanRiskService {
  private readonly ledger: LedgerService;
  constructor(private readonly db: PrismaClient) { this.ledger = new LedgerService(db); }

  private async snapshot(tx: Prisma.TransactionClient): Promise<FinancialSnapshot> {
    const profile = await tx.profile.findUnique({ where: { id: DEMO_PROFILE_ID } });
    if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Run the seed command before reading pending-plan assessments');
    const accounts = await tx.account.findMany({ where: { profileId: profile.id }, orderBy: { id: 'asc' } });
    return { profile, accounts };
  }

  private async assess(tx: Prisma.TransactionClient, row: PlanSnapshot, snapshot: FinancialSnapshot, assessedAt: string, fingerprint: string): Promise<PendingPlanAssessment> {
    const base = {
      plan_id: row.id, plan_status: 'pending' as const, assessed_at: assessedAt,
      financial_context_fingerprint: fingerprint,
      plan_snapshot_fingerprint: payloadHash({ quote: row.quoteJson, context: row.contextJson }),
      assessment_scope: 'individual_plan' as const, acknowledgement_cannot_override_insufficient_funds: true as const,
    };
    let quote: PendingPlanAssessment['quote'] = null;
    let fundingAccount: string | null = null;
    try {
      const selection = selectionSchema.parse({ quote: JSON.parse(row.quoteJson) as unknown, context: JSON.parse(row.contextJson) as unknown });
      quote = { quote_id: selection.quote.quote_id, badge: selection.quote.badge };
      const activity = quoteActivity(selection);
      fundingAccount = activity.source_account;
      // The adapter's existing total/principal/fee-account checks define debit semantics.
      // fee_behavior=unspecified affects safe-principal advice, not a complete stored debit.
      const { response: preview } = await assessActivity(tx, this.ledger, activity, {
        stage: 'reassessment', binding: { plan_id: row.id, selection }, feeBehavior: selection.context.fee_behavior,
      }, snapshot);
      preview.checked_at = assessedAt;
      const projectedDeficits = preview.account_impacts.filter(item => item.projected_balance.Money.amount_minor < 0).map(item => ({
        account_id: item.account_id,
        deficit: financialValue(-item.projected_balance.Money.amount_minor, item.projected_balance.Money.currency, item.projected_balance.badge),
      }));
      const insufficient = projectedDeficits.length > 0;
      const applicable = preview.reserve_check.applicability === 'applicable' || preview.other_account_reserve_check !== null;
      const risk = applicable && preview.requires_reserve_acknowledgement;
      const state: AssessmentState = insufficient ? 'Insufficient tracked funds' : risk ? 'Would breach reserve' : applicable ? 'Within reserve' : 'Reserve check not applicable';
      return {
        ...base, state, quote, funding_account: fundingAccount,
        affordability: insufficient ? 'insufficient' : 'sufficient', projected_deficits: projectedDeficits, preview,
        reason: {
          code: insufficient ? 'PROJECTED_ACCOUNT_DEFICIT' : risk ? 'PROJECTED_MYR_RESERVE_SHORTFALL' : applicable ? 'PROJECTED_WITHIN_MYR_RESERVE' : 'NO_MYR_FUNDING_DEBIT',
          message: insufficient
            ? 'This individual plan exceeds tracked funds. A reserve acknowledgement cannot make an unaffordable posting valid.'
            : risk ? 'This pending plan currently risks your reserve. This assessment does not establish which action caused or worsened that risk.'
              : applicable ? 'This individual plan is currently affordable without a projected MYR reserve shortfall.'
                : 'This individual plan has sufficient tracked funds. MYR reserves do not apply to its KRW funding account; no MYR debit is projected.',
        },
      };
    } catch (error) {
      if (!(error instanceof AppError || error instanceof z.ZodError || error instanceof SyntaxError)) throw error;
      return {
        ...base, state: 'Cannot assess', quote, funding_account: fundingAccount, affordability: 'unknown',
        projected_deficits: [], preview: null,
        reason: { code: error instanceof AppError ? error.code : 'INVALID_STORED_QUOTE', message: error instanceof AppError ? error.message : 'Stored quote or routing data is incomplete or invalid; obtain a complete supported quote with known debit semantics.' },
      };
    }
  }

  private async batch(tx: Prisma.TransactionClient, rows: PlanSnapshot[], snapshot: FinancialSnapshot) {
    const assessedAt = new Date().toISOString();
    const fingerprint = financialContextFingerprint(snapshot);
    const items: PendingPlanAssessment[] = [];
    for (const row of rows) items.push(await this.assess(tx, row, snapshot, assessedAt, fingerprint));
    const funding = snapshot.accounts.find(account => account.id === 'myr_funding');
    if (!funding) throw new AppError(409, 'INCOMPLETE_PROFILE', 'MYR Funding account is missing');
    return {
      status: 'available' as const, assessed_at: assessedAt, financial_context_fingerprint: fingerprint,
      assessment_scope: 'individual_plan' as const, notice: INDEPENDENT_PLAN_NOTICE,
      actual_current_budget: budgetResponse(snapshot.profile, funding), items,
    };
  }

  /** Fixed query count: one owned cursor lookup, profile/accounts, and a bounded plan page. */
  async list(raw: unknown) {
    const query = assessmentQuerySchema.parse(raw);
    try {
      return await this.db.$transaction(async tx => {
        const snapshot = await this.snapshot(tx);
        const boundary = query.cursor ? await tx.planRecord.findUnique({ where: { id: query.cursor }, select: { id: true, profileId: true, createdAt: true } }) : null;
        if (query.cursor && (!boundary || boundary.profileId !== snapshot.profile.id)) throw new AppError(400, 'INVALID_CURSOR', 'Assessment cursor does not belong to this profile');
        const rows = await tx.planRecord.findMany({
          where: { profileId: snapshot.profile.id, status: 'pending', ...(boundary ? { OR: [
            { createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } },
          ] } : {}) },
          select: planSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
        });
        const page = rows.slice(0, query.limit);
        return { ...await this.batch(tx, page, snapshot), next_cursor: rows.length > query.limit ? page.at(-1)!.id : null };
      }, { timeout: 15000 });
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) throw error;
      return assessmentsUnavailable();
    }
  }

  /** Reuses Home's snapshot; all active counts and at most three relevant cards, no per-plan queries. */
  async summaryInTransaction(tx: Prisma.TransactionClient, snapshot: FinancialSnapshot) {
    const rows = await tx.planRecord.findMany({ where: { profileId: snapshot.profile.id, status: 'pending' }, select: planSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const batch = await this.batch(tx, rows, snapshot);
    const counts: Record<AssessmentState, number> = {
      'Within reserve': 0, 'Would breach reserve': 0, 'Insufficient tracked funds': 0, 'Reserve check not applicable': 0, 'Cannot assess': 0,
    };
    for (const item of batch.items) counts[item.state]++;
    const priority: Record<AssessmentState, number> = { 'Insufficient tracked funds': 0, 'Would breach reserve': 1, 'Cannot assess': 2, 'Within reserve': 3, 'Reserve check not applicable': 4 };
    const relevant = batch.items.filter(item => priority[item.state] < 3).sort((a, b) => priority[a.state] - priority[b.state]);
    return {
      status: batch.status, assessed_at: batch.assessed_at, financial_context_fingerprint: batch.financial_context_fingerprint,
      assessment_scope: batch.assessment_scope, notice: batch.notice, actual_current_budget: batch.actual_current_budget,
      pending_count: rows.length, risk_counts: counts, cards: relevant.slice(0, 3), cards_limit: 3, more_risk_cards: relevant.length > 3,
    };
  }
}

export type PendingPlanRiskSummary = Awaited<ReturnType<PendingPlanRiskService['summaryInTransaction']>> | ReturnType<typeof assessmentsUnavailable>;
