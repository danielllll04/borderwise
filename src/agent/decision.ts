import { ACCOUNTS } from '../domain/accounts.js';
import { parseMajorMoney } from '../domain/validation.js';
import { AppError } from '../domain/errors.js';
import type { Decision } from './inputs.js';

export type ClarificationField = 'objective' | 'amount' | 'currency' | 'funding_account' | 'amount_basis' | 'destination_account' | 'card_network' | 'reserve_intent';
const questions: Record<ClarificationField, string> = {
  objective: 'Do you want to exchange into an owned account or withdraw cash?',
  amount: 'What amount do you need, and in which supported currency?',
  currency: 'Which supported currency do you mean?',
  funding_account: 'Which owned account will fund this: MYR Funding or KRW Card where supported?',
  amount_basis: 'Is this a principal amount, a total spending budget including fees, or a destination-currency target?',
  destination_account: 'Should the exchanged funds go to MYR Funding, KRW Card or KRW Cash?',
  card_network: 'Which card network will you use at the ATM (for example Visa or Mastercard)? If you do not know, say unknown; compatibility will remain unknown.',
  reserve_intent: 'By “exit fixed reserve”, do you mean checking whether this option leaves too little for fixed expenses, or changing the fixed-expense reserve you entered?',
};

const chineseQuestions: Record<ClarificationField, string> = {
  objective: '您想换汇到已有账户，还是提取现金？',
  amount: '您需要多少金额？请说明支持的货币。',
  currency: '您指的是哪一种支持的货币？',
  funding_account: '请问使用哪个已有账户付款：马币资金账户，还是韩元卡？',
  amount_basis: '这是本金、包含手续费的总预算，还是目标到账金额？',
  destination_account: '换汇后的资金应转入马币资金账户、韩元卡还是韩元现金？',
  card_network: '您会在 ATM 使用哪种卡组织（例如 Visa 或 Mastercard）？如果不确定，请说“不知道”；兼容性将保持未知。',
  reserve_intent: '您说的“退出固定支出储备金”，是想检查这个方案是否会影响固定开支，还是想修改自己设置的固定支出储备金额？',
};

export function isChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/u.test(text);
}

function scaledMajorText(text: string, unit?: string): string {
  if (!unit) return text;
  const multiplier = unit === '万' ? 10000n : 1000n;
  const [whole = '0', fraction = ''] = text.split('.');
  const fractionScale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(whole) * multiplier + BigInt(fraction || '0') * multiplier / fractionScale;
  return scaled.toString();
}

function currencyForLabel(label: string): 'MYR' | 'KRW' {
  return /^(?:MYR|RM|马币|令吉)$/iu.test(label) ? 'MYR' : 'KRW';
}

// Normalize Chinese integer amount words only next to an explicit currency label.
// This parses intent; all money validation/calculation remains in existing services.
function chineseAmount(text: string): string {
  if (/(?:百|千|万)[一二两三四五六七八九]$/u.test(text)) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Please clarify an abbreviated Chinese amount using digits and an explicit currency');
  const digits: Record<string, bigint> = { 零: 0n, 〇: 0n, 一: 1n, 二: 2n, 两: 2n, 三: 3n, 四: 4n, 五: 5n, 六: 6n, 七: 7n, 八: 8n, 九: 9n };
  const units: Record<string, bigint> = { 十: 10n, 百: 100n, 千: 1000n };
  let total = 0n, section = 0n, digit = 0n, previousDigit = false, lastUnit = 10000n;
  for (const char of text) {
    if (char in digits) {
      if (previousDigit && digit !== 0n) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Please use a single explicit currency amount in digits when Chinese number words are ambiguous');
      digit = digits[char]!; previousDigit = true;
    } else if (char === '万') {
      if (total || section + digit === 0n) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Please clarify the Chinese amount using digits and an explicit currency');
      total = (section + digit) * 10000n; section = 0n; digit = 0n; lastUnit = 10000n; previousDigit = false;
    } else {
      if (units[char]! >= lastUnit) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Please clarify the Chinese amount using digits and an explicit currency');
      section += (digit || 1n) * units[char]!; digit = 0n; lastUnit = units[char]!; previousDigit = false;
    }
  }
  return (total + section + digit).toString();
}

/** Conservative slot parser, not an open-ended financial interpreter. Ambiguity stays explicit. */
export function understand(message: string, previous: Decision, supplied?: Decision, requiresCardNetwork: (decision: Decision) => boolean = () => false) {
  const lower = message.toLowerCase();
  const zh = isChineseText(message);
  const reserveAmbiguous = /\bexit\s+(?:(?:the|my|a)\s+)?fixed(?:[- ]expenses?)?\s+reserves?\b|(?:退出|移出|退出去)\s*固定(?:支出|开支|费用)?(?:储备金?|预留金?)/iu.test(message);
  if (reserveAmbiguous) return {
    decision: { ...previous }, defaults: [] as string[], financial: true, unsupportedCurrency: false, purchase: false,
    decision_request: false, reserve_ambiguous: true, ambiguous_amount: false,
    clarification: [{ field: 'reserve_intent' as const, question: (zh ? chineseQuestions : questions).reserve_intent }],
  };
  const unsupportedCurrency = /\b(?:usd|eur|gbp|sgd|jpy|cny|rmb|aud|thb|inr|idr|vnd|php|hkd|twd|cad|chf)\b|(?:美元|欧元|英镑|新币|新加坡元|日元|人民币|港币|港元|台币|泰铢)/iu.test(message);
  const chineseCash = /(?:取现|提款|取钱|现金|ATM|取韩元)/iu.test(message);
  const chineseExchange = /(?:换汇|兑换|换钱|换韩元|汇率)/u.test(message);
  const cash = /\b(?:cash|withdraw(?:al)?|atm)\b/.test(lower) || chineseCash;
  const exchange = /\b(?:exchange|convert|conversion)\b/.test(lower) || chineseExchange;
  const purchase = /\b(?:card purchase|purchase|card payment)\b|\b(?:buy|pay).*\bcard\b/i.test(message)
    || (/(?:刷卡消费|买东西|刷卡支付)/u.test(message) && !cash);
  const network = message.match(/\b(visa|mastercard|unionpay|jcb|amex|diners|maestro|cirrus)\b/i)?.[1]?.toLowerCase()
    ?? (/\b(?:PLUS|Discover)\b/.test(message) || /\b(?:network|card)\s+(?:plus|discover)\b/i.test(message) ? message.match(/\b(plus|discover)\b/i)?.[1]?.toLowerCase() : undefined)
    ?? (/(?:银联)/u.test(message) ? 'unionpay' : /(?:维萨)/u.test(message) ? 'visa' : /(?:万事达)/u.test(message) ? 'mastercard' : undefined)
    ?? ((/\b(?:unknown|not sure|do not know|don't know)\b/i.test(message) || /(?:未知|不知道|不确定)/u.test(message)) && (cash || previous.objective === 'atm_withdrawal') ? 'unknown' : undefined);
  const financial = Boolean(supplied) || Boolean(network) || cash || exchange || /\b(?:balance|reserve|ledger|budget|quote|plan|funding|sen|won|myr|krw|ringgit|rm)\b|(?:myr|krw)_|(?:余额|储备金|账本|预算|报价|计划|马币|令吉|韩元|韩币|汇率)/iu.test(message);
  const freshDecision = cash || exchange;
  if (financial && !supplied?.amount && (/\d,\d|[-+]\s*[\d零〇一二两三四五六七八九十百千万]|\d\s*–\s*\d|(?:负|负数|正数)\s*[\d零〇一二两三四五六七八九十百千万]|[零〇一二两三四五六七八九十百千万]+[点半]/u.test(message))) {
    throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Use one positive plain decimal amount with an explicit supported currency; grouped, signed and ranged amounts require clarification');
  }
  // A different objective starts a new decision. Same-objective clarification retains its slots.
  const continuing = cash && !exchange && previous.objective === 'atm_withdrawal'
    || exchange && !cash && previous.objective === 'exchange';
  let decision: Decision = freshDecision && !continuing ? {} : { ...previous };
  const defaults: string[] = [];
  if (exchange) decision.objective = 'exchange';
  else if (cash) decision.objective = 'atm_withdrawal';
  const amounts: { currency: 'MYR' | 'KRW'; text: string }[] = [];
  const currencyLabels = 'MYR|RM|KRW|won|马币|令吉|韩元|韩币|₩';
  const amountMessage = message.replace(new RegExp(`([零〇一二两三四五六七八九十百千万]+)\\s*(${currencyLabels})`, 'giu'), (_all, amount: string, currency: string) => /^[十百千万]$/u.test(amount) ? `${amount} ${currency}` : `${chineseAmount(amount)} ${currency}`)
    .replace(new RegExp(`(${currencyLabels})\\s*([零〇一二两三四五六七八九十百千万]+)`, 'giu'), (_all, currency: string, amount: string) => `${currency} ${chineseAmount(amount)}`);
  for (const match of amountMessage.matchAll(new RegExp(`(?:\\b)?(${currencyLabels})\\s*(\\d+(?:\\.\\d+)?)(万|千)?(?!\\d|\\.\\d)`, 'giu'))) {
    amounts.push({ currency: currencyForLabel(match[1]!), text: scaledMajorText(match[2]!, match[3]) });
  }
  for (const match of amountMessage.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)(万|千)?\\s*(${currencyLabels})(?![A-Za-z])`, 'giu'))) {
    amounts.push({ currency: currencyForLabel(match[3]!), text: scaledMajorText(match[1]!, match[2]) });
  }
  const distinct = [...new Map(amounts.map(amount => [`${amount.currency}:${amount.text}`, amount])).values()];
  let ambiguousAmount = distinct.length > 1 || (distinct.length > 0 && /\b(?:or|between|about|around|approximately|roughly)\b|(?:或者|还是|大约|大概|左右|差不多|约莫)|[\d零〇一二两三四五六七八九十百千万]\s*(?:到|至|–|~)\s*[\d零〇一二两三四五六七八九十百千万]/iu.test(message));
  if (distinct.length === 1) {
    const input = distinct[0]!;
    decision.amount = parseMajorMoney(input.text, input.currency);
    if (/\b(?:budget|including fees|all.in|at most|total debit)\b|(?:预算|包括手续费|含手续费|总扣款|最多)/iu.test(message)) decision.amount_basis = 'total_debit_budget';
    else if (/\b(?:need|receive|target|want to get)\b|(?:需要|想要|目标|到账|取)/iu.test(message)) decision.amount_basis = 'destination_target';
    else if (exchange && input.currency === 'MYR') {
      decision.amount_basis = 'principal'; defaults.push(zh ? '已将所述来源货币金额视为本金；手续费另计。' : 'Interpreting the stated source-currency amount as principal; fees are additional.');
    } else if (decision.objective === 'atm_withdrawal' && input.currency === 'KRW') decision.amount_basis = 'destination_target';
  } else if (financial && /\b\d/.test(message) && !decision.amount) ambiguousAmount = true;
  for (const account of Object.values(ACCOUNTS)) {
    if (lower.includes(account.id) || lower.includes(account.display_name.toLowerCase())) {
      if (/\b(?:from|fund(?:ing)?|using)\b/.test(lower) && !(decision.objective === 'atm_withdrawal' && account.id === 'krw_cash')) decision.funding_account = account.id;
      if (/\b(?:to|into|destination)\b/.test(lower) && decision.objective === 'exchange') decision.destination_account = account.id;
    }
  }
  if (/(?:马币账户|马币资金|马来西亚银行卡|银行账户)/u.test(message)) decision.funding_account = 'myr_funding';
  if (/(?:韩元卡)/u.test(message)) {
    if (decision.objective === 'exchange' && /(?:到|至|转入|存入)/u.test(message)) decision.destination_account = 'krw_card';
    else decision.funding_account = 'krw_card';
  }
  if (/(?:韩元现金)/u.test(message)) {
    if (decision.objective === 'exchange' && /(?:到|至|转入|存入)/u.test(message)) decision.destination_account = 'krw_cash';
    else if (decision.objective !== 'atm_withdrawal') decision.funding_account = 'krw_cash';
  }
  if (network) decision.card_network = network;
  decision = { ...decision, ...supplied };
  if (supplied?.amount) ambiguousAmount = false;
  if (decision.objective === 'atm_withdrawal') decision.destination_account = 'krw_cash';
  if (decision.objective === 'exchange' && decision.amount?.currency === 'MYR' && decision.amount_basis !== 'destination_target' && !decision.funding_account) {
    decision.funding_account = 'myr_funding'; defaults.push(zh ? '使用已实现的本币资金账户：马币资金账户。' : 'Using the implemented home-currency funding account: MYR Funding.');
  }
  if (decision.objective === 'exchange' && decision.funding_account === 'myr_funding' && !decision.destination_account) {
    decision.destination_account = 'krw_card'; defaults.push(zh ? '使用已实现的目标货币卡账户：韩元卡。' : 'Using the implemented destination-currency card account: KRW Card.');
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
    decision_request: Boolean(supplied) || cash || exchange || (financial && Boolean(previous.objective) && !/\b(?:balances?|reserves?|ledger|history|plans)\b|(?:余额|储备金|账本|历史|计划)/iu.test(message)),
    clarification: missing.map(field => ({ field, question: (zh ? chineseQuestions : questions)[field] })),
    ambiguous_amount: ambiguousAmount, reserve_ambiguous: false,
  };
}
export type Understanding = ReturnType<typeof understand>;
