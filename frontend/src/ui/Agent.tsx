import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Send } from 'lucide-react'
import { ApiError, type AgentHistoryItem, type AgentMessageInput, type AgentMessageResult, type AgentSession, type BalanceItem, type NodeAgentResponse, type PlanResponse } from '@/api/types'
import { uid } from '@/api/api'
import { Btn, Card, Err, Warn, stamp } from './kit'
import { useApp } from './ctx'
import AgentCards from './AgentCards'
import AgentProposal from './AgentProposal'
import PlanCompletion from './PlanCompletion'
import { initialSession, readState, resumeState, writeState, type AgentLocalState, type ProposalState } from './agent-state'
import ReceiptReview, { RecordedBill } from './ReceiptReview'
import type { AllocationReviewCard, ReceiptEvent } from '@/api/split-types'

const STARTERS = [
  ['Cheapest ₩100,000 cash', 'I need KRW 100000 cash from an ATM, funded by MYR Funding. Find the lowest total cost.'],
  ['Review pending-plan risks', 'Read current pending-plan risks and reserve assessments.'],
  ['Check budget & reserves', 'Read my current balances and budget reserves.'],
] as const
function messageResult(value: unknown): value is AgentMessageResult {
  return Boolean(value && typeof value === 'object' && 'turn_id' in value && typeof value.turn_id === 'string' && 'session_id' in value && typeof value.session_id === 'string' && 'response' in value && value.response && typeof value.response === 'object' && 'cards' in value.response && Array.isArray(value.response.cards))
}
function MessageResponse({response, children}: {response: NodeAgentResponse; children: ReactNode}) {
  return <div className="space-y-3"><div className="mr-6 rounded-2xl rounded-bl-md bg-white p-3 text-sm shadow-sm ring-1 ring-ink/5"><p>{response.explanation}</p><p className="mt-2 text-xs text-ink/55">{response.provider.simulated ? 'Scripted demo provider — no model call' : `Model provider: ${response.provider.name}`} · {response.status}</p>{response.error_code && <p role="alert" className="mt-2 text-red-700">{response.error_code}{response.error_code === 'AGENT_RATE_LIMITED' ? ' — wait before requesting a new provider attempt.' : ''}</p>}</div>{children}</div>
}
export default function Agent() {
  const {api, bump} = useApp(), backend = api.agentBackend
  const [local, setLocal] = useState<AgentLocalState>(() => readState(backend?.storageNamespace ?? 'agent-unavailable'))
  const localRef = useRef(local), busyRef = useRef(false), mounted = useRef(true)
  const [session, setSession] = useState<AgentSession | null>(null), [resume, setResume] = useState(local.session)
  const [rows, setRows] = useState<AgentHistoryItem[]>([]), [cursor, setCursor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(Boolean(backend)), [error, setError] = useState<unknown>(null), [historyError, setHistoryError] = useState<unknown>(null)
  const [text, setText] = useState(''), [notice, setNotice] = useState(''), [retryProvider, setRetryProvider] = useState<AgentMessageInput | null>(null)
  const [delivered, setDelivered] = useState<AgentMessageResult | null>(null), [proposal, setProposal] = useState<string | null>(null)
  const [completion, setCompletion] = useState<{plan: PlanResponse; accounts: BalanceItem[]} | null>(null)
  const [reload, setReload] = useState(0)
  const [receipt, setReceipt] = useState<{draft?: string; proposal?: string; workflow?: string; initialAllocation?: AllocationReviewCard} | null>(null)
  const [receiptEvents, setReceiptEvents] = useState<ReceiptEvent[]>([]), [receiptCursor, setReceiptCursor] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const persist = (value: AgentLocalState) => {
    if (!backend) throw new Error('Agent backend unavailable.')
    writeState(backend.storageNamespace, value); localRef.current = value; setLocal(value)
  }
  const updateProposal = (id: string, next: ProposalState) => persist({...localRef.current, proposals: {...localRef.current.proposals, [id]: next}})
  const readHistory = useCallback(async (id: string, start?: number) => {
    if (!backend) return
    const items: AgentHistoryItem[] = []
    let events: ReceiptEvent[] = [], receiptNext: string | undefined
    let next = start
    for (let page = 0; page < 50; page++) {
      const result = await backend.history(id, next)
      if (page === 0 && !start) { events = result.receipt_events ?? []; receiptNext = result.next_receipt_cursor ?? undefined }
      items.push(...result.items); next = result.next_cursor ?? undefined
      if (!next) break
    }
    if (!mounted.current || id !== localRef.current.session) return
    setRows(old => [...new Map([...(start ? old : []), ...items].map(item => [item.message_id, item])).values()].sort((a, b) => a.message_id - b.message_id))
    setCursor(next ?? null); setHistoryError(null); if (!next) setDelivered(null)
    if (!start) { setReceiptEvents(events); setReceiptCursor(receiptNext ?? null) }
  }, [backend])
  useEffect(() => {
    mounted.current = true
    let active = true
    if (!backend) return
    initialSession(backend).then(async id => {
      if (!active) return
      const state = readState(backend.storageNamespace); localRef.current = state; setLocal(state); setResume(id)
      const current = await backend.session(id)
      if (!active) return
      setSession(current)
      try { await readHistory(id) } catch (e) { if (active) setHistoryError(e) }
    }).catch(e => { if (active) setError(e) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; mounted.current = false }
  }, [backend, readHistory, reload])
  useEffect(() => { end.current?.scrollIntoView({behavior: 'smooth'}) }, [rows, delivered, busy])
  const exclusive = async (work: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(null)
    try { await work() } catch (e) { setError(e) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  const refreshHistory = () => exclusive(async () => {
    try { await readHistory(localRef.current.session) } catch (e) { setHistoryError(e) }
  })
  const send = (message: string, snapshot?: string, original?: AgentMessageInput, receiptRef?: AgentMessageInput['receipt_draft']) => exclusive(async () => {
    if (!backend || !session || !message.trim()) return
    if (!original && (localRef.current.pending || historyError)) throw new Error('Recover the pending message/history read before sending a new message.')
    let selectedReceipt = original?.receipt_draft ?? receiptRef ?? (!snapshot ? localRef.current.receipt : undefined)
    if (!original && selectedReceipt && api.splitBackend) { const latest = await api.splitBackend.review(session.session_id, selectedReceipt.draft_id); selectedReceipt = {draft_id: latest.draft_id, version: latest.version} }
    const input = original ?? {message: message.trim(), idempotency_key: `agent-message:${uid()}`, ...(snapshot ? {snapshot_id: snapshot} : {}), ...(selectedReceipt ? {receipt_draft: selectedReceipt} : {})}
    persist({...localRef.current, pending: input}); setText(''); setNotice(''); setRetryProvider(null)
    let result: AgentMessageResult
    try { result = await backend.message(session.session_id, input) }
    catch (e) {
      if (e instanceof ApiError && messageResult(e.details)) result = e.details
      else {
        if (e instanceof ApiError && (e.status === 400 || e.status === 422 || ['AGENT_SESSION_NOT_FOUND', 'QUOTE_SNAPSHOT_NOT_FOUND'].includes(e.code))) {
          persist({...localRef.current, pending: undefined}); setText(input.message)
        }
        throw e
      }
    }
    setDelivered(result)
    const receiptCard = result.response.cards.filter(c => c.type === 'receipt_review' || c.type === 'allocation_review').at(-1)
    try { persist({...localRef.current, pending: undefined, receipt: receiptCard ? {draft_id: receiptCard.draft_id, version: receiptCard.version} : selectedReceipt}) } catch { setNotice('Message processed. Browser retry-state cleanup failed; identical-key recovery remains safe.') }
    if (result.response.status === 'provider_error' || result.response.status === 'unavailable') setRetryProvider(input)
    try { await readHistory(session.session_id) }
    catch (e) { setHistoryError(e); setNotice('Message processed. History refresh is unavailable; retry the read, not a new message.') }
  })
  const switchSession = (create: boolean) => exclusive(async () => {
    if (!backend) return
    const next = create ? await backend.create() : await backend.session(resume.trim())
    persist(resumeState(backend.storageNamespace, next.session_id))
    setRows([]); setReceiptEvents([]); setReceiptCursor(null); setReceipt(null); setSession(next); setResume(next.session_id); setNotice(''); setDelivered(null); setRetryProvider(null)
    try { await readHistory(next.session_id) } catch (e) { setHistoryError(e) }
  })
  const saveDone = (id: string, plan: PlanResponse) => {
    const next = {...localRef.current, proposals: {...localRef.current.proposals, [id]: {saved: {plan: {plan_id: plan.plan.plan_id}}}}}
    localRef.current = next; setLocal(next); setProposal(null); setNotice('Pending plan saved successfully. Balances are unchanged; Home reads refresh separately.'); bump()
    try { writeState(backend!.storageNamespace, next) } catch { setNotice('Pending plan saved successfully. Browser state persistence failed; recover with the same proposal/key if needed. Do not start another Save.') }
    void readHistory(next.session).catch(e => setHistoryError(e))
  }
  const openCompletion = (id: string) => exclusive(async () => {
    if (!api.homeBackend) throw new Error('Home completion service unavailable.')
    const plan = await api.homeBackend.readPlan(id)
    if (plan.plan.status !== 'pending') { persist({...localRef.current, resolved: {...localRef.current.resolved, [id]: plan.plan.status}}); bump(); setNotice(`Node reports this plan ${plan.plan.status}; no further posting is needed.`); return }
    const home = await api.homeBackend.summary()
    if (!['exchange', 'atm_withdrawal'].includes(plan.plan.quote.objective)) throw new Error('Completion is unsupported for this plan objective.')
    if (!home.balances.some(account => account.account_id === plan.plan.quote.funding_source) || !home.balances.some(account => account.account_id === plan.context.destination_account)) throw new Error('An owned source/destination account is unavailable. Refresh Home before reviewing completion.')
    setCompletion({plan, accounts: home.balances})
  })
  const allCards = rows.flatMap(row => row.response?.cards ?? [])
  if (delivered) allCards.push(...delivered.response.cards)
  const snapshots = new Map(allCards.flatMap(card => card.type === 'proposed_plan' ? [[card.snapshot_id, card.proposal_id] as const] : []))
  const disabled = busy || loading || Boolean(historyError) || Boolean(local.pending)
  const renderResponse = (response: NodeAgentResponse) => <MessageResponse response={response}>
    {!!response.clarification.length && <Card className="space-y-2 text-sm"><b>Details needed</b>{response.clarification.map(item => <div key={item.field}><p>{item.question}</p>{item.field === 'card_network' && <div className="mt-2 flex flex-wrap gap-2">{['Visa', 'Mastercard', 'UnionPay', 'Unknown'].map(value => <Btn key={value} kind="outline" disabled={disabled} onClick={() => void send(value)}>{value}</Btn>)}</div>}</div>)}</Card>}
    <AgentCards cards={response.cards} proposals={local.proposals} snapshots={snapshots} resolved={local.resolved} disabled={disabled} onProposal={setProposal} onSnapshot={id => void send('Preview the selected option.', id)} onComplete={id => void openCompletion(id)} onReceipt={(draft, proposal, initialAllocation) => setReceipt({draft, proposal, initialAllocation})} />
  </MessageResponse>
  if (!backend) return <div className="p-4"><Warn>The connected Agent requires the Node backend in live mode. No scripted replies or financial writes are available in mock mode.</Warn></div>
  return <div className="flex h-full flex-col">
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <Card className="space-y-2 text-xs"><b>BorderWise Agent</b><p>Chat reads and previews only. Save and completion require explicit buttons. Quotes remain Simulated even when the model is real.</p>{session && <p>{session.agent.provider}{session.agent.simulated ? ' · Scripted demo' : ' · Server-side model'} · {session.agent.available ? 'Available' : 'Provider unavailable'}</p>}
        <label className="block">Session ID<input aria-label="Agent session ID" value={resume} disabled={busy || loading} onChange={e => setResume(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 px-2" /></label>
        <div className="flex flex-wrap gap-2"><Btn kind="outline" disabled={busy || loading || !resume.trim()} onClick={() => void switchSession(false)}>Resume session</Btn><Btn kind="outline" disabled={busy || loading} onClick={() => void switchSession(true)}>New conversation</Btn><Btn kind="outline" disabled={busy || loading || !session} onClick={() => void refreshHistory()}>Reload history</Btn></div>
        <Btn kind="outline" disabled={disabled || !session || !api.splitBackend} onClick={() => setReceipt({workflow: 'agent-upload'})}>Upload / resume receipt</Btn>
      </Card>
      {loading && <p role="status">Loading session and conversation…</p>}
      <Err e={error} />{Boolean(error) && !session && <Btn onClick={() => { setLoading(true); setError(null); setReload(n => n + 1) }}>Retry session connection</Btn>}
      {notice && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {Object.entries(local.proposals).filter(([, state]) => state.attempt && !state.saved).map(([id]) => <Card key={id} className="space-y-2 text-sm"><b>Submitted Save needs recovery</b><p className="break-all">Trusted proposal {id}. Retry the original Save, even if history is unavailable.</p><Btn disabled={busy || loading || !session} onClick={() => setProposal(id)}>Recover submitted Save</Btn></Card>)}
      {Boolean(historyError) && <><Warn>History read unavailable. Previous cards are historical snapshots; recover the read before starting a new action.</Warn><Err e={historyError} /><Btn disabled={busy} onClick={() => void refreshHistory()}>Retry history read</Btn></>}
      {!loading && !rows.length && !historyError && session && <p className="text-sm text-ink/60">Ask about balances, reserves, pending-plan risks or supported currency/ATM options.</p>}
      {rows.map(row => <div key={row.message_id} className="space-y-2"><p className="text-[10px] text-ink/45">{stamp(row.created_at)} · {row.role === 'assistant' ? 'Historical service cards; re-preview before acting' : 'You'}</p>{row.role === 'user' ? <div className="ml-10 rounded-2xl rounded-br-md bg-cobalt p-3 text-sm text-white">{row.content}</div> : row.response ? renderResponse(row.response) : <Card>{row.content}</Card>}</div>)}
      {delivered && <div>{renderResponse(delivered.response)}</div>}
      {!!receiptEvents.length && <div className="space-y-3"><p className="text-xs font-bold">Committed receipt history · Node</p>{receiptEvents.map(event => <div key={event.event_id}><p className="text-xs">{stamp(event.created_at)}</p><RecordedBill data={event.card.data} /></div>)}</div>}
      {receiptCursor && <Btn disabled={busy} onClick={() => void exclusive(async () => { const page = await backend.history(localRef.current.session, undefined, receiptCursor); setReceiptEvents(old => [...new Map([...old, ...page.receipt_events ?? []].map(e => [e.event_id, e])).values()]); setReceiptCursor(page.next_receipt_cursor ?? null) })}>Load more recorded receipts</Btn>}
      {cursor && <Btn disabled={busy} onClick={() => void exclusive(async () => { try { await readHistory(local.session, cursor) } catch (e) { setHistoryError(e) } })}>Load more history</Btn>}
      {local.pending && !busy && <Card className="space-y-2 text-sm"><b>Message outcome needs recovery</b><p>The exact submitted message/key is retained. Retrying cannot create another turn for that key.</p><Btn disabled={!session} onClick={() => void send(local.pending!.message, undefined, local.pending)}>Retry original message</Btn></Card>}
      {retryProvider && !local.pending && <Btn kind="outline" disabled={disabled} onClick={() => void send(retryProvider.message, retryProvider.snapshot_id, undefined, retryProvider.receipt_draft)}>Request provider again (new turn)</Btn>}
      {busy && <p role="status" className="text-xs text-ink/55">Waiting for backend…</p>}<div ref={end} />
    </div>
    <div className="border-t border-ink/10 bg-canvas p-3">
      {local.receipt && <Card className="mb-2 text-xs"><p className="break-all">Selected receipt {local.receipt.draft_id} · version {local.receipt.version}. Messages review this receipt; chat never confirms it.</p><Btn kind="ghost" disabled={disabled} onClick={() => { try { persist({...localRef.current, receipt: undefined}) } catch (e) { setError(e) } }}>Clear receipt context</Btn></Card>}
      <div className="mb-2 flex gap-2 overflow-x-auto">{STARTERS.map(([label, message]) => <button key={label} disabled={disabled || !session} onClick={() => { try { persist({...localRef.current, receipt: undefined}); void send(message) } catch (e) { setError(e) } }} className="min-h-[44px] shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-cobalt ring-1 ring-cobalt/30 disabled:opacity-40">{label}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); if (!disabled && text.trim()) void send(text) }} className="flex gap-2"><input aria-label="Agent message" maxLength={2000} value={text} disabled={disabled || !session} onChange={e => setText(e.target.value)} placeholder="Type a message…" className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 text-sm" /><button aria-label="Send" disabled={disabled || !session || !text.trim()} className="grid h-11 w-11 place-items-center rounded-xl bg-coral text-white disabled:opacity-40"><Send size={18} /></button></form>
    </div>
    {proposal && session && <AgentProposal api={backend} session={session.session_id} id={proposal} state={local.proposals[proposal] ?? {}} update={next => updateProposal(proposal, next)} onClose={() => setProposal(null)} onDone={plan => saveDone(proposal, plan)} />}
    {completion && api.homeBackend && <PlanCompletion key={completion.plan.plan.plan_id} api={api.homeBackend} plan={completion.plan} accounts={completion.accounts} onClose={() => { setCompletion(null); bump() }} onDone={message => {
      const next = {...localRef.current, resolved: {...localRef.current.resolved, [completion.plan.plan.plan_id]: 'resolved; read Home for current status'}}
      localRef.current = next; setLocal(next); setCompletion(null); setNotice(message); bump()
      try { writeState(backend.storageNamespace, next) } catch { /* Known posting success remains final. */ }
      void readHistory(next.session).catch(e => setHistoryError(e))
    }} />}
    {receipt && session && <ReceiptReview key={`${session.session_id}:${receipt.draft ?? receipt.workflow}`} session={session.session_id} {...receipt} onClose={() => setReceipt(null)} onAgentReview={ref => { setReceipt(null); void send('Read the selected receipt review and identify anything requiring user review.', undefined, undefined, ref) }} onDone={() => { setNotice('Shared bill recorded by Node. Home, ledger and risk reads refresh separately.'); void readHistory(session.session_id).catch(e => setHistoryError(e)) }} />}
  </div>
}
