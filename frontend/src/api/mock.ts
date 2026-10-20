import type * as T from './types'
import { ApiError } from './types'
import type { BorderWiseApi } from './api'
import { uid } from './api'
import { seedCompare } from './compare'

const ts = () => new Date().toISOString()
const b = (status: T.BadgeStatus, source: string): T.Badge => ({ status, source, timestamp: ts() })
const fv = (n: number, c: T.Currency, badge: T.Badge): T.FV => ({ Money: { amount_minor: n, currency: c }, badge })
const NAMES: Record<T.AccountId, string> = { myr_funding: 'MYR Funding', krw_card: 'KRW Card', krw_cash: 'KRW Cash' }
const CUR: Record<T.AccountId, T.Currency> = { myr_funding: 'MYR', krw_card: 'KRW', krw_cash: 'KRW' }

export function mockApi(): BorderWiseApi {
  const bal: Record<T.AccountId, number> = { myr_funding: 80000, krw_card: 150000, krw_cash: 45000 }
  const badges: Record<T.AccountId, T.Badge> = { myr_funding: b('User-Entered', 'Mock seed'), krw_card: b('User-Confirmed', 'Mock seed'), krw_cash: b('User-Confirmed', 'Mock seed') }
  const reserves = { fixed: 50000, emergency: 10000 }
  const plans: T.PlanResponse[] = []
  const ledger: T.LedgerItem[] = []
  const recv: T.Receivable[] = [{ receivable_id: 'r1', debtor: 'Daniel', amount: { amount_minor: 15000, currency: 'KRW' }, remaining: { amount_minor: 15000, currency: 'KRW' }, snapshot: { pair: 'MYR/KRW', rate: '310', badge: b('Indicative', 'Seeded snapshot') } }]
  const proposals = new Map<string, T.Selection>()
  const post = (type: T.LedgerEntry['type'], act: string, lines: T.LedgerEntry['lines'], badge: T.Badge) =>
    ledger.unshift({ entry: { entry_id: uid(), type, lines, badge }, activity_id: act, created_at: ts() })
  post('income', 'seed-1', [{ account: 'myr_funding', Money: { amount_minor: 100000, currency: 'MYR' } }], b('User-Entered', 'Allowance'))

  const budget = (): T.Budget => {
    const total = reserves.fixed + reserves.emergency, avail = bal.myr_funding - total
    const bd = b('User-Entered', 'MYR Funding − (Fixed + Emergency reserve)')
    return { status: avail > 0 ? 'Above reserve' : avail === 0 ? 'At reserve' : 'Below reserve', badge: bd, total_reserve: fv(total, 'MYR', bd), available_above_reserve: fv(avail, 'MYR', bd), max_safe_total_debit: fv(Math.max(0, avail), 'MYR', bd), reserve_shortfall: fv(Math.max(0, -avail), 'MYR', bd) }
  }
  const home = (): T.HomeData => {
    const bd = budget()
    return { profile: { profile_id: 'demo-profile', display_name: 'Aiman', fixed_expense_reserve: fv(reserves.fixed, 'MYR', b('User-Entered', 'Profile')), emergency_reserve: fv(reserves.emergency, 'MYR', b('User-Entered', 'Profile')) },
      balances: (Object.keys(bal) as T.AccountId[]).map(id => ({ account_id: id, display_name: NAMES[id], balance: fv(bal[id], CUR[id], badges[id]) })), budget: bd }
  }
  const assess = (principal: T.Money, fees: T.Money[], recvd: T.Money, from: T.AccountId, stage: string): T.Assessment => {
    const feeSum = fees.filter(f => f.currency === CUR[from]).reduce((s, f) => s + f.amount_minor, 0)
    const debit = principal.amount_minor + feeSum
    const proj = bal[from] - debit
    if (proj < 0) throw new ApiError('INSUFFICIENT_FUNDS', 'Funding account balance is too low for this activity', undefined, 409)
    const total = reserves.fixed + reserves.emergency, myr = from === 'myr_funding'
    const short = myr ? Math.max(0, total - proj) : 0
    const maxSafe = Math.max(0, bal.myr_funding - total)
    const bd = b('Simulated', 'Mock assessment ' + stage)
    const safe = myr ? Math.max(0, maxSafe - feeSum) : 0
    return { check_token: `${stage}-${from}-${debit}-${bal[from]}`, current_balance: fv(bal[from], CUR[from], badges[from]), projected_balance: fv(proj, CUR[from], bd),
      total_reserve: fv(total, 'MYR', bd), projected_reserve_shortfall: fv(short, 'MYR', bd), total_debit: fv(debit, CUR[from], bd), principal: fv(principal.amount_minor, principal.currency, bd), amount_received: fv(recvd.amount_minor, recvd.currency, bd),
      requires_reserve_acknowledgement: short > 0,
      safe_principal: myr ? { status: safe > 0 ? 'available' : 'no_positive_principal', amount: fv(safe, 'MYR', bd), reason: 'Request a revised quote for this principal; no quote fields were changed.' } : { status: 'not_applicable', amount: null, reason: 'MYR reserves do not apply to KRW-funded debits.' }, checked_at: ts() }
  }
  const previewSel = (s: T.Selection) => {
    if (s.quote.objective === 'card_purchase') throw new ApiError('UNSUPPORTED_OBJECTIVE', 'Card purchase plans are not supported yet (no purchase ledger type).', undefined, 422)
    return assess(s.quote.principal, s.quote.fees.map(f => f.Money), s.quote.net_received, s.quote.funding_source as T.AccountId, 'save')
  }
  const needAck = (a: T.Assessment, ack?: { acknowledged: true; check_token: string }) => {
    if (a.requires_reserve_acknowledgement && !(ack?.acknowledged && ack.check_token === a.check_token)) throw new ApiError('RESERVE_ACKNOWLEDGEMENT_REQUIRED', 'Acknowledge the reserve warning', { preview: a }, 409)
  }
  const save = (sel: T.Selection, ack?: { acknowledged: true; check_token: string }): T.PlanResponse => {
    const a = previewSel(sel); needAck(a, ack)
    const p: T.PlanResponse = { plan: { plan_id: uid(), quote: sel.quote, status: 'pending', reserve_breached: a.requires_reserve_acknowledgement }, context: sel.context, created_at: ts(), updated_at: ts() }
    plans.unshift(p); return p
  }
  const reply = (r: Partial<T.AgentResponse>): { response: T.AgentResponse } => ({ response: { status: 'ok', explanation: '', provider: { name: 'demo', simulated: true }, cards: [], clarification: [], next_action: 'review_cards', active_proposal_id: null, ...r } })
  const wait = <R,>(v: R | (() => R)): Promise<R> => new Promise((res, rej) => setTimeout(() => { try { res(typeof v === 'function' ? (v as () => R)() : v) } catch (e) { rej(e) } }, 150))

  return {
    mode: 'mock',
    home: () => wait(home),
    ledger: () => wait(() => ({ items: [...ledger], next_cursor: null })),
    listPlans: s => wait(() => ({ items: plans.filter(p => !s || p.plan.status === s) })),
    previewPlan: s => wait(() => previewSel(s)),
    savePlan: (s, _k, ack) => wait(() => save(s, ack)),
    cancelPlan: id => wait(() => { const p = plans.find(x => x.plan.plan_id === id)!; p.plan.status = 'cancelled'; return p }),
    completionPreview: (_id, a) => wait(() => assess(a.principal, a.fees.map(f => f.Money), a.amount_received, a.funding_account, 'done')),
    confirmPlan: (id, a, _k, ack) => wait(() => {
      const p = plans.find(x => x.plan.plan_id === id)!
      if (p.plan.status !== 'pending') throw new ApiError('PLAN_NOT_PENDING', 'Plan is not pending', undefined, 409)
      const as = assess(a.principal, a.fees.map(f => f.Money), a.amount_received, a.funding_account, 'done'); needAck(as, ack)
      const act = uid(), bg = b('User-Confirmed', 'Reported as completed elsewhere')
      bal[a.funding_account] -= a.principal.amount_minor; bal[a.destination_account] += a.amount_received.amount_minor
      badges[a.funding_account] = bg; badges[a.destination_account] = bg
      post(a.activity_type, act, [{ account: a.funding_account, Money: { ...a.principal, amount_minor: -a.principal.amount_minor } }, { account: a.destination_account, Money: a.amount_received }], bg)
      a.fees.forEach(f => { bal[f.account_id] -= f.Money.amount_minor; post('fee', act, [{ account: f.account_id, Money: { ...f.Money, amount_minor: -f.Money.amount_minor } }], bg) })
      p.plan.status = 'completed'; p.plan.reserve_breached = as.requires_reserve_acknowledgement; return p
    }),
    receivables: () => wait(() => recv.filter(r => r.remaining.amount_minor > 0)),
    settleReceivable: (id, cleared, received) => wait(() => {
      const r = recv.find(x => x.receivable_id === id)!
      if (cleared.amount_minor > r.remaining.amount_minor) throw new ApiError('OVER_SETTLEMENT', 'Cannot clear more than remains', undefined, 409)
      r.remaining.amount_minor -= cleared.amount_minor
      const acc: T.AccountId = received.currency === 'MYR' ? 'myr_funding' : 'krw_cash'
      bal[acc] += received.amount_minor; badges[acc] = b('User-Confirmed', 'Settlement reported by user')
      post('settlement', uid(), [{ account: acc, Money: received }], b('User-Confirmed', `Settlement from ${r.debtor}; not income`))
    }),
    confirmReceipt: (r) => wait(() => {
      const acc: T.AccountId = r.paid_from === 'MYR_BANK' ? 'myr_funding' : r.paid_from === 'KRW_CARD' ? 'krw_card' : 'krw_cash'
      const bg = b('User-Confirmed', 'Receipt confirmed by user'), amt = acc === 'myr_funding' ? Math.round(r.total / 310 * 100) : r.total
      if (bal[acc] < amt) throw new ApiError('INSUFFICIENT_FUNDS', `${NAMES[acc]} balance is too low for this receipt`, undefined, 409)
      bal[acc] -= amt; badges[acc] = bg
      post('expense', uid(), [{ account: acc, Money: { amount_minor: -amt, currency: CUR[acc] } }], bg)
      r.debts.forEach(d => recv.push({ receivable_id: uid(), debtor: d.debtor, amount: { amount_minor: d.amount, currency: 'KRW' }, remaining: { amount_minor: d.amount, currency: 'KRW' }, snapshot: { pair: 'MYR/KRW', rate: '310', badge: b('Indicative', 'Seeded snapshot') } }))
    }),
    agentCreateSession: () => wait({ session_id: uid() }),
    agentSend: (_s, msg, _k, d) => wait(() => {
      const m = msg.replace(/,/g, '')
      const n = Number(m.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0)
      if (/balance|afford|budget|how much/i.test(msg) && !n) return reply({ explanation: 'Here are your current balances and budget.', cards: [{ type: 'balance_summary', data: home() }] })
      const krw = d?.amount?.currency === 'KRW' || /₩|krw|won|cash/i.test(msg)
      if (!n && !d?.amount) return reply({ status: 'clarification_required', explanation: 'I need an amount and currency.', clarification: [{ field: 'amount', question: 'How much cash do you need, and in which currency?' }], next_action: 'provide_details' })
      const amt = d?.amount?.amount_minor ?? (krw ? Math.round(n) : Math.round(n * 100))
      const opts = seedCompare({ objective: krw ? 'atm_withdrawal' : 'exchange', mode: krw ? 'target' : 'budget', amount: amt })
      const options: T.AgentOption[] = opts.map(({ selection }, i) => { const id = uid(); proposals.set(id, selection); let preview: T.Assessment | null = null, blocking_error: string | null = null; try { preview = previewSel(selection) } catch (e: unknown) { blocking_error = e instanceof Error ? e.message : String(e) } return { snapshot_id: id, rank: i + 1, selection, preview, blocking_error } })
      return reply({ explanation: 'Simulated fixtures only; this is not a live market ranking. Chat cannot save or confirm plans.', cards: [{ type: 'quote_comparison', source: 'simulated_fixture', ranking: 'Ranked by ' + (krw ? 'lowest total MYR debit' : 'most KRW received') + '; static demo order.', options }] })
    }),
    agentProposalPreview: (_s, pid) => wait(() => previewSel(proposals.get(pid)!)),
    agentProposalSave: (_s, pid, _k, _t, ack) => wait(() => save(proposals.get(pid)!, ack)),
  }
}
