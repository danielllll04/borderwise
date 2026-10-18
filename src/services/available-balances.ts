import type { HomeService } from './home.js';
import type { Decision } from '../agent/inputs.js';

/** Only report holdings that directly satisfy an explicit destination target, without FX. */
export function availableDestinationBalance(home: Awaited<ReturnType<HomeService['summary']>>, decision: Decision) {
  if (decision.amount_basis !== 'destination_target' || !decision.amount || !decision.destination_account) return null;
  const account = home.balances.find(item => item.account_id === decision.destination_account);
  if (!account || account.balance.Money.currency !== decision.amount.currency) return null;
  if (BigInt(account.balance.Money.amount_minor) < BigInt(decision.amount.amount_minor)) return null;
  return {
    account_id: account.account_id, balance: account.balance,
    reason: decision.objective === 'atm_withdrawal'
      ? 'Existing cash already covers this explicit cash target; a card balance alone is not cash.'
      : 'The owned destination balance already covers this explicit target; no conversion was used in this check.',
  };
}
