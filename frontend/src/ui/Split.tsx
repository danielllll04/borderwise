import { useCallback, useEffect, useRef, useState } from 'react'
import type { Debt } from '@/api/split-types'
import { uid } from '@/api/api'
import { Badge, Btn, Card, Err, Title, Warn, fmt } from './kit'
import { useApp } from './ctx'
import { initialSession } from './agent-state'
import { readWorkflow, writeWorkflow } from './split-state'
import ReceiptReview from './ReceiptReview'
import Repayment from './Repayment'

export default function Split() {
  const {api, rev, t} = useApp(), backend = api.splitBackend
  const [rows, setRows] = useState<Debt[]>([]), [selected, setSelected] = useState<Debt | null>(null)
  const [status, setStatus] = useState<'all' | 'outstanding' | 'settled'>('outstanding'), [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true), [error, setError] = useState<unknown>(null), [session, setSession] = useState(''), [workflow, setWorkflow] = useState<string | null>(null)
  const [workflows, setWorkflows] = useState<string[]>([]), lock = useRef(false), generation = useRef(0)
  const [sessionRetry, setSessionRetry] = useState(0)
  const load = useCallback(async (next?: string) => {
    if (!backend) return
    const g = ++generation.current; setBusy(true); setError(null)
    try { const page = await backend.debts(status, next); if (g !== generation.current) return; setRows(old => [...new Map([...(next ? old : []), ...page.items].map(r => [r.receivable.receivable_id, r])).values()]); setCursor(page.next_cursor) }
    catch (e) { if (g === generation.current) setError(e) } finally { if (g === generation.current) setBusy(false) }
  }, [backend, status])
  useEffect(() => {
    if (!backend) return
    const g = ++generation.current
    backend.debts(status).then(page => { if (g === generation.current) { setRows(page.items); setCursor(page.next_cursor); setError(null); setBusy(false) } }).catch(e => { if (g === generation.current) {setError(e); setBusy(false)} })
  }, [backend, status, rev])
  useEffect(() => {
    let active = true
    if (api.agentBackend && backend) void initialSession(api.agentBackend).then(id => { if (active) {setSession(id); setWorkflows(readWorkflow(`${backend.storageNamespace}:workflows:${id}`, []))} }).catch(e => { if (active) setError(e) })
    return () => { active = false }
  }, [api.agentBackend, backend, sessionRetry])
  const startReceipt = () => {
    if (!backend || !session || lock.current) return
    lock.current = true
    try { const id = uid(), next = [...workflows, id]; writeWorkflow(`${backend.storageNamespace}:workflows:${session}`, next); setWorkflows(next); setWorkflow(id) }
    catch (e) { setError(e) } finally { lock.current = false }
  }
  if (!backend) return <div className="p-4"><Warn>Split requires the connected Node backend. Financial actions are unavailable in mock mode.</Warn></div>
  return <div className="space-y-3 p-4"><h1 className="text-xl font-extrabold">{t('Split expenses')}</h1>
    <Warn>Node ledger is authoritative. Original debts and actual repayments retain their own currencies. OCR currently returns Simulated sample output.</Warn>
    {!session && <Btn kind="outline" onClick={() => setSessionRetry(n => n + 1)}>Retry receipt session connection</Btn>}
    <Card className="space-y-2"><b>Receipt review</b><p className="text-sm">Upload privately, correct the sample extraction, assign items, then explicitly confirm a trusted allocation.</p><Btn disabled={!session || busy} onClick={startReceipt}>Upload a new receipt</Btn>{workflows.map((id, index) => <div key={id}><Btn kind="outline" onClick={() => setWorkflow(id)}>Resume receipt review {index + 1}</Btn></div>)}</Card>
    <Title>Owed to you</Title><label className="block text-sm">Debt status<select aria-label="Debt status" className="ml-2 min-h-[44px] rounded-xl border border-ink/15 bg-white px-3" value={status} onChange={e => {setBusy(true); setStatus(e.target.value as typeof status)} }><option value="outstanding">Outstanding</option><option value="settled">Settled</option><option value="all">All debts</option></select></label>
    {busy && <p role="status">Loading authoritative receivables…</p>}<Err e={error} /><Btn kind="outline" disabled={busy} onClick={() => void load()}>Refresh receivables</Btn>
    {!busy && !error && !rows.length && <Card>No debts in this view.</Card>}
    {rows.map(r => <Card key={r.receivable.receivable_id} className="space-y-2 text-sm"><div className="flex justify-between gap-2"><b>{r.receivable.debtor} owes</b><b>{fmt(r.outstanding_amount)}</b></div><p>Original {fmt(r.original_amount)} · cleared {fmt(r.cleared_amount)} · {r.status}</p><Badge b={r.provenance.original_debt} /><p className="break-all text-xs text-ink/60">{r.participant_id ? `Participant ${r.participant_id} · split ${r.split_id}` : 'Legacy unlinked debt; no participant identity is inferred.'}</p><Btn disabled={busy || Boolean(error)} onClick={() => setSelected(r)}>{r.status === 'settled' ? 'View repayment history' : 'Record repayment / history'}</Btn></Card>)}
    {cursor && <Btn disabled={busy} onClick={() => void load(cursor)}>Load more receivables</Btn>}
    {workflow && session && <ReceiptReview key={`${session}:${workflow}`} session={session} workflow={workflow} onClose={() => setWorkflow(null)} onDone={() => void load()} />}
    {selected && <Repayment key={selected.receivable.receivable_id} debt={selected} onClose={() => {setSelected(null); void load()} } />}
  </div>
}
