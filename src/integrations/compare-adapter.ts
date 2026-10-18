import { accountIdSchema, safeNumber } from '../domain/validation.js';
import { ACCOUNTS, DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import type { AtmInput, ExchangeInput } from '../services/posting-inputs.js';
import type { ActualActivity, Selection } from '../services/plan-inputs.js';
import type { Badge } from '../shared/models.js';

/** Local provisional adapter only. Shared Quote objective/funding_source remain free text. */
export function quoteActivity(selection: Selection): ExchangeInput | AtmInput {
  const { quote, context } = selection;
  if (quote.objective !== 'exchange' && quote.objective !== 'atm_withdrawal') {
    throw new AppError(422, 'UNSUPPORTED_OBJECTIVE', 'Only exchange and atm_withdrawal are supported by the provisional Compare adapter. Card purchases require an agreed purchase ledger type.');
  }
  const parsedFunding = accountIdSchema.safeParse(quote.funding_source);
  if (!parsedFunding.success) throw new AppError(422, 'UNSUPPORTED_FUNDING_SOURCE', 'The provisional adapter expects funding_source to be a stable owned account ID');
  const funding = parsedFunding.data;
  if (quote.principal.currency !== ACCOUNTS[funding].currency || quote.total_debit.currency !== ACCOUNTS[funding].currency) {
    throw new AppError(422, 'CURRENCY_MISMATCH', 'Quote principal and total_debit must use the funding account currency');
  }
  if (context.fee_accounts && context.fee_accounts.length !== quote.fees.length) {
    throw new AppError(422, 'FEE_ACCOUNT_COUNT_MISMATCH', 'Provide one fee account for each quote fee, in the same order');
  }
  const fees = quote.fees.map((fee, index) => {
    const account = context.fee_accounts?.[index] ?? funding;
    if (ACCOUNTS[account].currency !== fee.Money.currency) {
      throw new AppError(422, 'CURRENCY_MISMATCH', 'Quote fee currency must match its explicit fee account; mixed-currency fees need context.fee_accounts');
    }
    return { ...fee, account_id: account, badge: quote.badge };
  });
  const total = BigInt(quote.principal.amount_minor) + fees.filter(fee => fee.account_id === funding)
    .reduce((sum, fee) => sum + BigInt(fee.Money.amount_minor), 0n);
  if (safeNumber(total) !== quote.total_debit.amount_minor) {
    throw new AppError(422, 'INCONSISTENT_QUOTE_TOTAL', 'Quote total_debit must equal principal plus separate fees debited from the funding account; other-account fees remain separate');
  }
  const common = {
    profile_id: DEMO_PROFILE_ID, idempotency_key: 'quote-preview-only', source_account: funding,
    destination_account: context.destination_account, principal: quote.principal, received: quote.net_received,
    fees, badge: quote.badge,
  };
  if (quote.objective === 'atm_withdrawal') {
    if (funding === 'krw_cash' || context.destination_account !== 'krw_cash') {
      throw new AppError(422, 'INVALID_ATM_ROUTING', 'ATM plans must move MYR Funding or KRW Card into KRW Cash');
    }
    return { ...common, kind: 'atm_withdrawal', source_account: funding, destination_account: 'krw_cash' };
  }
  return { ...common, kind: 'exchange' };
}

/** Actual amounts are independently entered; never calculated from the saved quote. */
export function actualActivity(actual: ActualActivity, planId: string): ExchangeInput | AtmInput {
  const badge: Badge & { source: string } = {
    status: 'User-Confirmed', source: `User-reported activity completed elsewhere for plan ${planId}`,
    timestamp: actual.completed_at,
  };
  const common = {
    profile_id: DEMO_PROFILE_ID, idempotency_key: `plan-completion:${planId}`,
    source_account: actual.funding_account, principal: actual.principal, received: actual.amount_received,
    fees: actual.fees.map(fee => ({ ...fee, badge })), badge,
    ...(actual.rate_snapshot ? { rate_snapshot: actual.rate_snapshot } : {}),
  };
  return actual.activity_type === 'atm_withdrawal'
    ? { ...common, kind: 'atm_withdrawal', source_account: actual.funding_account, destination_account: actual.destination_account }
    : { ...common, kind: 'exchange', destination_account: actual.destination_account };
}
