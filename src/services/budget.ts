import type { Account, Profile } from '@prisma/client';
import { deriveBadge, financialValue, readBadge } from '../domain/provenance.js';
import { safeNumber } from '../domain/validation.js';

/** Shared integer-only reserve calculation for Home, plan previews and atomic confirmation. */
export function budgetAmounts(profile: Profile, funding: Account) {
  const total = profile.fixedReserveMinor + profile.emergencyReserveMinor;
  const available = funding.balanceMinor - total;
  return { total, available, maxSafe: available > 0n ? available : 0n, shortfall: available < 0n ? -available : 0n };
}

export function budgetResponse(profile: Profile, funding: Account) {
  const reserveInputs = [readBadge(profile.fixedReserveBadgeJson), readBadge(profile.emergencyBadgeJson)];
  const allInputs = [readBadge(funding.balanceBadgeJson), ...reserveInputs];
  const { total, available, maxSafe, shortfall } = budgetAmounts(profile, funding);
  return {
    status: available > 0n ? 'Above reserve' : available === 0n ? 'At reserve' : 'Below reserve',
    badge: deriveBadge(allInputs, 'Compare MYR Funding balance with fixed-expense reserve + emergency reserve; KRW accounts are excluded'),
    total_reserve: financialValue(safeNumber(total), 'MYR', deriveBadge(reserveInputs, 'FixedReserve + EmergencyReserve')),
    available_above_reserve: financialValue(safeNumber(available), 'MYR', deriveBadge(allInputs, 'MYR Funding balance - (FixedReserve + EmergencyReserve); signed value')),
    max_safe_total_debit: financialValue(safeNumber(maxSafe), 'MYR', deriveBadge(allInputs, 'max(0, MYR Funding balance - TotalReserve)')),
    reserve_shortfall: financialValue(safeNumber(shortfall), 'MYR', deriveBadge(allInputs, 'max(0, TotalReserve - MYR Funding balance)')),
  };
}
