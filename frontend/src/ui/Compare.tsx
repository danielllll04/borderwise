import UI from './i18n-view'
import { useEffect, useRef, useState } from 'react'
import { ApiError, type AccountId, type CompareOption, type CompareRequest, type CompareResult, type ManualCompareApi, type ProposalPreview } from '@/api/types'
import { Badge, Btn, Card, Details, Err, Modal, Title, Warn, fmt } from './kit'
import { ComparisonCard } from './shared'
import { useApp } from './ctx'

type Objective = CompareRequest['objective']
type Mode = 'budget' | 'target'
type Attempt = { token: string; ack?: { acknowledged: true; check_token: string } }
const OBJ: { id: Objective; t: string; s: string }[] = [
  { id: 'exchange', t: 'Exchange currency before spending', s: 'Money changers & transfer services like Wise' },
  { id: 'card', t: 'Pay by card in another country', s: 'Visa/Mastercard indicative rates + issuer fees' },
  { id: 'atm_withdrawal', t: 'Withdraw cash from an ATM', s: 'ATM operator fees & foreign-card charges' }]

function minorUnits(value: string, mode: Mode) {
  if (!(mode === 'budget' ? /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d*)$/).test(value)) throw new Error(mode === 'budget' ? 'Enter a MYR amount with at most two decimal places.' : 'Enter a whole KRW amount.')
  const [whole, fraction = ''] = value.split('.')
  const minor = mode === 'budget' ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole)
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Enter a positive amount within the supported range.')
  return Number(minor)
}

function PlanReview({ api, sessionId, option, attempts, onClose, onDone, onRevise }: {
  api: ManualCompareApi; sessionId: string; option: CompareOption; attempts: Map<string, Attempt>
  onClose: () => void; onDone: () => void; onRevise: (minor: number) => void
}) {
  const [review, setReview] = useState<ProposalPreview | null>(null), [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false), [acknowledged, setAcknowledged] = useState(false), [refresh, setRefresh] = useState(0)
  const posting = useRef(false)
  const proposalId = option.proposal_id!
  useEffect(() => {
    let active = true
    api.preview(sessionId, proposalId).then(value => { if (active) setReview(value) }).catch(e => { if (active) setError(e) })
    return () => { active = false }
  }, [api, sessionId, proposalId, refresh])
  const save = async () => {
    if (posting.current || !review || review.preview.requires_reserve_acknowledgement && !acknowledged) return
    posting.current = true; setBusy(true); setError(null)
    // Freeze ambiguous-network retries; a fresh preview must not change a previously submitted body.
    const attempt = attempts.get(proposalId) ?? { token: review.preview.check_token, ...(review.preview.requires_reserve_acknowledgement ? { ack: { acknowledged: true as const, check_token: review.preview.check_token } } : {}) }
    attempts.set(proposalId, attempt)
    try { await api.save(sessionId, proposalId, `manual-compare:${proposalId}`, attempt.token, attempt.ack); onDone() }
    catch (e) {
      setError(e)
      if (e instanceof ApiError && ['PROPOSAL_STALE', 'STALE_RESERVE_CHECK', 'RESERVE_ACKNOWLEDGEMENT_REQUIRED'].includes(e.code)) {
        attempts.delete(proposalId); setReview(null); setAcknowledged(false)
      }
    } finally { posting.current = false; setBusy(false) }
  }
  const a = review?.preview
  const safe = a?.reserve_check?.max_safe_total_debit
  return <Modal title={!a ? 'Checking your plan…' : a.requires_reserve_acknowledgement ? 'This uses part of your reserve' : 'Review pending plan'} onClose={() => { if (!posting.current) onClose() }}>
    {!a && !error && <p className="text-sm text-ink/60"><UI text="Running the fee-aware budget check." /></p>}
    {a && <>
      {a.requires_reserve_acknowledgement && <Warn><UI text="Total debit including fees takes your balance below your " /><b><UI text="stated reserve" /></b>.</Warn>}
      <Card className="mt-3 space-y-3 text-sm">
        <p className="font-bold">{review.selection.quote.provider}</p>
        {([['Reported MYR balance', a.current_balance], ['Stated protected reserves', a.total_reserve], ['Planned total debit (principal + fees)', a.total_debit], ['Projected balance after plan', a.projected_balance]] as const).map(([label, value]) => <div key={label} className="flex justify-between gap-3"><span><UI text={label} /></span><div className="text-right"><b>{fmt(value.Money)}</b><Badge b={value.badge} /></div></div>)}
        {a.requires_reserve_acknowledgement && <p className="font-semibold text-amber-700">{fmt(a.projected_reserve_shortfall.Money)} <UI text=" below your stated reserve" /></p>}
      </Card>
      <p className="mt-3 text-xs text-ink/55"><UI text="Saving a plan does not deduct or set aside money." /></p>
      {a.requires_reserve_acknowledgement && <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} /><UI text="I acknowledge this reserve warning for the displayed amounts." /></label>}
    </>}
    <Err e={error} />
    <div className="mt-4 space-y-2">
      {!a && Boolean(error) && <Btn className="w-full" onClick={() => { setError(null); setRefresh(r => r + 1) }}><UI text="Retry preview" /></Btn>}
      {safe && safe.Money.currency === 'MYR' && safe.Money.amount_minor > 0 && a?.requires_reserve_acknowledgement && <Btn kind="outline" disabled={busy} className="w-full" onClick={() => onRevise(safe.Money.amount_minor)}><UI text="Compare revised budget (" />{fmt(safe.Money)})</Btn>}
      {a && <Btn kind={a.requires_reserve_acknowledgement ? 'coral' : 'primary'} className="w-full" disabled={busy || a.requires_reserve_acknowledgement && !acknowledged} onClick={() => void save()}><UI text={busy ? 'Saving…' : error ? 'Retry Save' : a.requires_reserve_acknowledgement ? 'Save with acknowledgement' : 'Save pending plan'} /></Btn>}
      <Btn kind="outline" className="w-full" disabled={busy} onClick={onClose}><UI text="Cancel plan" /></Btn>
    </div>
  </Modal>
}

export default function Compare() {
  const { api, bump, go, t } = useApp()
  const [obj, setObj] = useState<Objective>('exchange'), [mode, setMode] = useState<Mode>('budget'), [val, setVal] = useState('100')
  const [funding, setFunding] = useState<AccountId>('myr_funding'), [network, setNetwork] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState<CompareOption | null>(null), [toast, setToast] = useState('')
  const sequence = useRef(0)
  const [attempts] = useState(() => new Map<string, Attempt>())
  useEffect(() => () => { sequence.current++ }, [])
  const clear = () => { sequence.current++; setResult(null); setError(null); setBusy(false); setSaving(null); setToast('') }
  const load = async (revisedMinor?: number) => {
    const ticket = ++sequence.current
    setBusy(true); setError(null); setResult(null); setToast('')
    try {
      if (!api.compare) throw new Error('Manual backend Compare is unavailable in mock mode. Start the live backend and set VITE_USE_MOCK=false.')
      if (obj === 'atm_withdrawal' && !network) throw new Error('Select a card network, or explicitly choose Unknown.')
      const selectedMode = revisedMinor === undefined ? mode : 'budget'
      const request: CompareRequest = { objective: obj, amount: { amount_minor: revisedMinor ?? minorUnits(val, selectedMode), currency: selectedMode === 'budget' ? 'MYR' : 'KRW' }, amount_basis: selectedMode === 'budget' ? 'total_debit_budget' : 'destination_target', funding_account: funding, destination_account: obj === 'atm_withdrawal' ? 'krw_cash' : 'krw_card', ...(obj === 'atm_withdrawal' ? { card_network: network } : {}) }
      const data = await api.compare.quotes(request)
      if (ticket === sequence.current) setResult(data)
    } catch (e) { if (ticket === sequence.current) setError(e) }
    finally { if (ticket === sequence.current) setBusy(false) }
  }
  const reduce = (minor: number) => { setSaving(null); setMode('budget'); setVal((minor / 100).toFixed(2)); void load(minor) }
  return <div className="space-y-4 p-4">
    <h1 className="text-xl font-extrabold">{t('Find a better way to move money')}</h1>
    <Title><UI text="1 · What do you want to do?" /></Title>
    {OBJ.map(o => <button key={o.id} onClick={() => { clear(); setObj(o.id) }} className={`flex min-h-[44px] w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left ${obj === o.id ? 'border-cobalt ring-1 ring-cobalt' : 'border-ink/10'}`}>
      <i className={`grid h-5 w-5 place-items-center rounded-full border-2 ${obj === o.id ? 'border-cobalt' : 'border-ink/25'}`}>{obj === o.id && <b className="h-2.5 w-2.5 rounded-full bg-cobalt" />}</i>
      <span><span className="block text-sm font-bold">{t(o.t)}</span><span className="text-xs text-ink/55">{o.s}</span></span></button>)}
    <Title><UI text="2 · Amount" /></Title>
    <Card>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 text-sm font-semibold">
        {(['budget', 'target'] as Mode[]).map(m => <button key={m} onClick={() => { clear(); setMode(m); setVal(m === 'budget' ? '100' : '100000') }} className={`min-h-[44px] rounded-lg ${mode === m ? 'bg-white shadow' : 'text-ink/55'}`}>{t(m === 'budget' ? 'Fixed budget' : 'Fixed target')}</button>)}</div>
      <label className="flex items-center gap-2 text-sm"><UI text={mode === 'budget' ? 'I have RM' : 'I need ₩'} /><input aria-label={t('Compare amount')} inputMode={mode === 'budget' ? 'decimal' : 'numeric'} value={val} onChange={e => { clear(); setVal(e.target.value) }} className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-ink/15 px-3 text-lg font-bold" /></label>
      <p className="mt-2 text-xs text-ink/55"><UI text={mode === 'budget' ? 'Ranked by most KRW received after all fees.' : 'Ranked by lowest total MYR cost including fees.'} /></p>
      <label className="mt-3 block text-sm"><UI text="Funding source" /><select value={funding} onChange={e => { clear(); setFunding(e.target.value as AccountId) }} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3"><option value="myr_funding"><UI text="MYR Funding" /></option><option value="krw_card"><UI text="KRW Card" /></option><option value="krw_cash"><UI text="KRW Cash" /></option></select></label>
      {obj === 'atm_withdrawal' && <label className="mt-3 block text-sm"><UI text="Card network" /><select value={network} onChange={e => { clear(); setNetwork(e.target.value) }} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3"><option value=""><UI text="Select network" /></option>{['Visa', 'Mastercard', 'UnionPay', 'Plus', 'Unknown'].map(n => <option key={n} value={n.toLowerCase()}>{n}</option>)}</select></label>}
      <Btn className="mt-3 w-full" disabled={busy} onClick={() => void load()}><UI text={busy ? 'Comparing…' : 'Compare options'} /></Btn>
    </Card>
    <Title sub="Simulated prices · ranked for your request"><UI text="3 · Ranked options" /></Title>
    {obj === 'card' && <Warn><UI text="Card purchases are not supported yet." /></Warn>}
    {busy && <p role="status" className="text-sm text-ink/60"><UI text="Loading options…" /></p>}
    <Err e={error} />
    {Boolean(error) && <Btn kind="outline" disabled={busy} onClick={() => void load()}><UI text="Retry Compare" /></Btn>}
    {!result && !busy && !error && <p className="text-sm text-ink/55"><UI text="Choose your inputs, then compare." /></p>}
    {result && result.status !== 'ready' && <Card><p className="text-sm">{result.reason}</p><Btn kind="outline" className="mt-3" onClick={() => void load()}><UI text="Retry Compare" /></Btn></Card>}
    {result?.status === 'ready' && <>
      <Details label="About these options"><UI text="Options are ranked by the comparison service. Prices are Simulated; check with the provider before use." /></Details>
      {!result.options.length && <Card><UI text="No options for these inputs. Change the amount or network and compare again." /></Card>}
      {result.options.map(o => <div key={o.snapshot_id} className="space-y-1">
        <ComparisonCard sel={o.selection} rank={o.rank} primary={mode === 'budget' ? 'net' : 'debit'} blocked={o.blocking_error ?? (!o.proposal_id ? 'Preview unavailable' : null)} onSave={() => setSaving(o)} />
        <p className="px-2 text-xs text-ink/55"><UI text="Principal: " />{fmt(o.selection.quote.principal)}<UI text={o.atm_info ? ` · ${o.atm_info.location_name}` : ''} /></p>
        {o.compatibility && <p className="px-1 text-xs text-ink/50"><UI text={o.compatibility.status === 'unknown' ? 'Compatibility unknown — check with your card provider.' : o.compatibility.status === 'compatible' ? 'Network supported in sample data only.' : 'Network not supported in sample data.'} /></p>}
      </div>)}
    </>}
    {toast && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{toast}</div>}
    {saving && result?.status === 'ready' && api.compare && <PlanReview key={saving.proposal_id} api={api.compare} sessionId={result.session_id} option={saving} attempts={attempts} onRevise={reduce} onClose={() => setSaving(null)} onDone={() => {
      setSaving(null); setToast('Plan saved. Your balances are unchanged.'); bump()
      void Promise.allSettled([api.home(), api.listPlans('pending')])
      window.setTimeout(() => go('home'), 900)
    }} />}
  </div>
}
