import { accountName } from './display'
import UI from './i18n-view'
import type { AgentPlanRead, NodeAgentCard } from '@/api/types'
import { Amount, Badge, Btn, Card, Details, Warn, fmt, stamp } from './kit'
import { ComparisonCard } from './shared'
import HomeSummary from './HomeSummary'
import { AgentAssessment } from './AgentProposal'
import type { ProposalState } from './agent-state'
import AgentRisks from './AgentRisks'
import { RecordedBill } from './ReceiptReview'
import type { AllocationReviewCard } from '@/api/split-types'

export default function AgentCards({cards, proposals, snapshots, resolved, disabled, onProposal, onSnapshot, onComplete, onReceipt}: {
  cards: NodeAgentCard[]; proposals: Record<string, ProposalState>; snapshots: Map<string, string>; resolved: Record<string, string>; disabled: boolean
  onProposal: (id: string) => void; onSnapshot: (id: string) => void; onComplete: (id: string) => void
  onReceipt: (draft: string, proposal?: string, initialAllocation?: AllocationReviewCard) => void
}) {
  const proposalButton = (id: string) => {
    const saved = proposals[id]?.saved
    return saved ? <div className="space-y-2"><p className="text-sm font-medium text-emerald-800"><UI text="Pending plan saved" /></p>{!resolved[saved.plan.plan_id] && <Btn disabled={disabled} onClick={() => onComplete(saved.plan.plan_id)}><UI text="Review completion actuals" /></Btn>}{resolved[saved.plan.plan_id] && <p className="text-xs text-ink/55"><UI text="This plan has been updated. See Home for its current status." /></p>}</div>
      : <Btn disabled={disabled} onClick={() => onProposal(id)}><UI text={proposals[id]?.attempt ? 'Recover submitted Save' : 'Preview trusted proposal'} /></Btn>
  }
  const planCard = (p: AgentPlanRead) => <Card key={p.plan.plan_id} className="space-y-2 text-sm"><b>{p.plan.quote.provider}</b><p>{resolved[p.plan.plan_id] ?? p.plan.status} · <UI text={p.plan.quote.objective} /></p><p><UI text="Saved quote: " />{fmt(p.plan.quote.total_debit)} → {fmt(p.plan.quote.net_received)}</p><Badge b={p.plan.quote.badge} />
    {p.plan.status === 'pending' && !resolved[p.plan.plan_id] && ['exchange', 'atm_withdrawal'].includes(p.plan.quote.objective) && <Btn disabled={disabled} onClick={() => onComplete(p.plan.plan_id)}><UI text="Review completion actuals" /></Btn>}
    <time className="text-[11px] text-ink/45" dateTime={p.updated_at}>{stamp(p.updated_at)}</time></Card>
  return <div className="space-y-3">{cards.map((card, index) => {
    switch (card.type) {
      case 'balance_summary': return <div key={index} className="space-y-2"><HomeSummary h={card.data} /><Card className="space-y-2 text-sm"><b><UI text="Current MYR budget: " /><UI text={card.data.budget.status} /></b><Amount v={card.data.budget.total_reserve} /><p><UI text="Maximum safe MYR debit" /></p><Amount v={card.data.budget.max_safe_total_debit} /><p><UI text="Current MYR shortfall" /></p><Amount v={card.data.budget.reserve_shortfall} /><p><UI text="KRW balances are shown separately." /></p></Card></div>
      case 'quote_comparison': return <div key={index} className="space-y-3"><Details label="About these options"><UI text="Options are ranked by the comparison service. Prices are Simulated; check with the provider before use." /></Details>{card.options.map(o => {
        const id = snapshots.get(o.snapshot_id), saved = id ? proposals[id]?.saved : undefined
        return <div key={o.snapshot_id} className="space-y-2"><ComparisonCard sel={o.selection} rank={o.rank} primary={o.selection.quote.mode === 'fixed_myr_budget' ? 'net' : 'debit'} blocked={o.blocking_error ?? (disabled ? 'Action in progress or history unavailable' : saved ? 'Already saved' : null)} saveLabel={id ? 'Review trusted proposal' : 'Request selected-option preview'} onSave={saved ? undefined : () => id ? onProposal(id) : onSnapshot(o.snapshot_id)} />
          {o.compatibility && <p className="px-1 text-xs text-ink/50"><UI text={o.compatibility.status === 'unknown' ? 'Compatibility unknown — check with your card provider.' : o.compatibility.status === 'compatible' ? 'Network supported in sample data only.' : 'Network not supported in sample data.'} /></p>}
          {o.atm_info && <p className="px-1 text-xs text-ink/50">{o.atm_info.location_name}</p>}{saved && <p className="text-xs text-emerald-800"><UI text="Pending plan saved" /></p>}</div>
      })}</div>
      case 'proposed_plan': return <div key={index} className="space-y-3">{card.stale && <Warn><UI text="Refresh this preview before saving." /></Warn>}<AgentAssessment data={card.preview} />{proposalButton(card.proposal_id)}</div>
      case 'reserve_warning': return <div key={index} className="space-y-3"><Warn><UI text="This option may use your reserves. Review the latest preview before saving." /></Warn><Details label="Reserve impact"><AgentAssessment data={card.data} /></Details>{proposalButton(card.proposal_id)}</div>
      case 'pending_plan_risk': return <AgentRisks key={index} data={card.data} pagination={card.pagination} />
      case 'plan_list': return <div key={index} className="space-y-2">{!card.data.items.length && <Card><UI text="No plans in this read." /></Card>}{card.data.items.map(planCard)}{card.data.next_cursor && <p className="text-xs"><UI text="More plans are available on Home." /></p>}</div>
      case 'plan_detail': return <div key={index}>{planCard(card.data)}</div>
      case 'ledger_history': return <Card key={index} className="space-y-4 text-sm">{!card.data.items.length && <p><UI text="No ledger entries in this read." /></p>}{card.data.items.map(item => <div key={item.entry.entry_id} className="space-y-2"><b><UI text={item.entry.type} /></b>{item.entry.lines.map((line, i) => <p key={i} className="flex justify-between gap-3"><span className="text-ink/55"><UI text={accountName(line.account)} /></span><span className="tabular-nums">{fmt(line.Money, true)}</span></p>)}<div className="flex items-center justify-between gap-2"><Badge b={item.entry.badge} /><time className="text-[11px] text-ink/45" dateTime={item.entry.badge.timestamp}>{stamp(item.entry.badge.timestamp)}</time></div></div>)}{card.data.next_cursor && <p><UI text="More ledger entries are available on Home." /></p>}</Card>
      case 'existing_balance_alternative': return <Card key={index} className="space-y-3 text-sm"><b><UI text={accountName(card.account_id)} /></b><Amount v={card.balance} /><p className="text-xs text-ink/55"><UI text="This balance already covers the requested amount." /></p></Card>
      case 'comparison_unavailable': return <Warn key={index}>{card.reason} <UI text=" Change the request or retry when the service is available; no fixture fallback is used." /></Warn>
      case 'receipt_review': return <Card key={index} className="space-y-3 text-sm"><b><UI text="Receipt review" /></b><p>{card.reviewed.merchant} · {fmt(card.reviewed.total)}</p><Badge b={card.extracted.badge} /><p className="text-xs text-ink/55"><UI text="Review and correct the receipt before sharing the bill." /></p><Btn disabled={disabled} onClick={() => onReceipt(card.draft_id)}><UI text="Open receipt review" /></Btn></Card>
      case 'allocation_review': return <Card key={index} className="space-y-3 text-sm"><b><UI text="Review shares" /></b>{card.clarification.map(q => <p key={q.field}>{q.question}</p>)}{card.allocation && <><p><UI text="Total " />{fmt(card.allocation.total)} <UI text=" · payer " />{fmt(card.allocation.payer_share)}</p>{card.allocation.debtor_shares.map(s => <p key={s.participant_id} className="flex justify-between gap-3"><span>{card.participants.find(p => p.participant_id === s.participant_id)?.display_name ?? '—'}</span><span className="tabular-nums">{fmt(s.share)}</span></p>)}<Badge b={card.allocation.badge} /></>}<Btn disabled={disabled} onClick={() => onReceipt(card.draft_id, card.proposal_id ?? undefined, card)}><UI text="Review current allocation" /></Btn></Card>
      case 'shared_expense_recorded': return <RecordedBill key={card.proposal_id} data={card.data} />
      case 'receipt_workflow_unavailable': return <Warn key={index}>{card.code}: {card.reason} <UI text=" Retry receipt review when the service recovers; no financial posting occurred." /></Warn>
      default: return <Card key={index} className="text-sm"><UI text="Unsupported card. No financial action was taken. Use a supported explicit review workflow." /></Card>
    }
  })}</div>
}
