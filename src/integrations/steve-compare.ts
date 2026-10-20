import { z } from 'zod';
import { SteveHttpClient } from './steve-http.js';
import { Decimal } from 'decimal.js';
import { AppError } from '../domain/errors.js';
import { badgeSchema, moneySchema, positiveMoneySchema } from '../domain/validation.js';
import { payloadHash } from '../domain/idempotency.js';
import { selectionSchema } from '../services/plan-inputs.js';
import { quoteActivity } from './compare-adapter.js';
import type { Decision } from '../agent/inputs.js';
import type { CompareAdapter, Comparison, ComparisonOption } from '../agent/compare.js';

const text = z.string().trim().min(1).max(200);
const mapUrl = z.string().max(2000).url().refine(value => new URL(value).protocol === 'https:');
const atmSchema = z.object({
  bank_name: text, location_name: text, distance_meters: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  supported_networks: z.array(text).max(20), map_url: mapUrl, kakao_map_url: mapUrl.nullish(),
  withdrawal_guide: z.string().min(1).max(3000),
}).strict();
const upstreamQuoteSchema = z.object({
  quote_id: text, objective: z.enum(['exchange_before_spending', 'withdraw_atm_cash', 'pay_by_card']),
  mode: z.enum(['fixed_myr_budget', 'fixed_krw_target']), funding_source: z.enum(['MYR_BANK', 'KRW_CARD']),
  provider: text, rate: z.number().finite().positive(), principal: positiveMoneySchema,
  fees: z.array(z.object({ label: text, money: moneySchema, original_display: z.string().max(500).nullish() }).strict()).max(50),
  total_debit: positiveMoneySchema, net_received: positiveMoneySchema, atm_info: atmSchema.nullish(), badge: badgeSchema,
}).strict();
type SteveQuote = z.infer<typeof upstreamQuoteSchema>;
const networks: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', unionpay: 'UnionPay', plus: 'Plus' };
const unsupported = (reason: string): Comparison => ({ status: 'unsupported', reason, options: [] });

/** Only a trusted server setting can select this origin. Request/model arguments contain no URL. */
export class SteveCompareAdapter implements CompareAdapter {
  constructor(private readonly baseUrl = process.env.STEVE_COMPARE_BASE_URL ?? process.env.STEVE_BASE_URL, private readonly timeout = process.env.STEVE_COMPARE_TIMEOUT_MS ?? '5000') {}
  requiresCardNetwork(decision: Decision) { return decision.objective === 'atm_withdrawal'; }

  private request(path: string, body?: unknown) {
    return new SteveHttpClient(this.baseUrl, this.timeout, 'COMPARE').request(path, body);
  }

  async compare(decision: Decision): Promise<Comparison> {
    if (!decision.objective || !decision.amount || !decision.amount_basis || !decision.funding_account || !decision.destination_account) return unsupported('Complete the objective, amount basis, currency and owned accounts before Compare.');
    if (decision.funding_account !== 'myr_funding') return unsupported('Steve currently expresses principal, fees and total debit in MYR, including its KRW_CARD quotes. KRW-funded quotes cannot safely be mapped to the owned KRW Card account.');
    if (decision.amount_basis === 'principal') return unsupported('Steve supports total MYR budgets including fees or KRW destination targets, not source principal amounts. Specify a total budget or a KRW target; no principal was reinterpreted.');
    const atm = decision.objective === 'atm_withdrawal';
    if (decision.destination_account !== (atm ? 'krw_cash' : 'krw_card')) return unsupported('Supported Steve routing is MYR Funding to KRW Cash for ATM, or MYR Funding to KRW Card for exchange. Other destinations need an agreed provider routing contract.');
    if (atm && !decision.card_network) return unsupported('Specify the ATM card network, or explicitly unknown.');
    if (atm && decision.card_network !== 'unknown' && !networks[decision.card_network!]) return unsupported('Steve supports Visa, Mastercard, UnionPay and Plus only. This network was not treated as unknown or compatible.');
    const budget = decision.amount_basis === 'total_debit_budget';
    if (decision.amount.currency !== (budget ? 'MYR' : 'KRW')) return unsupported('A total budget must use MYR sen; a destination target must use KRW whole won.');
    const request = {
      objective: atm ? 'withdraw_atm_cash' : 'exchange_before_spending',
      mode: budget ? 'fixed_myr_budget' : 'fixed_krw_target', amount: decision.amount, funding_source: 'MYR_BANK',
      ...(atm && decision.card_network !== 'unknown' ? { card_network: networks[decision.card_network!] } : {}),
    };
    const result = z.array(upstreamQuoteSchema).max(4).safeParse(await this.request('/api/compare/quotes', request));
    if (!result.success) throw new AppError(502, 'COMPARE_INVALID_RESPONSE', 'Steve Compare returned unsupported or malformed quote fields. No quote was trusted.');
    if (!result.data.length) return unsupported('Steve returned no options for this exact budget/target, funding and network. Change the request or retry; no fixture was substituted.');
    if (new Set(result.data.map(q => q.quote_id)).size !== result.data.length) throw new AppError(502, 'COMPARE_INVALID_RESPONSE', 'Steve Compare returned duplicate quote identifiers.');
    // Verify the calculation service's actual quote-store API before trusting local snapshots.
    await Promise.all(result.data.map(async quote => {
      const stored = upstreamQuoteSchema.safeParse(await this.request('/api/compare/quotes/' + encodeURIComponent(quote.quote_id)));
      if (!stored.success || payloadHash(stored.data) !== payloadHash(quote)) throw new AppError(502, 'COMPARE_INVALID_RESPONSE', 'Steve quote storage did not match the comparison response. Retry Compare.');
    }));
    try {
      const options = result.data.map((quote, index) => this.mapQuote(quote, decision, request, index + 1));
      return { status: 'ready', source: 'compare', ranking: budget
        ? 'Steve response order: descending KRW received for the exact total MYR budget; seeded Simulated data.'
        : 'Steve response order: ascending total MYR debit for the exact KRW target; seeded Simulated data.', options };
    } catch (error) {
      if (error instanceof AppError && error.code === 'COMPARE_INVALID_RESPONSE') throw error;
      throw new AppError(502, 'COMPARE_INVALID_RESPONSE', 'Steve quote amounts, currencies, provenance or routing did not reconcile. No quote was trusted.');
    }
  }

  private mapQuote(quote: SteveQuote, decision: Decision, request: Record<string, unknown>, rank: number): ComparisonOption {
    if (quote.objective !== request.objective || quote.mode !== request.mode || quote.funding_source !== 'MYR_BANK'
      || quote.principal.currency !== 'MYR' || quote.total_debit.currency !== 'MYR' || quote.net_received.currency !== 'KRW'
      || quote.fees.some(f => f.money.currency !== 'MYR') || !['Simulated', 'Indicative'].includes(quote.badge.status)) throw new Error();
    const value = decision.amount_basis === 'total_debit_budget' ? quote.total_debit : quote.net_received;
    if (value.currency !== decision.amount!.currency || value.amount_minor !== decision.amount!.amount_minor) throw new Error();
    const badge = { ...quote.badge, status: 'Simulated' as const, source: `Steve seeded Compare (not live); ${quote.badge.source}` };
    const selection = selectionSchema.parse({
      quote: { quote_id: quote.quote_id, objective: decision.objective, mode: quote.mode, funding_source: 'myr_funding',
        provider: quote.provider, rate: new Decimal(String(quote.rate)).toFixed(), principal: quote.principal,
        fees: quote.fees.map(fee => ({ label: fee.label, Money: fee.money })), total_debit: quote.total_debit, net_received: quote.net_received, badge },
      context: { destination_account: decision.destination_account, fee_accounts: quote.fees.map(() => 'myr_funding'), fee_behavior: 'unspecified' },
    });
    quoteActivity(selection); // Reconcile integer principal + each separate MYR fee exactly once.
    let compatibility: ComparisonOption['compatibility'];
    if (decision.objective === 'atm_withdrawal') {
      if (!quote.atm_info) throw new Error();
      if (decision.card_network === 'unknown') compatibility = { status: 'unknown', reason: 'Network explicitly unknown. Options are unfiltered seeded ATM examples; compatibility is not confirmed.' };
      else {
        if (!quote.atm_info.supported_networks.some(n => n.toLowerCase() === decision.card_network)) throw new Error();
        compatibility = { status: 'compatible', card_network: decision.card_network!, evidence: { source: badge.source + '; supported_networks in seeded ATM data only; verify with provider', timestamp: badge.timestamp } };
      }
    }
    return {
      selection, rank, ...(compatibility ? { compatibility } : {}), ...(quote.atm_info ? { atm_info: quote.atm_info } : {}),
      integration: { service: 'steve_compare', request, upstream_quote: quote, rate_direction: 'KRW per 1 MYR',
        rate_representation: 'Upstream JSON float converted to plain decimal string; no additional precision claimed',
        quote_storage: 'verified_upstream_in_memory_then_node_immutable_snapshot', retrieved_at: new Date().toISOString() },
      assumptions: { confirmed: true, fee_debits: 'separate_account_debits', net_received: 'destination_credit_before_separate_account_fees', fixed_fee_assertion: 'not_asserted' },
    };
  }
}
