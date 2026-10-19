import type { Decision } from './inputs.js';
import { DEMO_EXCHANGE_SELECTION } from '../integrations/compare-fixture.js';
import { quoteActivity } from '../integrations/compare-adapter.js';
import { selectionSchema, type Selection } from '../services/plan-inputs.js';
import { payloadHash } from '../domain/idempotency.js';
import { ACCOUNTS } from '../domain/accounts.js';

export interface ComparisonOption {
  selection: Selection;
  rank: number;
  funding_match?: 'requested' | 'alternative';
  /** Proposed internal adapter metadata; not part of the shared Quote model. */
  compatibility?: { status: 'unknown'; reason: string } | { status: 'compatible' | 'incompatible'; card_network: string; evidence: { source: string; timestamp: string } };
  assumptions: {
    confirmed: boolean;
    fee_debits: 'separate_account_debits';
    net_received: 'destination_credit_before_separate_account_fees';
    fixed_fee_assertion: 'fixture_only' | 'compare_confirmed' | 'unresolved';
  };
}
export type Comparison =
  | { status: 'ready'; source: 'simulated_fixture' | 'compare'; ranking: string; options: ComparisonOption[] }
  | { status: 'requote_required' | 'unsupported'; reason: string; options: [] };
export interface CompareAdapter {
  /** Synchronous adapter policy: require a network before ATM compatibility filtering. */
  requiresCardNetwork?(decision: Decision): boolean;
  compare(decision: Decision): Promise<Comparison>;
}

type FixtureDecision = Required<Omit<Decision, 'card_network'>>;
interface Fixture { decision: FixtureDecision; options: ComparisonOption[] }
const simulatedBadge = { status: 'Simulated' as const, source: 'BorderWise Agent Compare fixture; fictional option, no live rate or real provider offer', timestamp: '2026-10-18T00:00:00.000Z' };
function fixtureOption(id: string, principal: number, fee: number, received: number, total: number, rank: number, behavior: Selection['context']['fee_behavior'] = 'fixed', cash = false, funding: 'myr_funding' | 'krw_card' = 'myr_funding', rate = '298'): ComparisonOption {
  const currency = funding === 'myr_funding' ? 'MYR' : 'KRW';
  const selection = selectionSchema.parse({
    quote: { ...DEMO_EXCHANGE_SELECTION.quote, quote_id: id, objective: cash ? 'atm_withdrawal' : 'exchange',
      mode: 'local-simulation', funding_source: funding, provider: `Simulated option ${rank}`, rate: funding === 'krw_card' ? '1' : rate,
      principal: { amount_minor: principal, currency }, fees: [{ label: 'Simulated separate account fee', Money: { amount_minor: fee, currency } }],
      total_debit: { amount_minor: total, currency }, net_received: { amount_minor: received, currency: 'KRW' }, badge: simulatedBadge },
    context: { destination_account: cash ? 'krw_cash' : 'krw_card', fee_accounts: [funding], fee_behavior: behavior },
  });
  quoteActivity(selection); // Existing Priority 3 money/currency/fee-consistency validation.
  return { selection, rank, assumptions: { confirmed: true, fee_debits: 'separate_account_debits', net_received: 'destination_credit_before_separate_account_fees', fixed_fee_assertion: 'fixture_only' } };
}
const fixtureDecision = (amount: number, basis: FixtureDecision['amount_basis'], cash = false, funding: 'myr_funding' | 'krw_card' = 'myr_funding', currency: 'MYR' | 'KRW' = 'MYR'): FixtureDecision => ({
  objective: cash ? 'atm_withdrawal' : 'exchange', amount: { amount_minor: amount, currency }, amount_basis: basis,
  funding_account: funding, destination_account: cash ? 'krw_cash' : 'krw_card',
});

// Complete immutable price examples only. Never scale these to another requested amount.
const FIXTURES: Fixture[] = [
  { decision: fixtureDecision(30000, 'principal'), options: [fixtureOption('agent-exchange-myr300-a-v1', 30000, 300, 89400, 30300, 1), fixtureOption('agent-exchange-myr300-b-v1', 30000, 150, 88800, 30150, 2, 'fixed', false, 'myr_funding', '296')] },
  { decision: fixtureDecision(30000, 'total_debit_budget'), options: [fixtureOption('agent-budget-myr300-a-v1', 29700, 300, 88506, 30000, 1)] },
  { decision: fixtureDecision(250000, 'principal'), options: [fixtureOption('agent-exchange-myr2500-a-v1', 250000, 300, 745000, 250300, 1), fixtureOption('agent-exchange-myr2500-variable-v1', 250000, 500, 745000, 250500, 2, 'percentage')] },
  { decision: fixtureDecision(90000, 'destination_target', true, 'myr_funding', 'KRW'), options: [fixtureOption('agent-cash-krw90000-from-myr-v1', 30000, 500, 90000, 30500, 1, 'fixed', true, 'myr_funding', '300'), { ...fixtureOption('agent-cash-krw90000-card-alternative-v1', 90000, 1000, 90000, 91000, 2, 'fixed', true, 'krw_card'), funding_match: 'alternative' }] },
  { decision: fixtureDecision(90000, 'destination_target', true, 'krw_card', 'KRW'), options: [fixtureOption('agent-cash-krw90000-from-card-v1', 90000, 1000, 90000, 91000, 1, 'fixed', true, 'krw_card')] },
];

export class FixtureCompareAdapter implements CompareAdapter {
  requiresCardNetwork(decision: Decision) { return decision.objective === 'atm_withdrawal'; }
  async compare(decision: Decision): Promise<Comparison> {
    if (this.requiresCardNetwork(decision) && !decision.card_network) return { status: 'unsupported', reason: 'Card network is required before ATM compatibility filtering.', options: [] };
    const funding = decision.funding_account ? ACCOUNTS[decision.funding_account] : null;
    const destination = decision.destination_account ? ACCOUNTS[decision.destination_account] : null;
    if (funding && destination && decision.amount) {
      const currency = decision.amount_basis === 'destination_target' ? destination.currency : funding.currency;
      if (currency !== decision.amount.currency) return { status: 'unsupported', reason: 'Requested amount currency does not match the chosen funding basis or owned destination account.', options: [] };
      if (funding.id === destination.id || decision.objective === 'exchange' && funding.currency === destination.currency) return { status: 'unsupported', reason: 'An exchange needs different owned accounts and currencies.', options: [] };
      if (decision.objective === 'atm_withdrawal' && (funding.id === 'krw_cash' || destination.id !== 'krw_cash')) return { status: 'unsupported', reason: 'Supported cash withdrawals move MYR Funding or KRW Card into KRW Cash.', options: [] };
    }
    // Price fixtures have no network evidence. A network must never turn them into compatibility claims.
    const priceDecision = { ...decision };
    delete priceDecision.card_network;
    const fixture = FIXTURES.find(item => payloadHash(item.decision) === payloadHash(priceDecision));
    if (!fixture) return { status: 'requote_required', reason: 'No complete simulated quote exists for this exact request. Ask Compare for a revised quote; the Agent cannot generate or scale one.', options: [] };
    const options = structuredClone(fixture.options).map(option => decision.objective === 'atm_withdrawal'
      ? { ...option, compatibility: { status: 'unknown' as const, reason: 'Simulated price fixture has no ATM/network compatibility evidence. Verify with the ATM/card provider.' } } : option);
    return { status: 'ready', source: 'simulated_fixture', ranking: 'Static fixture order supplied by adapter; no claim of market best price.', options };
  }
}

/** Reject ambiguous future integrations instead of guessing unresolved fee semantics. */
export function validateComparison(result: Comparison, decision: Decision): Comparison {
  if (result.status !== 'ready') return result;
  if (result.options.length === 0 || result.options.length > 3) return { status: 'unsupported', reason: 'Compare must return a bounded set of complete options.', options: [] };
  const options = result.options.map(option => {
    const evidence = option.compatibility;
    const supported = evidence && evidence.status !== 'unknown'
      && decision.card_network && decision.card_network !== 'unknown' && evidence.card_network.toLowerCase() === decision.card_network
      && evidence.evidence?.source?.trim() && Number.isFinite(Date.parse(evidence.evidence.timestamp));
    return { ...option, selection: selectionSchema.parse(option.selection), ...(decision.objective === 'atm_withdrawal' ? {
      compatibility: supported && result.source !== 'simulated_fixture' ? evidence
        : { status: 'unknown' as const, reason: 'No supporting ATM/network compatibility data for this request. Verify with the ATM/card provider.' },
    } : {}) };
  });
  if (options.some(option => {
    const quote = option.selection.quote;
    const value = decision.amount_basis === 'destination_target' ? quote.net_received : decision.amount_basis === 'total_debit_budget' ? quote.total_debit : quote.principal;
    return quote.objective !== decision.objective || option.selection.context.destination_account !== decision.destination_account
      || (quote.funding_source !== decision.funding_account && option.funding_match !== 'alternative')
      || !decision.amount || value.currency !== decision.amount.currency || value.amount_minor !== decision.amount.amount_minor;
  })) return { status: 'unsupported', reason: 'Compare must return complete quotes matching the requested objective, amount basis, currency and routing; alternative funding must be explicit.', options: [] };
  if (options.some(option => option.assumptions.confirmed !== true || !['fixture_only', 'compare_confirmed'].includes(option.assumptions.fixed_fee_assertion)
    || result.source === 'compare' && option.assumptions.fixed_fee_assertion !== 'compare_confirmed'
    || option.assumptions.fee_debits !== 'separate_account_debits' || option.assumptions.net_received !== 'destination_credit_before_separate_account_fees'
    || !Number.isSafeInteger(option.rank) || option.rank < 1
    || (result.source === 'simulated_fixture' && option.selection.quote.badge.status !== 'Simulated'))) {
    return { status: 'unsupported', reason: 'Compare fee/net-received semantics or fee assertions are unresolved; a confirmed revised quote is required.', options: [] };
  }
  if (options.some((option, index) => index > 0 && option.rank < options[index - 1]!.rank)) return { status: 'unsupported', reason: 'Compare must supply options in its authoritative ranked order.', options: [] };
  for (const option of options) quoteActivity(option.selection);
  return { ...result, options };
}
