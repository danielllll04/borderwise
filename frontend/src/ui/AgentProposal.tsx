import UI from './i18n-view'
import { useEffect, useRef, useState } from 'react'
import { ApiError, type AgentBackendApi, type AgentFinancialPreview, type AgentProposalPreview, type FV, type PlanResponse } from '@/api/types'
import { Amount, Badge, Btn, Card, Err, Modal, Warn } from './kit'
import { saveAttempt, type ProposalState } from './agent-state'

export function AgentAssessment({ data: a }: {data: AgentFinancialPreview}) {
  const values: [string, FV | null][] = [['Funding balance at check', a.current_balance], ['Principal', a.principal], ['Total funding debit', a.total_debit], ['Amount received', a.amount_received], ['Projected funding balance', a.projected_balance]]
  const reserve = a.reserve_check.applicability === 'applicable' ? a.reserve_check : a.other_account_reserve_check
  return <Card className="space-y-3 text-sm"><b><UI text="Node financial preview" /></b>{values.map(([label, value]) => value && <div key={label} className="flex justify-between gap-3"><span><UI text={label} /></span><Amount v={value} /></div>)}
    {reserve?.applicability === 'applicable' && <><b><UI text="MYR reserve check" /></b>{([['Stated fixed expenses reserve', reserve.fixed_expense_reserve], ['Stated emergency reserve', reserve.emergency_reserve], ['Total stated reserve', reserve.total_reserve], ['Projected MYR balance', reserve.projected_balance], ['Projected MYR shortfall', reserve.projected_reserve_shortfall], ['Maximum safe total MYR debit', reserve.max_safe_total_debit]] as const).map(([label, value]) => value && <div key={label} className="flex justify-between gap-3"><span><UI text={label} /></span><Amount v={value} /></div>)}</>}
    {a.requires_reserve_acknowledgement && <Warn><UI text="This preview breaches the stated reserve. Saving requires explicit acknowledgement after a fresh preview. It cannot override insufficient funds." /></Warn>}
    <p className="text-xs text-ink/55"><UI text="Historical until re-previewed. No funds reserved or financial activity posted." /></p>
  </Card>
}
export default function AgentProposal({api, session, id, state, update, onClose, onDone}: {
  api: AgentBackendApi; session: string; id: string; state: ProposalState
  update: (next: ProposalState) => void; onClose: () => void; onDone: (plan: PlanResponse) => void
}) {
  const [review, setReview] = useState<AgentProposalPreview | null>(null), [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [refresh, setRefresh] = useState(0)
  const posting = useRef(false)
  useEffect(() => {
    let active = true
    api.preview(session, id).then(value => { if (active) { setReview(value); setError(null) } }).catch(e => { if (active) setError(e) })
    return () => { active = false }
  }, [api, session, id, refresh])
  const save = async () => {
    if (posting.current || state.saved || !state.attempt && (!review || review.preview.requires_reserve_acknowledgement && !ack)) return
    posting.current = true; setBusy(true); setError(null)
    let saved: PlanResponse | undefined
    try {
      const attempt = state.attempt ?? saveAttempt(review!)
      update({attempt}) // Persist exact token/ack before the first request.
      saved = await api.save(session, id, {frontend_action: 'save_pending_plan', idempotency_key: `agent-frontend-save:${id}`, ...attempt})
    } catch (e) {
      setError(e)
      if (e instanceof ApiError && ['PROPOSAL_STALE', 'STALE_RESERVE_CHECK', 'RESERVE_ACKNOWLEDGEMENT_REQUIRED', 'PROPOSAL_PREVIEW_REQUIRED'].includes(e.code)) {
        try { update({}) } catch (storageError) { setError(storageError) }
        setReview(null); setAck(false)
      }
    } finally { posting.current = false; setBusy(false) }
    // A successful Save is final even if browser state persistence or optional reads fail.
    if (saved) onDone(saved)
  }
  return <Modal title="Review trusted Agent proposal" onClose={() => { if (!posting.current) onClose() }}>
    {state.attempt && <Warn><UI text="A Save was submitted. Retry its original token/acknowledgement; refreshing history does not create a new Save intent." /></Warn>}
    {review ? <><b>{review.selection.quote.provider}</b><Badge b={review.selection.quote.badge} /><AgentAssessment data={review.preview} />{review.preview.requires_reserve_acknowledgement && !state.attempt && <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} /><UI text="I acknowledge this current Node reserve warning." /></label>}</> : !error && <p role="status"><UI text="Loading current proposal preview…" /></p>}
    <Err e={error} />
    {!review && Boolean(error) && <Btn disabled={busy} onClick={() => { setError(null); setRefresh(n => n + 1) }}><UI text="Retry preview" /></Btn>}
    <Btn className="mt-3 w-full" disabled={busy || Boolean(state.saved) || !state.attempt && (!review || review.preview.requires_reserve_acknowledgement && !ack)} onClick={() => void save()}><UI text={busy ? 'Saving…' : state.attempt ? 'Retry original Save' : 'Save pending plan'} /></Btn>
    <Btn kind="outline" className="mt-3 w-full" disabled={busy} onClick={onClose}><UI text="Close review" /></Btn>
    <p className="mt-2 text-xs text-ink/55"><UI text="Save creates a pending plan only. Chat and preview cannot debit accounts." /></p>
  </Modal>
}
