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
  atm_provider?: AtmProviderFixture;
  /** Validated service metadata stays outside the agreed shared Quote. */
  atm_info?: { bank_name: string; location_name: string; distance_meters: number; supported_networks: string[]; map_url: string; kakao_map_url?: string | null | undefined; withdrawal_guide: string };
  integration?: { service: 'steve_compare'; request: Record<string, unknown>; upstream_quote: Record<string, unknown>; rate_direction: string; rate_representation: string; quote_storage: string; retrieved_at: string };
  /** Proposed internal adapter metadata; not part of the shared Quote model. */
  compatibility?: { status: 'unknown'; reason: string } | { status: 'compatible' | 'incompatible'; card_network: string; evidence: { source: string; timestamp: string } };
  assumptions: {
    confirmed: boolean;
    fee_debits: 'separate_account_debits';
    net_received: 'destination_credit_before_separate_account_fees';
    fixed_fee_assertion: 'fixture_only' | 'compare_confirmed' | 'not_asserted' | 'unresolved';
  };
}
export interface AtmProviderFixture {
  provider: string;
  bank_name: string;
  location_name: string;
  distance_meters: number;
  supported_networks: readonly ('UnionPay' | 'Visa' | 'Mastercard' | 'Plus')[];
  rate: string;
  home_bank_fee_sen: number;
  local_atm_fee_krw: number;
  map_url: string;
  kakao_map_url: string;
  withdrawal_guide: string;
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
export const ATM_PROVIDER_FIXTURES: readonly AtmProviderFixture[] = [
  {
    provider: 'KB Kookmin Bank Global ATM (Hongdae Branch)', bank_name: 'KB Kookmin Bank', location_name: 'Hongdae Branch', distance_meters: 120,
    supported_networks: ['Visa', 'Mastercard', 'Plus'], rate: '312.00', home_bank_fee_sen: 1200, local_atm_fee_krw: 3500,
    map_url: 'https://map.naver.com/p/search/KB%20Kookmin%20Bank%20Hongdae', kakao_map_url: 'https://map.kakao.com/link/search/KB%20Kookmin%20Bank%20Hongdae',
    withdrawal_guide: "Select 'Foreign Language' -> 'English/Chinese' -> 'Foreign Card' -> 'Withdrawal'. Always choose KRW (decline DCC).",
  },
  {
    provider: 'Shinhan Bank Global ATM (Hongdae Exit 9)', bank_name: 'Shinhan Bank', location_name: 'Hongdae Exit 9', distance_meters: 350,
    supported_networks: ['UnionPay', 'Visa', 'Mastercard'], rate: '311.50', home_bank_fee_sen: 1200, local_atm_fee_krw: 3500,
    map_url: 'https://map.naver.com/p/search/Shinhan%20Bank%20Hongdae', kakao_map_url: 'https://map.kakao.com/link/search/Shinhan%20Bank%20Hongdae',
    withdrawal_guide: "Tap 'Foreign Language' -> 'Foreign Card' -> 'Withdrawal'. Decline DCC conversion.",
  },
  {
    provider: 'Woori Bank Global ATM (Sinchon Station)', bank_name: 'Woori Bank', location_name: 'Sinchon Station', distance_meters: 220,
    supported_networks: ['UnionPay', 'Visa', 'Plus'], rate: '311.80', home_bank_fee_sen: 1200, local_atm_fee_krw: 3600,
    map_url: 'https://map.naver.com/p/search/Woori%20Bank%20Sinchon', kakao_map_url: 'https://map.kakao.com/link/search/Woori%20Bank%20Sinchon',
    withdrawal_guide: "Select 'Global ATM' button on the right screen before inserting card.",
  },
  {
    provider: 'CU Convenience Store ATM (Hongdae Street)', bank_name: 'CU Convenience Store ATM', location_name: 'Hongdae Street', distance_meters: 60,
    supported_networks: ['Visa', 'Mastercard'], rate: '309.00', home_bank_fee_sen: 1500, local_atm_fee_krw: 4000,
    map_url: 'https://map.naver.com/p/search/CU%20Hongdae', kakao_map_url: 'https://map.kakao.com/link/search/CU%20Hongdae',
    withdrawal_guide: 'Convenient 24/7 inside store, but carries highest local operator surcharge.',
  },
];
function fixtureOption(id: string, principal: number, fee: number, received: number, total: number, rank: number, behavior: Selection['context']['fee_behavior'] = 'fixed', cash = false, funding: 'myr_funding' | 'krw_card' = 'myr_funding', rate = '298', atmProvider?: AtmProviderFixture): ComparisonOption {
  const currency = funding === 'myr_funding' ? 'MYR' : 'KRW';
  const fees = atmProvider ? [
    { label: 'Home Bank Overseas ATM Fee', amount_minor: atmProvider.home_bank_fee_sen },
    { label: `Local ATM Operator Fee (₩${atmProvider.local_atm_fee_krw.toLocaleString('en-US')})`, amount_minor: Math.round((atmProvider.local_atm_fee_krw / Number(atmProvider.rate)) * 100) },
  ] : [{ label: 'Simulated separate account fee', amount_minor: fee }];
  const selection = selectionSchema.parse({
    quote: { ...DEMO_EXCHANGE_SELECTION.quote, quote_id: id, objective: cash ? 'atm_withdrawal' : 'exchange',
      mode: 'local-simulation', funding_source: funding, provider: atmProvider?.provider ?? `Simulated option ${rank}`, rate: funding === 'krw_card' ? '1' : (atmProvider?.rate ?? rate),
      principal: { amount_minor: principal, currency }, fees: fees.map(item => ({ label: item.label, Money: { amount_minor: item.amount_minor, currency } })),
      total_debit: { amount_minor: total, currency }, net_received: { amount_minor: received, currency: 'KRW' }, badge: simulatedBadge },
    context: { destination_account: cash ? 'krw_cash' : 'krw_card', fee_accounts: atmProvider ? [funding, funding] : [funding], fee_behavior: behavior },
  });
  quoteActivity(selection); // Existing Priority 3 money/currency/fee-consistency validation.
  return { selection, rank, ...(atmProvider ? { atm_provider: atmProvider } : {}), assumptions: { confirmed: true, fee_debits: 'separate_account_debits', net_received: 'destination_credit_before_separate_account_fees', fixed_fee_assertion: 'fixture_only' } };
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
  { decision: fixtureDecision(90000, 'destination_target', true, 'myr_funding', 'KRW'), options: [fixtureOption('agent-cash-krw90000-from-myr-v1', 30000, 500, 90000, 30500, 1, 'fixed', true, 'myr_funding', '300')] },
  { decision: fixtureDecision(100000, 'destination_target', true, 'myr_funding', 'KRW'), options: ATM_PROVIDER_FIXTURES.map((provider, index) => fixtureOption(
    `agent-atm-${provider.provider.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-v1`,
    [32052, 32103, 32072, 32363][index]!,
    0,
    100000,
    [34374, 34427, 34427, 35157][index]!,
    index + 1,
    'fixed',
    true,
    'myr_funding',
    provider.rate,
    provider,
  )) },
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
    const compatibleOptions = decision.objective === 'atm_withdrawal' && decision.card_network && decision.card_network !== 'unknown'
      ? fixture.options.filter(option => !option.atm_provider || option.atm_provider.supported_networks.some(network => network.toLowerCase() === decision.card_network!.toLowerCase()))
      : fixture.options;
    const options = structuredClone(compatibleOptions).map(option => decision.objective === 'atm_withdrawal'
      ? { ...option, compatibility: { status: 'unknown' as const, reason: 'Simulated price fixture has no ATM/network compatibility evidence. Verify with the ATM/card provider.' } } : option);
    return { status: 'ready', source: 'simulated_fixture', ranking: 'Static fixture order supplied by adapter; no claim of market best price.', options };
  }
}

/** Reject ambiguous future integrations instead of guessing unresolved fee semantics. */
export function validateComparison(result: Comparison, decision: Decision): Comparison {
  if (result.status !== 'ready') return result;
  if (result.options.length === 0 || result.options.length > 4) return { status: 'unsupported', reason: 'Compare must return a bounded set of complete options.', options: [] };
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
  if (options.some(option => option.assumptions.confirmed !== true || !['fixture_only', 'compare_confirmed', 'not_asserted'].includes(option.assumptions.fixed_fee_assertion)
    || option.assumptions.fixed_fee_assertion === 'not_asserted' && option.selection.context.fee_behavior !== 'unspecified'
    || result.source === 'compare' && !['compare_confirmed', 'not_asserted'].includes(option.assumptions.fixed_fee_assertion)
    || option.assumptions.fee_debits !== 'separate_account_debits' || option.assumptions.net_received !== 'destination_credit_before_separate_account_fees'
    || !Number.isSafeInteger(option.rank) || option.rank < 1
    || (result.source === 'simulated_fixture' && option.selection.quote.badge.status !== 'Simulated'))) {
    return { status: 'unsupported', reason: 'Compare fee/net-received semantics or fee assertions are unresolved; a confirmed revised quote is required.', options: [] };
  }
  if (options.some((option, index) => index > 0 && option.rank < options[index - 1]!.rank)) return { status: 'unsupported', reason: 'Compare must supply options in its authoritative ranked order.', options: [] };
  for (const option of options) quoteActivity(option.selection);
  return { ...result, options };
}
