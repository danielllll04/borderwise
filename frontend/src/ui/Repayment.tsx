import { useEffect, useRef, useState } from 'react'
import type { AccountId, BalanceItem } from '@/api/types'
import { ApiError } from '@/api/types'
import type { Debt, RepaymentInput, RepaymentResult, SettlementHistory } from '@/api/split-types'
import { uid } from '@/api/api'
import { useApp } from './ctx'
import { Badge, Btn, Card, Err, Modal, Warn, fmt, stamp } from './kit'
import { ReceiptField } from './ReceiptReview'
import { actualTime, enteredMoney, readWorkflow, units, writeWorkflow } from './split-state'

type State = {cleared: string; received: string; account: AccountId | ''; at: string; source: string; attempt?: RepaymentInput; result?: RepaymentResult}
export default function Repayment({debt: original, onClose}: {debt: Debt; onClose: () => void}) {
  const {api, bump} = useApp(), backend = api.splitBackend!, id = original.receivable.receivable_id
  const key = `${backend.storageNamespace}:repayment:${id}`
  const [debt, setDebt] = useState(original), [state, setState] = useState<State>(() => readWorkflow(key, {cleared: units(original.outstanding_amount), received: '', account: '', at: new Date().toISOString(), source: ''}))
  const current = useRef(state), lock = useRef(false)
  const [accounts, setAccounts] = useState<BalanceItem[]>([]), [history, setHistory] = useState<SettlementHistory[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [readError, setReadError] = useState<unknown>(null), [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState('')
  const store = (next: State) => { writeWorkflow(key, next); current.current = next; setState(next) }
  const refresh = async (next?: string) => {
    try {
      const [d, h, home] = await Promise.all([backend.debt(id), backend.history(id, next), api.homeBackend!.summary()])
      setDebt(d); setHistory(old => [...new Map([...(next ? old : []), ...h.items].map(row => [row.settlement_id, row])).values()]); setCursor(h.next_cursor); setAccounts(home.balances); setReadError(null)
    } catch (e) { setReadError(e) }
  }
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e) } finally { lock.current = false; setBusy(false) }
  }
  const startup = useRef(() => run(() => refresh()))
  useEffect(() => { void startup.current() }, [])
  const edit = (patch: Partial<State>) => { try { store({...current.current, ...patch}); setConfirmed(false) } catch (e) { setError(e) } }
  const submit = () => run(async () => {
    let input = current.current.attempt
    if (!input) {
      if (!confirmed || readError) return
      const s = current.current, account = accounts.find(a => a.account_id === s.account)
      if (!account) throw new Error('Choose an owned receiving account.')
      input = {frontend_action: 'confirm_repayment', confirmed: true, idempotency_key: `repayment-ui:${uid()}`, amount_cleared: enteredMoney(s.cleared, debt.original_amount.currency), amount_received: enteredMoney(s.received, account.balance.Money.currency), receiving_account: account.account_id, received_at: actualTime(s.at), provenance: {source: s.source.trim()}}
      if (!input.provenance.source || input.provenance.source.length > 600) throw new Error('Describe how you checked the actual repayment (1–600 characters).')
      store({...s, attempt: input})
    }
    let result: RepaymentResult
    try { result = await backend.repay(id, input) }
    catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.code !== 'IDEMPOTENCY_CONFLICT') { store({...current.current, attempt: undefined}); setConfirmed(false); await refresh() }
      throw e
    }
    const next = {...current.current, result, attempt: undefined}; current.current = next; setState(next); setConfirmed(false)
    setNotice('Repayment recorded successfully. It clears debt and is never income. Refresh failures cannot undo this posting.'); bump()
    try { writeWorkflow(key, next) } catch { setNotice('Repayment recorded successfully. Browser cleanup failed; only retry the retained original request if recovery is necessary.') }
    await refresh()
  })
  const locked = busy || Boolean(state.attempt) || Boolean(state.result)
  const receiving = accounts.find(a => a.account_id === state.account)
  return <Modal title="Repayment & history" onClose={onClose}><div className="space-y-3 text-sm">
    <Card className="space-y-2"><b>{debt.receivable.debtor} · {debt.status}</b><p>Original debt: {fmt(debt.original_amount)}</p><p>Cleared: {fmt(debt.cleared_amount)}</p><p>Outstanding (Node): {fmt(debt.outstanding_amount)}</p><Badge b={debt.provenance.original_debt} /><p className="break-all text-xs">Receivable {id} · participant {debt.participant_id ?? 'Legacy unlinked'} · split {debt.split_id ?? 'Legacy unlinked'}</p></Card>
    {busy && <p role="status">Waiting for Node…</p>}<Err e={error} /><Err e={readError} />{notice && <p role="status" className="text-emerald-800">{notice}</p>}
    <Btn kind="outline" disabled={busy} onClick={() => void run(() => refresh())}>Refresh debt and history</Btn>
    {state.result && <Card className="space-y-2"><b>Repayment recorded once</b><p className="break-all">Activity {state.result.activity_id}</p><p>Outstanding at this posting: {fmt(state.result.receivable_at_posting.outstanding_amount)}</p>{state.result.current_state.status === 'unavailable' && <Warn>Posting succeeded; optional current-state read unavailable. Retry the read only.</Warn>}{debt.status !== 'settled' && !readError && <Btn disabled={busy} onClick={() => { try { store({cleared: units(debt.outstanding_amount), received: '', account: '', at: new Date().toISOString(), source: ''}); setNotice('Enter and explicitly confirm a separate actual repayment.'); setConfirmed(false) } catch (e) { setError(e) } }}>Record another repayment</Btn>}</Card>}
    {state.attempt && !state.result && <Card><Warn>Outcome uncertain. Inputs are locked and the exact original request/key is retained across reloads. Do not start another repayment.</Warn><p>Clear {fmt(state.attempt.amount_cleared)}; received {fmt(state.attempt.amount_received)} into {state.attempt.receiving_account}.</p><Btn disabled={busy} onClick={() => void submit()}>Retry original repayment</Btn></Card>}
    {!state.result && <Card className="space-y-3"><Warn>Enter two independent actual amounts. No indicative FX is used. Fees and FX snapshots are unsupported here.</Warn><ReceiptField label={`Original debt to clear (${debt.original_amount.currency})`} value={state.cleared} disabled={locked || debt.status === 'settled'} onChange={cleared => edit({cleared})} />
      <label className="block">Owned receiving account<select aria-label="Owned receiving account" className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3" disabled={locked} value={state.account} onChange={e => edit({account: e.target.value as AccountId, received: ''})}><option value="">Choose account</option>{accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.display_name} ({a.balance.Money.currency})</option>)}</select></label>
      <ReceiptField label={`Actual repayment received (${receiving?.balance.Money.currency ?? 'choose account'})`} value={state.received} disabled={locked || !receiving} onChange={received => edit({received})} /><ReceiptField label="Actual repayment timestamp (ISO timezone)" value={state.at} disabled={locked} onChange={at => edit({at})} /><ReceiptField label="Repayment evidence / source" value={state.source} disabled={locked} onChange={source => edit({source})} />
      <p>Repayment credits the selected account and reduces original debt. It never debits the original bill or creates income. Same-currency principal amounts must match; Node validates all amounts.</p><label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" disabled={locked || debt.status === 'settled'} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the actual repayment and confirm these independent amounts</label><Btn disabled={locked || !confirmed || Boolean(readError) || debt.status === 'settled'} onClick={() => void submit()}>Confirm actual repayment</Btn>
    </Card>}
    <Card className="space-y-3"><b>Authoritative settlement history</b>{!history.length && !readError && <p>No repayments recorded.</p>}{history.map(h => <div key={h.settlement_id} className="space-y-1 border-t border-ink/10 pt-2"><p>Original debt cleared: {fmt(h.amount_cleared)}</p><p>Actual received: {fmt(h.amount_received)} into {h.receiving_account}</p><p>Received: {h.received_at ? stamp(h.received_at) : 'Unknown (legacy record)'}</p><p>Recorded: {stamp(h.recorded_at)}</p><Badge b={h.provenance} /><p className="break-all text-xs">Settlement {h.settlement_id} · ledger {h.ledger_entry_ids.join(', ')}</p></div>)}{cursor && <Btn disabled={busy} onClick={() => void run(() => refresh(cursor))}>Load more repayments</Btn>}</Card>
  </div></Modal>
}
