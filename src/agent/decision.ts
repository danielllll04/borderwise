import { ACCOUNTS } from '../domain/accounts.js';
import { parseMajorMoney } from '../domain/validation.js';
import { AppError } from '../domain/errors.js';
import type { Decision } from './inputs.js';

export type ClarificationField = 'objective' | 'amount' | 'currency' | 'funding_account' | 'amount_basis' | 'destination_account' | 'card_network';
const questions: Record<ClarificationField, string> = {
  objective: 'Do you want to exchange into an owned account or withdraw cash?',
  amount: 'What amount do you need, and in which supported currency?',
  currency: 'Which supported currency do you mean?',
  funding_account: 'Which owned account will fund this: MYR Funding or KRW Card where supported?',
  amount_basis: 'Is this a principal amount, a total spending budget including fees, or a destination-currency target?',
  destination_account: 'Should the exchanged funds go to MYR Funding, KRW Card or KRW Cash?',
  card_network: 'Which card network will you use at the ATM (for example Visa or Mastercard)? If you do not know, say unknown; compatibility will remain unknown.',
};

/** Conservative slot parser, not an open-ended financial interpreter. Ambiguity stays explicit. */
export function understand(message: string, previous: Decision, supplied?: Decision, requiresCardNetwork: (decision: Decision) => boolean = () => false) {
  const lower = message.toLowerCase();
  const unsupportedCurrency = /\b(?:usd|eur|gbp|sgd|jpy|cny|rmb|aud|thb|inr|idr|vnd|php|hkd|twd|cad|chf)\b/i.test(message);
  const purchase = /\b(?:card purchase|purchase|card payment)\b|\b(?:buy|pay).*\bcard\b/i.test(message);
  const cash = /\b(?:cash|withdraw(?:al)?|atm)\b/.test(lower);
  const exchange = /\b(?:exchange|convert|conversion)\b/.test(lower);
  const network = message.match(/\b(visa|mastercard|unionpay|jcb|amex|diners|maestro|cirrus)\b/i)?.[1]?.toLowerCase()
    ?? (/\b(?:PLUS|Discover)\b/.test(message) || /\b(?:network|card)\s+(?:plus|discover)\b/i.test(message) ? message.match(/\b(plus|discover)\b/i)?.[1]?.toLowerCase() : undefined)
    ?? (/\b(?:unknown|not sure|do not know|don't know)\b/i.test(message) && (cash || previous.objective === 'atm_withdrawal') ? 'unknown' : undefined);
  const financial = Boolean(supplied) || Boolean(network) || cash || exchange || /\b(?:balance|reserve|ledger|budget|quote|plan|funding|sen|won|myr|krw|ringgit)\b|(?:myr|krw)_/i.test(message);
  const freshDecision = cash || exchange;
  if (financial && !supplied?.amount && (/\d,\d|[-+]\s*\d|\d\s*–\s*\d/.test(message))) {
    throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Use one positive plain decimal amount with an explicit supported currency; grouped, signed and ranged amounts require clarification');
  }
  // A different objective starts a new decision. Same-objective clarification retains its slots.
  const continuing = cash && !exchange && previous.objective === 'atm_withdrawal'
    || exchange && !cash && previous.objective === 'exchange';
  let decision: Decision = freshDecision && !continuing ? {} : { ...previous };
  const defaults: string[] = [];
  if (cash && !exchange) decision.objective = 'atm_withdrawal';
  if (exchange && !cash) decision.objective = 'exchange';
  const currencyMatches = [...message.matchAll(/\b(MYR|KRW)\s*(\d+(?:\.\d+)?)(?!\d|\.\d)/gi), ...message.matchAll(/\b(\d+(?:\.\d+)?)\s*(MYR|KRW)\b/gi)];
  const amounts = currencyMatches.map(match => ({
    currency: (/^(MYR|KRW)$/i.test(match[1]!) ? match[1] : match[2])!.toUpperCase() as 'MYR' | 'KRW',
    text: (/^(MYR|KRW)$/i.test(match[1]!) ? match[2] : match[1])!,
  }));
  const distinct = [...new Map(amounts.map(amount => [`${amount.currency}:${amount.text}`, amount])).values()];
  let ambiguousAmount = distinct.length > 1 || (distinct.length > 0 && /\b(?:or|between|about|around|approximately|roughly)\b/i.test(message));
  if (distinct.length === 1) {
    const input = distinct[0]!;
    decision.amount = parseMajorMoney(input.text, input.currency);
    if (/\b(?:budget|including fees|all.in|at most|total debit)\b/.test(lower)) decision.amount_basis = 'total_debit_budget';
    else if (/\b(?:need|receive|target|want to get)\b/.test(lower)) decision.amount_basis = 'destination_target';
    else if (exchange && input.currency === 'MYR') {
      decision.amount_basis = 'principal'; defaults.push('Interpreting the stated source-currency amount as principal; fees are additional.');
    } else if (decision.objective === 'atm_withdrawal' && input.currency === 'KRW') decision.amount_basis = 'destination_target';
  } else if (financial && /\b\d/.test(message) && !decision.amount) ambiguousAmount = true;
  for (const account of Object.values(ACCOUNTS)) {
    if (lower.includes(account.id) || lower.includes(account.display_name.toLowerCase())) {
      if (/\b(?:from|fund(?:ing)?|using)\b/.test(lower)) decision.funding_account = account.id;
      if (/\b(?:to|into|destination)\b/.test(lower) && decision.objective === 'exchange') decision.destination_account = account.id;
    }
  }
  if (network) decision.card_network = network;
  decision = { ...decision, ...supplied };
  if (supplied?.amount) ambiguousAmount = false;
  if (decision.objective === 'atm_withdrawal') decision.destination_account = 'krw_cash';
  if (decision.objective === 'exchange' && decision.amount?.currency === 'MYR' && decision.amount_basis !== 'destination_target' && !decision.funding_account) {
    decision.funding_account = 'myr_funding'; defaults.push('Using the implemented home-currency funding account: MYR Funding.');
  }
  if (decision.objective === 'exchange' && decision.funding_account === 'myr_funding' && !decision.destination_account) {
    decision.destination_account = 'krw_card'; defaults.push('Using the implemented destination-currency card account: KRW Card.');
  }
  const missing: ClarificationField[] = [];
  if (!decision.objective) missing.push('objective');
  if (!decision.amount || ambiguousAmount) missing.push('amount');
  if (!decision.amount_basis) missing.push('amount_basis');
  if (!decision.funding_account) missing.push('funding_account');
  if (!decision.destination_account) missing.push('destination_account');
  if (decision.objective === 'atm_withdrawal' && requiresCardNetwork(decision) && !decision.card_network) missing.push('card_network');
  return {
    decision, defaults, financial, unsupportedCurrency, purchase,
    decision_request: Boolean(supplied) || cash || exchange || (financial && Boolean(previous.objective) && !/\b(?:balances?|reserves?|ledger|history|plans)\b/i.test(message)),
    clarification: missing.map(field => ({ field, question: questions[field] })),
    ambiguous_amount: ambiguousAmount,
  };
}
export type Understanding = ReturnType<typeof understand>;
