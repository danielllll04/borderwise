export type Lang = 'en' | 'zh'
const ZH: Record<string, string> = {
  Home: '主页', Compare: '比较', Split: '分账', Agent: '助手', 'ATM & Alerts': 'ATM与提醒',
  'Total across all 3 accounts': '三个账户总额', 'MYR Funding Balance': '马币资金余额', 'KRW Card Balance': '韩元卡余额', 'KRW Cash-on-Hand': '韩元现金',
  'Stated budget &amp; reserves': '预算与储备金', 'Available within plan': '计划内可用', 'Stated fixed expenses reserve': '固定开销储备', 'Stated emergency reserve': '紧急储备',
  'Pending / planned': '待处理 / 已计划', 'Confirmed ledger': '已确认账本', 'Confirm Completion': '确认完成', 'Cancel Plan': '取消计划',
  'Did you complete this?': '你完成这笔交易了吗？', 'Confirm & Update Ledger': '确认并更新账本', 'Not Completed Yet': '尚未完成',
  'Find a better way to move money': '找到更划算的换汇方式', '1 · What do you want to do?': '1 · 你想做什么？', '2 · Amount': '2 · 金额', '3 · Ranked options': '3 · 排序结果',
  'Exchange currency before spending': '消费前先换汇', 'Pay by card in another country': '在国外刷卡付款', 'Withdraw cash from an ATM': '在ATM提取现金',
  'Fixed budget': '固定预算', 'Fixed target': '固定目标', 'Select & Save as Plan': '选择并保存为计划', 'Top ranked': '最佳', 'Exchange rate': '汇率', 'Net proceeds': '实收金额', 'Total debit': '总扣款',
  'This uses part of your reserve': '这会动用你的储备金', 'Cancel plan': '取消计划', 'Save plan anyway (override reserve)': '仍然保存（覆盖储备）',
  'Reported MYR balance': '申报的马币余额', 'Stated protected reserves': '设定的保护储备', 'Projected balance after plan': '计划后预计余额',
  'Split expenses': '分摊开销', 'Owed to you': '欠你的钱', 'Mark as Settled': '标记为已结清', 'Settle debt': '结清欠款', 'Confirm settlement': '确认结清',
  'Type a message…': '输入消息…', 'Check my budget': '查看我的预算',
  'ATM Links & FX Alerts': 'ATM链接与汇率提醒', 'Nearby ATMs': '附近ATM', 'Open in Naver Map': '在 Naver 地图中打开', 'Open in Kakao Map': '在 Kakao 地图中打开',
  'User-Entered': '用户录入', 'User-Confirmed': '用户已确认', Simulated: '模拟数据', Indicative: '参考汇率',
  'Operator fee': 'ATM 手续费', 'Global ATM': '全球 ATM', away: '米',
  'Local ATM Operator Fee': 'ATM 手续费', 'Home Bank Overseas ATM Fee': '发卡银行境外 ATM 手续费',
  'Target-rate alert': '目标汇率提醒', 'Review Options': '查看选项', 'Current rate': '当前汇率', 'Target rate': '目标汇率', 'Last 7 days': '近7天',
}
export const makeT = (lang: Lang) => (s: string) => {
  if (lang !== 'zh') return s
  if (ZH[s]) return ZH[s]
  if (s.startsWith('Local ATM Operator Fee')) return `${ZH['Operator fee']} ${s.slice('Local ATM Operator Fee'.length).trim()}`
  return s
}
export const ZH_KEYS = Object.keys(ZH)
