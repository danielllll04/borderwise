import { accountName } from './display'
import UI from './i18n-view'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeAgentCard, RiskPage } from '@/api/types'
import { Amount, Badge, Btn, Card, Details, Err, Warn } from './kit'
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
  return <Card className="space-y-4 text-sm"><b><UI text="Pending-plan forecast" /></b><Details><UI text="Each plan is checked separately against your current balance. Pending plans do not set money aside." /></Details>
    {!current && pagination?.status === 'restarted' && <p className="text-xs text-ink/50"><UI text="Showing the first page. Refresh for the latest assessments." /></p>}
    {!current && <p className="text-xs text-ink/50"><UI text="Saved snapshot · refresh for current figures" /></p>}
    {shown.status === 'unavailable' ? <Warn>{shown.reason} <UI text=" This is an unavailable read, not proof that there is no risk." /></Warn> : <>
      {!shown.items.length && <p><UI text="No assessments on this page. This page may skip earlier plans; refresh current assessments from the beginning before concluding there is no pending risk." /></p>}
      {shown.items.map(r => <div key={r.plan_id} className="space-y-3 border-t border-ink/5 pt-3"><b><UI text={r.state} /></b>{r.state === 'Cannot assess' && <Details label="About this forecast">{r.reason.message}</Details>}{r.quote && <Badge b={r.quote.badge} />}
        {r.preview?.projected_reserve_shortfall && <div><UI text="Forecast MYR shortfall" /><Amount v={r.preview.projected_reserve_shortfall} /></div>}{r.preview?.other_account_reserve_check?.projected_reserve_shortfall && <div><UI text="Forecast fee-account MYR shortfall" /><Amount v={r.preview.other_account_reserve_check.projected_reserve_shortfall} /></div>}
        {r.projected_deficits.map(d => <div key={d.account_id}><UI text="Forecast deficit · " /><UI text={accountName(d.account_id)} /><Amount v={d.deficit} /></div>)}</div>)}
      {shown.next_cursor && <Btn kind="outline" disabled={busy || !backend} onClick={() => void refresh(true)}><UI text="Load more current assessments" /></Btn>}
    </>}
    <Err e={error} />{Boolean(error) && <p><UI text="Could not refresh. Showing the last update; do not repeat a completed action." /></p>}
    <Btn kind="outline" disabled={busy || !backend} onClick={() => void refresh()}><UI text={busy ? 'Reading current risks…' : 'Refresh current assessments'} /></Btn>
  </Card>
}
