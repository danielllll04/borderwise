import UI from './i18n-view'
import { useEffect, useRef, useState } from 'react'
import type { BalanceItem, HomeData, LedgerItem, Page, PendingRisk, PlanResponse, RiskPage } from '@/api/types'
import { Amount, Badge, Btn, Card, Err, Title, Warn, fmt, stamp } from './kit'
import { useApp } from './ctx'
import PlanCompletion from './PlanCompletion'

const LABEL: Record<string, string> = { income: 'Income', expense: 'Receipt expense', shared_expense: 'Shared bill payment', exchange: 'Currency exchange', atm_withdrawal: 'ATM withdrawal', fee: 'Fee', settlement: 'Shared expense settlement' }
const ACC: Record<string, string> = { myr_funding: 'MYR Funding', krw_card: 'KRW Card', krw_cash: 'KRW Cash' }
type Remote<T> = { data: T | null; error: unknown; version: string }

function useRead<T>(read: (() => Promise<T>) | undefined, version: string) {
  const [state, setState] = useState<Remote<T>>({ data: null, error: null, version: '' })
  useEffect(() => {
    let active = true
    if (read) void read().then(data => { if (active) setState({ data, error: null, version }) }).catch(error => { if (active) setState(old => ({ ...old, error, version })) })
    return () => { active = false }
  }, [read, version])
  return { ...state, loading: state.version !== version, setState }
}
function usePage<T, R extends Page<T>>(read: ((cursor?: string) => Promise<R>) | undefined, version: string, key: (item: T) => string) {
  const result = useRead<R>(read, version), inFlight = useRef(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const more = async () => {
    const cursor = result.data?.next_cursor
    if (!read || !cursor || inFlight.current || result.loading) return
    inFlight.current = true; setMoreBusy(true)
    try {
      const next = await read(cursor)
      result.setState(old => old.version !== version || !old.data ? old : { data: { ...next, items: [...new Map([...old.data.items, ...next.items].map(item => [key(item), item])).values()] }, error: null, version })
    } catch (error) { result.setState(old => old.version === version ? { ...old, error } : old) }
    finally { inFlight.current = false; setMoreBusy(false) }
  }
  return { ...result, more, moreBusy }
}
function ReadStatus({ loading, error, cached }: { loading: boolean; error: unknown; cached: boolean }) {
  return <>{loading && <p role="status" className="text-xs text-ink/55"><UI text={cached ? 'Refreshing read — previous snapshot remains below.' : 'Loading authoritative records…'} /></p>}{Boolean(error) && <><Warn><UI text={cached ? 'Read unavailable. Showing the last successful snapshot. Refresh reads; do not repeat a successful financial confirmation.' : 'Read unavailable. Retry this read; no missing values are assumed to be zero.'} /></Warn><Err e={error} /></>}</>
}

export default function Home() {
  const { api, rev, bump, t } = useApp(), backend = api.homeBackend
  const [retry, setRetry] = useState(0), [message, setMessage] = useState(''), [actionError, setActionError] = useState<unknown>(null)
  const [confirming, setConfirming] = useState<PlanResponse | null>(null), [resolved, setResolved] = useState(() => new Set<string>())
  const [cancelling, setCancelling] = useState(() => new Set<string>()), cancellationRequests = useRef(new Set<string>())
  const version = `${rev}:${retry}`
  const home = useRead<HomeData>(backend?.summary, version)
  const ledger = usePage<LedgerItem, Page<LedgerItem>>(backend?.ledger, version, item => item.entry.entry_id)
  const pending = usePage<PlanResponse, Page<PlanResponse>>(backend?.pending, version, item => item.plan.plan_id)
  const risks = usePage<PendingRisk, RiskPage>(backend?.assessments, version, item => item.plan_id)
  const finish = (id: string, notice: string) => { setResolved(old => new Set(old).add(id)); setConfirming(null); setMessage(notice); setActionError(null); bump() }
  const cancel = async (plan: PlanResponse) => {
    if (!backend || cancellationRequests.current.has(plan.plan.plan_id)) return
    const id = plan.plan.plan_id
    cancellationRequests.current.add(id); setCancelling(old => new Set(old).add(id)); setActionError(null)
    try { await backend.cancel(id); finish(id, 'Plan cancelled successfully. Only plan status changed; no financial posting occurred. Home refreshes separately.') }
    catch (e) { setActionError(e) }
    finally { cancellationRequests.current.delete(id); setCancelling(old => { const next = new Set(old); next.delete(id); return next }) }
  }
  if (!backend) return <div className="space-y-3 p-4"><Warn><UI text="Authoritative Home requires the Node backend. Explicit mock mode is not connected to financial confirmation. Start Node and select live API mode." /></Warn></div>
  const h = home.data, plans = pending.data?.items.filter(p => !resolved.has(p.plan.plan_id)) ?? []
  const groups = (ledger.data?.items ?? []).reduce<Record<string, LedgerItem[]>>((all, item) => { (all[item.activity_id] ??= []).push(item); return all }, {})
  const disabled = home.loading || Boolean(home.error) || pending.loading || Boolean(pending.error) || cancelling.size > 0
  return <div className="pb-6">
    <div className="rounded-b-3xl bg-coral px-5 pb-6 pt-5 text-white">
      <p className="text-xs font-semibold opacity-80"><UI text={h ? `Hi ${h.profile.display_name}` : 'Home'} /></p>
      <h1 className="text-2xl font-extrabold leading-tight"><UI text="Your money." /><br /><UI text="Across borders." /></h1>
    </div>
    <div className="-mt-4 space-y-3 px-4">
      {message && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}
      <Card><ReadStatus loading={home.loading} error={home.error} cached={Boolean(h)} /><Btn kind="outline" onClick={() => setRetry(n => n + 1)}><UI text="Refresh Home reads" /></Btn></Card>
      {h && <>
        <div className={`rounded-2xl p-4 text-white ${h.budget.status === 'Below reserve' ? 'bg-red-600' : h.budget.status === 'At reserve' ? 'bg-amber-600' : 'bg-emerald-600'}`}>
          <div className="text-xs font-semibold opacity-90"><UI text={home.loading || home.error ? 'Last successfully read MYR budget' : 'Current recorded MYR budget'} /></div>
          <div className="text-2xl font-extrabold"><UI text={h.budget.status} /></div>
          <div className="mt-1 text-sm"><UI text="Available above reserve: " />{fmt(h.budget.available_above_reserve.Money)}</div>
          <div className="mt-2"><Badge b={h.budget.badge} /></div>
          <p className="mt-2 text-xs"><UI text="MYR Funding only. KRW balances and pending-plan forecasts are separate; currencies are not converted or combined." /></p>
        </div>
        <BalanceCard label={t('MYR Funding Balance')} balance={h.balances.find(b => b.account_id === 'myr_funding')} />
        <div className="grid grid-cols-2 gap-3"><BalanceCard label={t('KRW Card Balance')} balance={h.balances.find(b => b.account_id === 'krw_card')} /><BalanceCard label={t('KRW Cash-on-Hand')} balance={h.balances.find(b => b.account_id === 'krw_cash')} /></div>
        <Card>
          <Title sub="Your stated allocations — recorded values, not verified bank data"><UI text="Stated budget & reserves" /></Title>
          <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full"><div className="flex-1 bg-emerald-500" /><div className="flex-1 bg-cobalt" /><div className="flex-1 bg-coral" /></div>
          <p className="mt-1 text-[10px] text-ink/50"><UI text="Category colours only; not a calculated allocation chart." /></p>
          <div className="mt-3 space-y-3 text-sm"><MoneyRow label="Available above reserve" value={h.budget.available_above_reserve} /><MoneyRow label="Stated fixed expenses reserve" value={h.profile.fixed_expense_reserve} /><MoneyRow label="Stated emergency reserve" value={h.profile.emergency_reserve} /><MoneyRow label="Total stated reserve" value={h.budget.total_reserve} /><MoneyRow label="Current reserve shortfall" value={h.budget.reserve_shortfall} /></div>
        </Card>
      </>}
      <Title sub="A projection for each plan independently — not the actual current budget"><UI text="Pending-plan forecast" /></Title>
      <ReadStatus loading={risks.loading} error={risks.error} cached={Boolean(risks.data)} />
      {risks.data && <p className="text-xs text-ink/60">{risks.data.notice}</p>}
      {risks.data && risks.data.items.filter(r => !resolved.has(r.plan_id)).map(r => <Card key={r.plan_id} className="space-y-2 text-sm">
        <div className="font-bold"><UI text={r.state} /></div><p>{r.reason.message}</p><p className="break-all text-[10px] text-ink/50"><UI text="Plan " />{r.plan_id} <UI text=" · assessed " />{stamp(r.assessed_at)}</p>
        {r.quote && <Badge b={r.quote.badge} />}
        {r.preview?.projected_reserve_shortfall && <MoneyRow label="Forecast MYR reserve shortfall" value={r.preview.projected_reserve_shortfall} />}
        {r.preview?.other_account_reserve_check?.projected_reserve_shortfall && <MoneyRow label="Forecast separate-account MYR shortfall" value={r.preview.other_account_reserve_check.projected_reserve_shortfall} />}
        {r.projected_deficits.map(d => <MoneyRow key={d.account_id} label={`Forecast account deficit · ${ACC[d.account_id] ?? d.account_id}`} value={d.deficit} />)}
      </Card>)}
      {risks.data && !risks.data.items.filter(r => !resolved.has(r.plan_id)).length && !risks.loading && !risks.error && <p className="text-xs text-ink/55"><UI text="No pending-plan assessments on this page." /></p>}
      {risks.data?.next_cursor && <Btn kind="outline" disabled={risks.moreBusy || risks.loading} onClick={() => void risks.more()}><UI text={risks.moreBusy ? 'Loading…' : 'Load more assessments'} /></Btn>}
      <Title sub="Historical saved quotes; no funds are reserved until actual completion is recorded">{t('Pending / planned')}</Title>
      <ReadStatus loading={pending.loading} error={pending.error} cached={Boolean(pending.data)} />
      <Err e={actionError} />
      {pending.data && !plans.length && !pending.loading && !pending.error && <p className="rounded-xl border border-dashed border-ink/20 p-4 text-center text-xs text-ink/50"><UI text="No pending plans on this page. Pick an option in Compare." /></p>}
      {plans.map(p => {
        const supported = ['exchange', 'atm_withdrawal'].includes(p.plan.quote.objective) && h?.balances.some(v => v.account_id === p.plan.quote.funding_source) && h.balances.some(v => v.account_id === p.context.destination_account)
        return <Card key={p.plan.plan_id}>
          <div className="flex justify-between"><div><div className="font-bold">{p.plan.quote.provider}</div><div className="text-xs text-ink/55">{p.plan.quote.objective === 'atm_withdrawal' ? 'ATM withdrawal' : p.plan.quote.objective}</div></div><div className="text-right text-sm"><b>{fmt(p.plan.quote.total_debit)}</b><div>→ {fmt(p.plan.quote.net_received)}</div></div></div>
          <Badge b={p.plan.quote.badge} />{p.plan.reserve_breached && <p className="mt-1 text-xs text-amber-800"><UI text="Reserve warning acknowledged when saved (historical)." /></p>}
          {!supported && <p className="text-xs text-ink/55"><UI text="Completion unavailable for this objective or missing owned account. No substitute posting is supported." /></p>}
          <div className="mt-3 flex gap-2"><Btn className="flex-1" disabled={disabled || !supported} onClick={() => setConfirming(p)}><UI text="Confirm Completion" /></Btn><Btn kind="outline" disabled={disabled} onClick={() => void cancel(p)}><UI text={cancelling.has(p.plan.plan_id) ? 'Cancelling…' : 'Cancel Plan'} /></Btn></div>
        </Card>
      })}
      {pending.data?.next_cursor && <Btn kind="outline" disabled={pending.moreBusy || pending.loading} onClick={() => void pending.more()}><UI text={pending.moreBusy ? 'Loading…' : 'Load more pending plans'} /></Btn>}
      <Title><UI text="Confirmed ledger" /></Title>
      <ReadStatus loading={ledger.loading} error={ledger.error} cached={Boolean(ledger.data)} />
      {ledger.data && !ledger.data.items.length && !ledger.loading && !ledger.error && <p className="text-xs text-ink/55"><UI text="No confirmed ledger entries on this page." /></p>}
      {Object.entries(groups).map(([id, items]) => <Card key={id} className="space-y-2">{items.map(item => <div key={item.entry.entry_id} className="border-b border-ink/5 pb-2 last:border-0 last:pb-0"><div className="text-sm font-bold">{LABEL[item.entry.type] ?? item.entry.type}<UI text={item.entry.type === 'fee' ? ' (separate debit)' : ''} /></div>{item.entry.lines.map((line, i) => <div key={i} className="flex justify-between text-sm"><span className="text-ink/60">{ACC[line.account] ?? line.account}</span><span>{fmt(line.Money, true)}</span></div>)}<Badge b={item.entry.badge} /></div>)}</Card>)}
      {ledger.data?.next_cursor && <Btn kind="outline" disabled={ledger.moreBusy || ledger.loading} onClick={() => void ledger.more()}><UI text={ledger.moreBusy ? 'Loading…' : 'Load more ledger entries'} /></Btn>}
    </div>
    {confirming && h && <PlanCompletion key={confirming.plan.plan_id} api={backend} plan={confirming} accounts={h.balances} onClose={() => { setConfirming(null); bump() }} onDone={notice => finish(confirming.plan.plan_id, notice)} />}
  </div>
}
function MoneyRow({ label, value }: { label: string; value: import('@/api/types').FV }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-ink/60"><UI text={label} /></span><div className="min-w-0 text-right"><Amount v={value} /></div></div>
}
function BalanceCard({ label, balance }: { label: string; balance?: BalanceItem }) {
  return <Card><div className="text-xs text-ink/60"><UI text={label} /></div>{balance ? <Amount v={balance.balance} big /> : <p><UI text="Account read unavailable." /></p>}</Card>
}
