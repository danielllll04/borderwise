import UI from './i18n-view'
import { useRef, useState } from 'react'
import { ApiError, type AccountId, type ActualActivity, type BalanceItem, type CompletionAssessment, type FV, type HomeBackendApi, type Money, type PlanResponse } from '@/api/types'
import { uid } from '@/api/api'
import { Amount, Badge, Btn, Card, Err, Modal, Warn, fmt } from './kit'
import { useApp } from './ctx'

type FeeField = { id: string; label: string; account: AccountId; value: string }
type Fields = { from: AccountId; to: AccountId; principal: string; received: string; fees: FeeField[]; at: string }
type Review = { actual: ActualActivity; assessment: CompletionAssessment }
type Attempt = Review & { idempotency_key: string; reserve_acknowledgement?: { acknowledged: true; check_token: string } }
// Retain an ambiguous attempt across modal/tab navigation. No credentials or financial data go to localStorage.
const attempts = new Map<string, Attempt>()

function units(money: Money) {
  const n = BigInt(money.amount_minor)
  return money.currency === 'MYR' ? `${n / 100n}.${String(n % 100n).padStart(2, '0')}` : String(n)
}
function money(value: string, currency: Money['currency'], zero = false): Money {
  if (value.length > 30 || !(currency === 'MYR' ? /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d*)$/).test(value)) throw new Error(`Enter ${currency === 'MYR' ? 'MYR with at most two decimal places' : 'whole KRW amounts'}; amounts are not rounded.`)
  const [whole, fraction = ''] = value.split('.')
  const amount = currency === 'MYR' ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole)
  if (amount < (zero ? 0n : 1n) || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Enter an amount within the supported positive range; fees may be zero.')
  return { amount_minor: Number(amount), currency }
}
function startingFields(plan: PlanResponse, attempt?: Attempt): Fields {
  const q = plan.plan.quote, actual = attempt?.actual
  return {
    from: actual?.funding_account ?? q.funding_source as AccountId, to: actual?.destination_account ?? plan.context.destination_account,
    principal: units(actual?.principal ?? q.principal), received: units(actual?.amount_received ?? q.net_received),
    fees: actual ? actual.fees.map((f, i) => ({ id: `fee-${i}`, label: f.label, account: f.account_id, value: units(f.Money) }))
      : q.fees.map((f, i) => ({ id: `fee-${i}`, label: f.label, account: plan.context.fee_accounts?.[i] ?? q.funding_source as AccountId, value: units(f.Money) })),
    at: actual?.completed_at ?? new Date().toISOString(),
  }
}
function Field({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const {t} = useApp()
  return <label className="block text-sm"><span className="text-ink/60"><UI text={label} /></span><input aria-label={t(label)} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 px-3 font-semibold" /></label>
}
function Value({ label, value }: { label: string; value: FV }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-ink/60"><UI text={label} /></span><div className="min-w-0 text-right"><Amount v={value} /></div></div>
}

export default function PlanCompletion({ api, plan, accounts, onClose, onDone }: {
  api: HomeBackendApi; plan: PlanResponse; accounts: BalanceItem[]; onClose: () => void; onDone: (message: string) => void
}) {
  const id = plan.plan.plan_id, atm = plan.plan.quote.objective === 'atm_withdrawal'
  const [initial] = useState(() => attempts.get(id))
  const [form, setForm] = useState(() => startingFields(plan, initial)), [attempt, setAttempt] = useState(initial)
  const [review, setReview] = useState<Review | null>(initial ?? null), [error, setError] = useState<unknown>(null)
  const [confirmed, setConfirmed] = useState(Boolean(initial)), [ack, setAck] = useState(Boolean(initial?.reserve_acknowledgement))
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('')
  const inFlight = useRef(false)
  const account = (key: AccountId) => { const found = accounts.find(a => a.account_id === key); if (!found) throw new Error('An owned account is unavailable. Refresh Home.'); return found }
  const currency = (key: AccountId) => account(key).balance.Money.currency
  const locked = busy || Boolean(attempt)
  const edit = (patch: Partial<Fields>) => { if (locked) return; setForm(f => ({ ...f, ...patch })); setReview(null); setConfirmed(false); setAck(false); setError(null); setStatus('') }
  const destinations = accounts.filter(a => atm ? a.account_id === 'krw_cash' : a.account_id !== form.from && a.balance.Money.currency !== currency(form.from))
  const actual = (): ActualActivity => {
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(form.at) || !Number.isFinite(Date.parse(form.at))) throw new Error('Supply the actual completion timestamp in ISO format with a timezone.')
    return { activity_type: atm ? 'atm_withdrawal' : 'exchange', funding_account: form.from, destination_account: form.to,
      principal: money(form.principal, currency(form.from)), amount_received: money(form.received, currency(form.to)),
      fees: form.fees.map(f => ({ label: f.label, account_id: f.account, Money: money(f.value, currency(f.account), true) })), completed_at: form.at }
  }
  const preview = async () => {
    if (inFlight.current || attempt) return
    inFlight.current = true; setBusy(true); setError(null); setReview(null); setConfirmed(false); setAck(false)
    try { const input = actual(); setReview({ actual: input, assessment: await api.preview(id, input) }) }
    catch (e) { setError(e) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = async () => {
    if (inFlight.current || !review || !confirmed || review.assessment.requires_reserve_acknowledgement && !ack) return
    inFlight.current = true; setBusy(true); setError(null)
    const request = attempt ?? { ...review, idempotency_key: `home-completion:${id}`, ...(review.assessment.requires_reserve_acknowledgement ? { reserve_acknowledgement: { acknowledged: true as const, check_token: review.assessment.check_token } } : {}) }
    attempts.set(id, request); setAttempt(request)
    let succeeded = false
    try { await api.confirm(id, { actual: request.actual, confirmed: true, idempotency_key: request.idempotency_key, ...(request.reserve_acknowledgement ? { reserve_acknowledgement: request.reserve_acknowledgement } : {}) }); succeeded = true }
    catch (e) {
      setError(e)
      if (e instanceof ApiError && (e.status === 400 || e.status === 422 || ['STALE_RESERVE_CHECK', 'RESERVE_ACKNOWLEDGEMENT_REQUIRED'].includes(e.code))) {
        attempts.delete(id); setAttempt(undefined); setReview(null); setConfirmed(false); setAck(false)
      }
    } finally { inFlight.current = false; setBusy(false) }
    // Posting success is final. Optional Home refreshes run outside this financial try/catch.
    if (succeeded) { attempts.delete(id); onDone('Completion recorded successfully. Home refreshes are separate reads; do not confirm again.') }
  }
  const checkStatus = async () => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try {
      const current = await api.readPlan(id)
      if (current.plan.status !== 'pending') { attempts.delete(id); onDone(`Node reports this plan ${current.plan.status}. Refreshing authoritative records; no further confirmation is needed.`) }
      else setStatus('Node still reports pending at this read. Retry the original confirmation unchanged if needed.')
    } catch { setStatus('Status read unavailable. The previous confirmation outcome remains unverified; keep the original retry details.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const a = review?.assessment, reserve = a?.reserve_check.applicability === 'applicable' ? a.reserve_check : a?.other_account_reserve_check
  return <Modal title="Did you complete this?" onClose={() => { if (!inFlight.current) onClose() }}>
    <p className="mb-3 text-sm text-ink/60"><UI text="Record activity completed elsewhere. Quote values are prefilled for review, not proof of actual payment." /></p>
    <Badge b={plan.plan.quote.badge} />
    {attempt && <Warn><UI text="A confirmation was submitted. Keep these exact details for retries or check Node status. Closing does not undo a recorded activity." /></Warn>}
    <div className="mt-3 space-y-3">
      <label className="block text-sm"><UI text="Funding account debited" /><select disabled={locked} value={form.from} onChange={e => {
        const from = e.target.value as AccountId
        const next = accounts.find(v => atm ? v.account_id === 'krw_cash' : v.account_id !== from && v.balance.Money.currency !== currency(from))
        edit({ from, principal: '', ...(next ? { to: next.account_id, received: '' } : {}) })
      }} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3">{accounts.filter(v => !atm || ['myr_funding', 'krw_card'].includes(v.account_id)).map(v => <option key={v.account_id} value={v.account_id}>{v.display_name} ({v.balance.Money.currency})</option>)}</select></label>
      <label className="block text-sm"><UI text="Receiving account" /><select disabled={locked || atm} value={form.to} onChange={e => edit({ to: e.target.value as AccountId, received: '' })} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3">{destinations.map(v => <option key={v.account_id} value={v.account_id}>{v.display_name} ({v.balance.Money.currency})</option>)}</select></label>
      <Field label={`Actual principal (${currency(form.from)})`} value={form.principal} disabled={locked} onChange={principal => edit({ principal })} />
      <Field label={`Actual amount received (${currency(form.to)})`} value={form.received} disabled={locked} onChange={received => edit({ received })} />
      {form.fees.map((f, i) => <Card key={f.id} className="space-y-2">
        <Field label={`Fee ${i + 1} label`} value={f.label} disabled={locked} onChange={label => edit({ fees: form.fees.map(v => v.id === f.id ? { ...v, label } : v) })} />
        <label className="block text-sm"><UI text="Fee " />{i + 1} <UI text=" account" /><select disabled={locked} value={f.account} onChange={e => edit({ fees: form.fees.map(v => v.id === f.id ? { ...v, account: e.target.value as AccountId, value: '' } : v) })} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3">{accounts.map(v => <option key={v.account_id} value={v.account_id}>{v.display_name} ({v.balance.Money.currency})</option>)}</select></label>
        <Field label={`Fee ${i + 1} amount (${currency(f.account)})`} value={f.value} disabled={locked} onChange={value => edit({ fees: form.fees.map(v => v.id === f.id ? { ...v, value } : v) })} />
        <Btn kind="outline" disabled={locked} onClick={() => edit({ fees: form.fees.filter(v => v.id !== f.id) })}><UI text="Remove fee " />{i + 1}</Btn>
      </Card>)}
      <Btn kind="outline" disabled={locked || form.fees.length >= 50} onClick={() => edit({ fees: [...form.fees, { id: uid(), label: 'Actual fee', account: form.from, value: '' }] })}><UI text="Add actual fee" /></Btn>
      <Field label="Actual completion timestamp (ISO with timezone)" value={form.at} disabled={locked} onChange={at => edit({ at })} />
      <Btn className="w-full" disabled={busy || Boolean(attempt)} onClick={() => void preview()}><UI text={busy && !attempt ? 'Checking actuals…' : 'Preview completion'} /></Btn>
    </div>
    {a && <div className="mt-4 space-y-3">
      <h4 className="font-bold"><UI text={attempt ? 'Node preview reviewed before submission' : 'Node completion preview — no posting yet'} /></h4>
      <Card className="space-y-3 text-sm">{a.account_impacts.map(v => <div key={v.account_id} className="space-y-2"><b>{account(v.account_id).display_name}</b><Value label="Current balance" value={v.current_balance} /><Value label="Actual debit" value={v.total_debits} /><Value label="Actual credit" value={v.total_credits} /><Value label="Projected balance" value={v.projected_balance} /></div>)}</Card>
      <Card className="space-y-3 text-sm"><h4 className="font-bold"><UI text="Differences from saved quote (Node)" /></h4>
        {([['Principal', a.differences.principal], ['Funding-account total debit', a.differences.total_debit], ['Amount received', a.differences.amount_received]] as const).map(([label, d]) => <div key={label} className="space-y-1"><b><UI text={label} /></b><Value label="Quoted" value={d.quoted} /><Value label="Actual" value={d.actual} />{d.difference ? <p><UI text="Difference: " />{fmt(d.difference.Money, true)} <Badge b={d.difference.badge} /></p> : <p><UI text="Currency changed; no converted difference." /></p>}</div>)}
        <p><UI text="Funding: " />{a.differences.funding_account.quoted} → {a.differences.funding_account.actual}</p><p><UI text="Destination: " />{a.differences.destination_account.quoted} → {a.differences.destination_account.actual}</p>
        <p><UI text="Fee breakdown changed: " /><UI text={a.differences.fees.changed ? 'Yes' : 'No'} /></p>
        {(['quoted', 'actual'] as const).map(kind => <div key={kind}><b><UI text={kind === 'quoted' ? 'Quoted fees' : 'Actual fees'} /></b>{!a.differences.fees[kind].length && <p><UI text="No fees" /></p>}{a.differences.fees[kind].map((f, i) => <Value key={i} label={`${f.label} · ${f.account_id}`} value={f} />)}</div>)}
      </Card>
      {a.requires_reserve_acknowledgement && <Warn><UI text="Actual figures would breach the stated MYR reserve. Acknowledge this current Node warning; it cannot override insufficient funds." /></Warn>}
      {reserve?.applicability === 'applicable' && <Card className="space-y-2 text-sm"><b><UI text="MYR reserve impact (Node)" /></b>{reserve.total_reserve && <Value label="Stated reserve" value={reserve.total_reserve} />}{reserve.projected_balance && <Value label="Projected MYR balance" value={reserve.projected_balance} />}{reserve.projected_reserve_shortfall && <Value label="Projected reserve shortfall" value={reserve.projected_reserve_shortfall} />}</Card>}
      {reserve?.applicability !== 'applicable' && <p className="text-xs text-ink/55"><UI text="MYR reserve check is not applicable to these accounts." /></p>}
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || Boolean(attempt)} onChange={e => setConfirmed(e.target.checked)} /><UI text="I confirm these actual amounts, accounts and time describe activity completed elsewhere." /></label>
      {a.requires_reserve_acknowledgement && <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={ack} disabled={busy || Boolean(attempt)} onChange={e => setAck(e.target.checked)} /><UI text="I acknowledge the current Node reserve warning." /></label>}
      <Btn className="w-full" disabled={busy || !confirmed || a.requires_reserve_acknowledgement && !ack} onClick={() => void submit()}><UI text={busy && attempt ? 'Recording…' : attempt ? 'Retry original confirmation' : 'Confirm & Update Ledger'} /></Btn>
    </div>}
    <Err e={error} />
    {attempt && <Btn kind="outline" disabled={busy} className="mt-3 w-full" onClick={() => void checkStatus()}><UI text="Check recorded status" /></Btn>}
    {status && <p role="status" className="mt-3 text-sm"><UI text={status} /></p>}
    <Btn kind="outline" disabled={busy} className="mt-3 w-full" onClick={onClose}><UI text={attempt ? 'Close and refresh Home' : 'Not Completed Yet'} /></Btn>
    <p className="mt-2 text-[11px] text-ink/50"><UI text="Only explicit confirmation posts actual principal and separate fee entries. It does not execute a bank transaction." /></p>
  </Modal>
}
