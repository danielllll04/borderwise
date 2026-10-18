import type { Badge, Money } from '../shared/models.js';

/** Response wrapper: shared Money remains unchanged. */
export interface FinancialValue {
  Money: Money;
  badge: Badge;
}

export function makeBadge(status: Badge['status'], source: string): Badge {
  return { status, source, timestamp: new Date().toISOString() };
}

// Conservative propagation: synthetic/indicative inputs cannot become Live.
const precedence: Badge['status'][] = ['Simulated', 'Indicative', 'User-Entered', 'User-Confirmed', 'Live'];

export function deriveBadge(inputs: Badge[], calculation: string): Badge {
  const status = precedence.find(candidate => inputs.some(input => input.status === candidate)) ?? 'Simulated';
  return makeBadge(status, calculation);
}

export function readBadge(json: string): Badge {
  return JSON.parse(json) as Badge;
}

export function financialValue(amount: number, currency: Money['currency'], badge: Badge): FinancialValue {
  return { Money: { amount_minor: amount, currency }, badge };
}
