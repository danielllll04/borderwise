import type { Prisma } from '@prisma/client';
import { payloadHash } from '../domain/idempotency.js';
import { AppError } from '../domain/errors.js';
import { deriveBadge, financialValue, readBadge } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';
import type { Currency } from '../shared/models.js';
import { budgetAmounts, budgetResponse } from './budget.js';
import type { FinancialSnapshot, LedgerService } from './ledger.js';
import type { ExchangeInput, AtmInput } from './posting-inputs.js';
import type { Selection } from './plan-inputs.js';

interface PreviewContext {
  stage: 'save' | 'completion' | 'reassessment';
  binding: unknown;
  feeBehavior?: Selection['context']['fee_behavior'];
}

/** Uses the ledger's exact validation/projection and the same reserve arithmetic as Home. */
export async function assessActivity(
  tx: Prisma.TransactionClient, ledger: LedgerService, activity: ExchangeInput | AtmInput, context: PreviewContext,
  snapshot?: FinancialSnapshot,
) {
  const prepared = context.stage === 'reassessment'
    ? await ledger.projectInTransaction(tx, activity, snapshot)
    : await ledger.prepareInTransaction(tx, activity);
  const funding = prepared.changes.find(change => change.account.id === activity.source_account)!;
  const myr = prepared.accounts.find(account => account.id === 'myr_funding');
  if (!myr) throw new AppError(409, 'INCOMPLETE_PROFILE', 'MYR Funding is missing; run the seed command');
  const myrChange = prepared.changes.find(change => change.account.id === 'myr_funding');
  const reserveApplies = (myrChange?.debit ?? 0n) > 0n;
  const myrFunded = activity.source_account === 'myr_funding';
  const budget = budgetResponse(prepared.profile, myr);
  const amounts = budgetAmounts(prepared.profile, myr);
  const reserveInputs = [readBadge(myr.balanceBadgeJson), readBadge(prepared.profile.fixedReserveBadgeJson), readBadge(prepared.profile.emergencyBadgeJson)];
  const reserveMovementInputs = myrChange?.inputBadges ?? [];
  const reserveBadge = deriveBadge([...reserveInputs, ...reserveMovementInputs], 'Projected MYR Funding balance after all principal movements and separate fee debits compared with fixed-expense + emergency reserve');
  const myrProjected = myrChange?.next ?? myr.balanceMinor;
  const shortfall = myrProjected < amounts.total ? amounts.total - myrProjected : 0n;
  const requiresAcknowledgement = reserveApplies && shortfall > 0n;
  const checkInputs = {
    stage: context.stage, binding: context.binding,
    accounts: prepared.changes.map(change => ({
      account_id: change.account.id, balance_minor: safeNumber(change.account.balanceMinor),
      balance_badge: readBadge(change.account.balanceBadgeJson),
    })),
    reserves: reserveApplies ? {
      fixed: safeNumber(prepared.profile.fixedReserveMinor), emergency: safeNumber(prepared.profile.emergencyReserveMinor),
      fixed_badge: readBadge(prepared.profile.fixedReserveBadgeJson), emergency_badge: readBadge(prepared.profile.emergencyBadgeJson),
    } : null,
  };
  const checkToken = payloadHash(checkInputs);
  const fixedMyrFees = context.stage !== 'completion' && activity.source_account === 'myr_funding'
    && activity.principal.currency === 'MYR' && context.feeBehavior === 'fixed'
    && activity.fees.every(fee => fee.Money.currency === 'MYR' && fee.account_id === 'myr_funding');
  const feeTotal = fixedMyrFees ? activity.fees.reduce((sum, fee) => sum + BigInt(fee.Money.amount_minor), 0n) : 0n;
  const safePrincipal = fixedMyrFees && amounts.maxSafe > feeTotal ? amounts.maxSafe - feeTotal : 0n;
  const safe = fixedMyrFees ? {
    status: safePrincipal > 0n ? 'available' : 'no_positive_principal',
    amount: financialValue(safeNumber(safePrincipal), 'MYR', deriveBadge([...reserveInputs, activity.badge], 'max(0, MaxSafeTotalDebit - sum of fixed MYR quote fees)')),
    reason: safePrincipal > 0n
      ? 'Request a revised quote from Compare for this principal; no quote fields have been changed.'
      : 'Fixed fees consume all safe debit, or no safe debit remains; no positive safe principal is available.',
    revised_quote_required_to_change_principal: true,
  } : {
    status: context.stage !== 'completion' && activity.source_account === 'myr_funding' ? 'revised_quote_required' : 'not_applicable',
    amount: null,
    reason: context.stage === 'completion'
      ? 'Report actual completed amounts; a completion preview does not recommend changing historical facts.'
      : activity.source_account !== 'myr_funding'
        ? 'MYR safe principal does not apply to a KRW-funded principal.'
        : 'Safe principal requires fixed MYR fees; percentage, tiered, mixed-currency or unspecified fees require a revised quote from Compare.',
    revised_quote_required_to_change_principal: true,
  };
  const projectedBadge = deriveBadge([readBadge(funding.account.balanceBadgeJson), ...funding.inputBadges], 'Current funding balance + projected signed principal and separate fee lines');
  const myrReserveCheck = {
    applicability: 'applicable',
    reason: 'Checks MYR Funding debits, including separately paid MYR fees.',
    current_balance: financialValue(safeNumber(myr.balanceMinor), 'MYR', readBadge(myr.balanceBadgeJson)),
    total_debit: financialValue(safeNumber(myrChange?.debit ?? 0n), 'MYR', deriveBadge(reserveMovementInputs, 'Sum of principal and fee debits from MYR Funding')),
    projected_balance: financialValue(safeNumber(myrProjected), 'MYR', reserveBadge),
    total_reserve: budget.total_reserve,
    projected_reserve_shortfall: financialValue(safeNumber(shortfall), 'MYR', reserveBadge),
    max_safe_total_debit: budget.max_safe_total_debit,
  };
  const noFundingReserveCheck = {
    applicability: 'not_applicable', reason: 'KRW-funded principal: MYR reserves are not subtracted from this funding account.',
    current_balance: null, total_debit: null, projected_balance: null,
    total_reserve: null, projected_reserve_shortfall: null, max_safe_total_debit: null,
  };
  const response = {
    checked_at: new Date().toISOString(), check_token: checkToken,
    funding_account: activity.source_account, destination_account: activity.destination_account,
    current_balance: financialValue(safeNumber(funding.account.balanceMinor), activity.principal.currency, readBadge(funding.account.balanceBadgeJson)),
    principal: financialValue(activity.principal.amount_minor, activity.principal.currency, activity.badge),
    fees: activity.fees.map(fee => ({ label: fee.label, account_id: fee.account_id, ...financialValue(fee.Money.amount_minor, fee.Money.currency, fee.badge) })),
    total_debit: financialValue(safeNumber(funding.debit), activity.principal.currency, deriveBadge([activity.badge, ...activity.fees.filter(fee => fee.account_id === activity.source_account).map(fee => fee.badge)], 'Principal + fees debited from the funding account; other-account fees are separate')),
    amount_received: financialValue(activity.received.amount_minor, activity.received.currency, activity.badge),
    projected_balance: financialValue(safeNumber(funding.next), activity.principal.currency, projectedBadge),
    total_reserve: myrFunded ? budget.total_reserve : null,
    projected_reserve_shortfall: myrFunded ? financialValue(safeNumber(shortfall), 'MYR', reserveBadge) : null,
    requires_reserve_acknowledgement: requiresAcknowledgement,
    reserve_check: myrFunded ? myrReserveCheck : noFundingReserveCheck,
    // KRW principal stays N/A. An independently paid MYR fee still has its own reserve impact.
    other_account_reserve_check: !myrFunded && reserveApplies ? myrReserveCheck : null,
    safe_principal: safe,
    account_impacts: prepared.changes.map(change => {
      const currency = change.account.currency as Currency;
      const inputs = [readBadge(change.account.balanceBadgeJson), ...change.inputBadges];
      return {
        account_id: change.account.id,
        current_balance: financialValue(safeNumber(change.account.balanceMinor), currency, readBadge(change.account.balanceBadgeJson)),
        total_debits: financialValue(safeNumber(change.debit), currency, deriveBadge(change.inputBadges, 'Sum of separate principal and fee debits on this account')),
        total_credits: financialValue(safeNumber(change.credit), currency, deriveBadge(change.inputBadges, 'Sum of principal credits on this account')),
        projected_balance: financialValue(safeNumber(change.next), currency, deriveBadge(inputs, 'Current account balance + credits - debits, including separate fees')),
      };
    }),
  };
  return { response, input_provenance: checkInputs };
}

export type ActivityAssessment = Awaited<ReturnType<typeof assessActivity>>;
