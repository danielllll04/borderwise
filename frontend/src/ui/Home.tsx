import { useEffect, useState } from 'react'
import type { HomeData, LedgerItem, PlanResponse, ActualActivity, Assessment, AccountId, Money } from '@/api/types'
import { Amount, Badge, Btn, Card, Err, Modal, Title, Warn, fmt, stamp } from './kit'
import { useApp } from './ctx'
import { uid } from '@/api/api'

const LABEL: Record<string, string> = { income: 'Income', expense: 'Receipt expense', exchange: 'Currency exchange', atm_withdrawal: 'ATM withdrawal', fee: 'Fee', settlement: 'Shared expense settlement' }
const ACC: Record<string, string> = { myr_funding: 'MYR Funding', krw_card: 'KRW Card', krw_cash: 'KRW Cash' }

export default function Home() {
  const { api, rev, bump, t, lang } = useApp()
  const [h, setH] = useState<HomeData | null>(null), [led, setLed] = useState<LedgerItem[]>([]), [plans, setPlans] = useState<PlanResponse[]>([])
  const [err, setErr] = useState<any>(null), [confirming, setConfirming] = useState<PlanResponse | null>(null)
  useEffect(() => { Promise.all([api.home(), api.ledger(), api.listPlans('pending')]).then(([a, b, c]) => { setH(a); setLed(b.items); setPlans(c.items); setErr(null) }).catch(setErr) }, [rev, api])
  if (!h) return <div className="p-6 text-sm text-ink/60">{err ? <Err e={err} /> : 'Loading your profile…'}</div>
  const bal = (id: AccountId) => h.balances.find(b => b.account_id === id)!
  const RATE = 310, krw = bal('krw_card').balance.Money.amount_minor + bal('krw_cash').balance.Money.amount_minor
  const totalSen = bal('myr_funding').balance.Money.amount_minor + Math.round(krw / RATE * 100)
  const ok = totalSen >= h.budget.total_reserve.Money.amount_minor
  const groups = led.reduce<Record<string, LedgerItem[]>>((m, i) => ((m[i.activity_id] ||= []).push(i), m), {})
  const fixed = h.profile.fixed_expense_reserve.Money.amount_minor, emerg = h.profile.emergency_reserve.Money.amount_minor
  const avail = Math.max(0, h.budget.available_above_reserve.Money.amount_minor), total = Math.max(1, avail + fixed + emerg)
  return <div className="pb-6">
    <div className="rounded-b-3xl bg-coral px-5 pb-6 pt-5 text-white">
      <p className="text-xs font-semibold opacity-80">Hi {h.profile.display_name}</p>
      <h1 className="text-2xl font-extrabold leading-tight">Your money.<br />Across borders.</h1>
    </div>
    <div className="-mt-4 space-y-3 px-4">
      <div className={`rounded-2xl p-4 text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
        <div className="text-xs font-semibold opacity-90">{t('Total across all 3 accounts')}</div>
        <div className="text-3xl font-extrabold tracking-tight">{fmt({ amount_minor: totalSen, currency: 'MYR' })}</div>
        <div className="mt-1 text-sm font-semibold">{ok ? (lang === 'zh' ? '高于你设定的储备金 ' : 'Above your stated reserve of ') : (lang === 'zh' ? '低于你设定的储备金 ' : 'Below your stated reserve of ')}{fmt(h.budget.total_reserve.Money)}</div>
        <div className="mt-1 text-[10px] opacity-80">MYR + (KRW card + KRW cash) ÷ 310 · Indicative · seeded rate RM 1 = ₩ 310 · {stamp(h.budget.badge.timestamp)}</div>
      </div>
      <Card><div className="text-xs text-ink/60">{t("MYR Funding Balance")}</div><Amount v={bal('myr_funding').balance} big /><p className="mt-1 text-[11px] text-ink/50">Malaysian bank/card funding, allowances, scholarships</p></Card>
      <div className="grid grid-cols-2 gap-3">
        <Card><div className="text-xs text-ink/60">{t("KRW Card Balance")}</div><Amount v={bal('krw_card').balance} big /></Card>
        <Card><div className="text-xs text-ink/60">{t("KRW Cash-on-Hand")}</div><Amount v={bal('krw_cash').balance} big /></Card>
      </div>
      <Card>
        <Title sub="Your own allocations — not verified bank data">{t('Stated budget &amp; reserves')}</Title>
        <div className="flex h-3 overflow-hidden rounded-full bg-ink/10">
          <div className="bg-emerald-500" style={{ width: `${avail / total * 100}%` }} /><div className="bg-cobalt" style={{ width: `${fixed / total * 100}%` }} /><div className="bg-coral" style={{ width: `${emerg / total * 100}%` }} /></div>
        <ul className="mt-3 space-y-1 text-sm">
          <Leg c="bg-emerald-500" k={t("Available within plan")} v={fmt(h.budget.available_above_reserve.Money)} />
          <Leg c="bg-cobalt" k={t("Stated fixed expenses reserve")} v={fmt(h.profile.fixed_expense_reserve.Money)} />
          <Leg c="bg-coral" k={t("Stated emergency reserve")} v={fmt(h.profile.emergency_reserve.Money)} /></ul>
        <div className="mt-2"><Badge b={h.profile.fixed_expense_reserve.badge} /></div>
      </Card>
      <Title sub="Saved plans — balances unchanged until you confirm">{t('Pending / planned')}</Title>
      {plans.length === 0 && <p className="rounded-xl border border-dashed border-ink/20 p-4 text-center text-xs text-ink/50">No pending plans. Pick an option in Compare.</p>}
      {plans.map(p => <Card key={p.plan.plan_id}>
        <div className="flex justify-between"><div><div className="font-bold">{p.plan.quote.provider}</div><div className="text-xs text-ink/55">{p.plan.quote.objective === 'atm_withdrawal' ? 'ATM withdrawal' : 'Exchange'}</div></div>
          <div className="text-right text-sm"><div className="font-bold">{fmt(p.plan.quote.total_debit)}</div><div className="text-ink/60">→ {fmt(p.plan.quote.net_received)}</div></div></div>
        <div className="mt-1 flex items-center gap-2"><Badge b={p.plan.quote.badge} />{p.plan.reserve_breached && <span className="rounded-full bg-amber-100 px-2 text-[11px] font-semibold text-amber-800">Reserve overridden</span>}</div>
        <div className="mt-3 flex gap-2"><Btn className="flex-1" onClick={() => setConfirming(p)}>Confirm Completion</Btn><Btn kind="outline" onClick={async () => { await api.cancelPlan(p.plan.plan_id); bump() }}>Cancel Plan</Btn></div>
      </Card>)}
      <Title>Confirmed ledger</Title>
      {Object.entries(groups).map(([id, items]) => <Card key={id} className="space-y-2">{items.map(i => <div key={i.entry.entry_id} className="border-b border-ink/5 pb-2 last:border-0 last:pb-0">
        <div className="flex items-center justify-between text-sm font-bold"><span>{LABEL[i.entry.type]}{i.entry.type === 'fee' && ' (expense)'}</span></div>
        {i.entry.lines.map((l, k) => <div key={k} className="flex justify-between text-sm"><span className="text-ink/60">{ACC[l.account] ?? l.account}</span><span className={l.Money.amount_minor < 0 ? 'text-red-600' : 'text-emerald-700'}>{fmt(l.Money, true)}</span></div>)}
        <Badge b={i.entry.badge} /></div>)}</Card>)}
    </div>
    {confirming && <ModalB plan={confirming} onClose={() => setConfirming(null)} onDone={() => { setConfirming(null); bump() }} />}
  </div>
}
const Leg = ({ c, k, v }: { c: string; k: string; v: string }) => <li className="flex items-center justify-between"><span className="flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${c}`} />{k}</span><b>{v}</b></li>

/** Modal B — editable actuals, pre-filled from the quote. Ledger only changes on Confirm. */
function ModalB({ plan, onClose, onDone }: { plan: PlanResponse; onClose: () => void; onDone: () => void }) {
  const { api } = useApp(), q = plan.plan.quote, atm = q.objective === 'atm_withdrawal'
  const [from, setFrom] = useState<AccountId>(q.funding_source as AccountId)
  const [paid, setPaid] = useState(String(q.principal.amount_minor / 100)), [fee, setFee] = useState(String(q.fees.reduce((s, f) => s + f.Money.amount_minor, 0) / 100))
  const [got, setGot] = useState(String(q.net_received.amount_minor))
  const [err, setErr] = useState<any>(null), [ack, setAck] = useState<Assessment | null>(null), [key] = useState(uid), [at] = useState(new Date().toISOString())
  const cur = from === 'myr_funding' ? 'MYR' : 'KRW'
  const minor = (v: string) => Math.round(Number(v) * (cur === 'MYR' ? 100 : 1))
  const actual = (): ActualActivity => ({
    activity_type: atm ? 'atm_withdrawal' : 'exchange', funding_account: from, destination_account: plan.context.destination_account,
    principal: { amount_minor: minor(paid), currency: cur }, amount_received: { amount_minor: Math.round(Number(got)), currency: 'KRW' },
    fees: [{ label: 'Actual fee charged', account_id: from, Money: { amount_minor: minor(fee), currency: cur } as Money }], completed_at: at })
  const submit = async () => {
    setErr(null)
    try {
      const pv = await api.completionPreview(plan.plan.plan_id, actual())
      if (pv.requires_reserve_acknowledgement && !ack) { setAck(pv); return }
      await api.confirmPlan(plan.plan.plan_id, actual(), key, ack ? { acknowledged: true, check_token: ack.check_token } : undefined); onDone()
    } catch (e: any) { setErr(e) }
  }
  const F = ({ l, v, set }: { l: string; v: string; set: (s: string) => void }) => <label className="block text-sm"><span className="text-ink/60">{l}</span><input inputMode="decimal" value={v} onChange={e => { set(e.target.value); setAck(null) }} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3 font-semibold" /></label>
  return <Modal title="Did you complete this?" onClose={onClose}>
    <p className="mb-3 text-sm text-ink/60">Confirm or adjust the final figures. Prefilled from the quote (<Badge b={q.badge} meta={false} />).</p>
    <div className="space-y-3">
      <label className="block text-sm"><span className="text-ink/60">Funding account debited</span><select value={from} onChange={e => setFrom(e.target.value as AccountId)} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3 font-semibold"><option value="myr_funding">MYR Funding Balance</option>{atm && <option value="krw_card">KRW Card Balance</option>}</select></label>
      <F l={`Actual amount paid, excl. fee (${cur})`} v={paid} set={setPaid} /><F l={`Actual fee charged (${cur})`} v={fee} set={setFee} />
      <F l={`Actual amount received (₩ → ${plan.context.destination_account === 'krw_cash' ? 'KRW Cash' : 'KRW Card'})`} v={got} set={setGot} /></div>
    {ack && <div className="mt-3"><Warn>Your actual figures take MYR Funding below your stated reserve. Press confirm again to acknowledge and record it.</Warn></div>}
    <Err e={err} />
    <div className="mt-4 space-y-2"><Btn className="w-full" onClick={submit}>{ack ? 'Acknowledge & Update Ledger' : 'Confirm & Update Ledger'}</Btn><Btn kind="outline" className="w-full" onClick={onClose}>Not Completed Yet</Btn></div>
    <p className="mt-2 text-[11px] text-ink/50">Writes the entry with a User-Confirmed badge.</p>
  </Modal>
}
