/** Agreed integration contract. No backend-only fields belong in these models. */
export type Currency = 'MYR' | 'KRW';

/** Sen for MYR; whole won for KRW. Signed only inside LedgerEntry.lines. */
export interface Money {
  amount_minor: number;
  currency: Currency;
}

export interface Badge {
  status: 'User-Entered' | 'User-Confirmed' | 'Simulated' | 'Indicative' | 'Live';
  source?: string;
  timestamp: string;
}

/** PROVISIONAL: free text until Steve agrees the vocabulary; no shared enums. */
export type QuoteObjective = string;
export type QuoteMode = string;
export type FundingSource = string;
export type Provider = string;
/** PROVISIONAL: positive base-10 decimal string, quote units per one base unit. */
export type Rate = string;

export interface Quote {
  quote_id: string;
  objective: QuoteObjective;
  mode: QuoteMode;
  funding_source: FundingSource;
  provider: Provider;
  rate: Rate;
  principal: Money;
  fees: { label: string; Money: Money }[];
  total_debit: Money;
  net_received: Money;
  badge: Badge;
}

export interface RateSnapshot {
  pair: string;
  rate: Rate;
  badge: Badge;
}

export interface Plan {
  plan_id: string;
  quote: Quote;
  status: 'pending' | 'completed' | 'cancelled';
  reserve_breached: boolean;
}

export interface LedgerEntry {
  entry_id: string;
  type: 'income' | 'exchange' | 'atm_withdrawal' | 'fee' | 'settlement';
  lines: { account: string; Money: Money }[];
  badge: Badge;
}

/** amount remains the original receipt amount, including after partial settlement. */
export interface Receivable {
  receivable_id: string;
  debtor: string;
  amount: Money;
  snapshot: RateSnapshot;
  settled: boolean;
}
