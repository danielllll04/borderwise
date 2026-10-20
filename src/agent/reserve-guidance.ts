import type { ActivityAssessment } from '../services/plan-preview.js';
import type { FinancialValue } from '../domain/provenance.js';

/** Format authoritative preview values only; do not assign spending to either reserve. */
export function reserveGuidance(preview: ActivityAssessment['response'], zh: boolean): string {
  const reserve = preview.reserve_check.applicability === 'applicable' ? preview.reserve_check : preview.other_account_reserve_check;
  if (!reserve || reserve.applicability !== 'applicable') return '';
  const money = (value: FinancialValue) => `RM ${(value.Money.amount_minor / 100).toLocaleString(zh ? 'zh-CN' : 'en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const debit = money(reserve.total_debit!), balance = money(reserve.projected_balance!);
  const fixed = money(reserve.fixed_expense_reserve!), emergency = money(reserve.emergency_reserve!);
  const total = money(reserve.total_reserve!), shortfall = money(reserve.projected_reserve_shortfall!);
  return zh
    ? `按当前预览，包含手续费的马币扣款为 ${debit}，马币资金账户预计剩余 ${balance}。您设置的固定支出储备金是 ${fixed}，应急储备金是 ${emergency}，合计 ${total}；预计余额比这个合计目标少 ${shortfall}。这两项是记录的预留目标，并非两个独立银行账户；预览不会替您决定动用哪一项。您可以要求比较较小金额的新报价、暂不保存，或先审核提案并明确确认储备金警告后再保存。保存只创建待处理计划，不扣余额也不冻结资金。只有之后明确确认实际完成情况才会更新应用内记录的余额，不会操作真实银行资金。`
    : `Including fees, this option would debit ${debit} from MYR Funding, leaving ${balance}. You set aside ${fixed} for fixed expenses and ${emergency} for emergencies, ${total} in total. The projected balance is ${shortfall} below that combined target. These are recorded reserve targets, not separate bank accounts; this preview does not choose which reserve to spend. You can request a new quote for a smaller amount, leave this proposal unsaved, or review it and explicitly acknowledge the warning before Save. Saving creates a pending plan only: it does not debit or lock funds. Only a later explicit confirmation of actual completion updates recorded app balances; it never moves real bank money.`;
}
