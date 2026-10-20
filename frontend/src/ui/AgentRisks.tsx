import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeAgentCard, RiskPage } from '@/api/types'
import { Amount, Badge, Btn, Card, Err, Warn, stamp } from './kit'
import { useApp } from './ctx'

type RiskData = Extract<NodeAgentCard, {type: 'pending_plan_risk'}>['data']
export default function AgentRisks({data, pagination}: {data: RiskData; pagination?: Extract<NodeAgentCard, {type: 'pending_plan_risk'}>['pagination']}) {
  const {api, rev} = useApp(), backend = api.homeBackend
  const [current, setCurrent] = useState<RiskPage | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false)
  const inFlight = useRef(false), shown = current ?? data
  const refresh = useCallback(async (more = false) => {
    if (!backend || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const next = await backend.assessments(more && shown.status === 'available' ? shown.next_cursor ?? undefined : undefined)
      setCurrent(more && shown.status === 'available' ? {...next, items: [...new Map([...shown.items, ...next.items].map(item => [item.plan_id, item])).values()]} : next)
    } catch (e) { setError(e) }
    finally { inFlight.current = false; setBusy(false) }
  }, [backend, shown])
  const previousRevision = useRef(rev)
  useEffect(() => { if (previousRevision.current !== rev) { previousRevision.current = rev; void refresh() } }, [rev, refresh])
  return <Card className="space-y-3 text-sm"><b>Pending-plan forecasts — separate from actual budget</b><p>{shown.notice}</p>
    {!current && pagination?.status === 'restarted' && <Warn>Pagination could not be continued safely. Node restarted from the first page; the figures below are service results. ({pagination.reason})</Warn>}
    <p className="text-xs text-ink/55">{current ? 'Current Node read' : 'Historical model-selected assessment page'} · {stamp(shown.assessed_at)}</p>
    {shown.status === 'unavailable' ? <Warn>{shown.reason} This is an unavailable read, not proof that there is no risk.</Warn> : <>
      {!shown.items.length && <p>No assessments on this page. This page may skip earlier plans; refresh current assessments from the beginning before concluding there is no pending risk.</p>}
      {shown.items.map(r => <div key={r.plan_id} className="space-y-2 border-t border-ink/10 pt-2"><b>{r.state}</b><p>{r.reason.message}</p><p className="break-all text-xs">Plan {r.plan_id} · {stamp(r.assessed_at)}</p>{r.quote && <Badge b={r.quote.badge} />}
        {r.preview?.projected_reserve_shortfall && <div>Forecast MYR shortfall<Amount v={r.preview.projected_reserve_shortfall} /></div>}{r.preview?.other_account_reserve_check?.projected_reserve_shortfall && <div>Forecast fee-account MYR shortfall<Amount v={r.preview.other_account_reserve_check.projected_reserve_shortfall} /></div>}
        {r.projected_deficits.map(d => <div key={d.account_id}>Forecast deficit · {d.account_id}<Amount v={d.deficit} /></div>)}</div>)}
      {shown.next_cursor && <Btn kind="outline" disabled={busy || !backend} onClick={() => void refresh(true)}>Load more current assessments</Btn>}
    </>}
    <Err e={error} />{Boolean(error) && <p>Read failed; any values above are the previous snapshot. No financial action should be retried.</p>}
    <Btn kind="outline" disabled={busy || !backend} onClick={() => void refresh()}>{busy ? 'Reading current risks…' : 'Refresh current assessments'}</Btn>
  </Card>
}
