import UI from './i18n-view'
import type { AgentPlanRead, NodeAgentCard } from '@/api/types'
import { Amount, Badge, Btn, Card, Warn, fmt, stamp } from './kit'
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
    return saved ? <div className="space-y-2"><p className="text-sm font-semibold text-emerald-800"><UI text="Saved pending plan · " />{saved.plan.plan_id}</p>{!resolved[saved.plan.plan_id] && <Btn disabled={disabled} onClick={() => onComplete(saved.plan.plan_id)}><UI text="Review completion actuals" /></Btn>}{resolved[saved.plan.plan_id] && <p><UI text="Node reports " />{resolved[saved.plan.plan_id]}.</p>}</div>
      : <Btn disabled={disabled} onClick={() => onProposal(id)}><UI text={proposals[id]?.attempt ? 'Recover submitted Save' : 'Preview trusted proposal'} /></Btn>
  }
  const planCard = (p: AgentPlanRead) => <Card key={p.plan.plan_id} className="space-y-2 text-sm"><b>{p.plan.quote.provider}</b><p>{resolved[p.plan.plan_id] ?? p.plan.status} · <UI text={p.plan.quote.objective} /></p><p><UI text="Saved quote: " />{fmt(p.plan.quote.total_debit)} → {fmt(p.plan.quote.net_received)}</p><Badge b={p.plan.quote.badge} />
    {p.plan.status === 'pending' && !resolved[p.plan.plan_id] && ['exchange', 'atm_withdrawal'].includes(p.plan.quote.objective) && <Btn disabled={disabled} onClick={() => onComplete(p.plan.plan_id)}><UI text="Review completion actuals" /></Btn>}
    <p className="break-all text-[10px] text-ink/55"><UI text="Plan " />{p.plan.plan_id} <UI text=" · snapshot " />{stamp(p.updated_at)}</p></Card>
  return <div className="space-y-3">{cards.map((card, index) => {
    switch (card.type) {
      case 'balance_summary': return <div key={index} className="space-y-2"><HomeSummary h={card.data} /><Card className="space-y-2 text-sm"><b><UI text="Actual recorded MYR budget: " /><UI text={card.data.budget.status} /></b><Amount v={card.data.budget.total_reserve} /><p><UI text="Maximum safe total MYR debit (Node)" /></p><Amount v={card.data.budget.max_safe_total_debit} /><p><UI text="Current MYR shortfall" /></p><Amount v={card.data.budget.reserve_shortfall} /><p><UI text="KRW balances are separate; this is not a forecast." /></p></Card></div>
      case 'quote_comparison': return <div key={index} className="space-y-2"><p className="text-xs text-ink/60">{card.ranking} <UI text=" · Seeded quotes remain Simulated." /></p>{card.options.map(o => {
        const id = snapshots.get(o.snapshot_id), saved = id ? proposals[id]?.saved : undefined
        return <div key={o.snapshot_id} className="space-y-2"><ComparisonCard sel={o.selection} rank={o.rank} primary={o.selection.quote.mode === 'fixed_myr_budget' ? 'net' : 'debit'} blocked={o.blocking_error ?? (disabled ? 'Action in progress or history unavailable' : saved ? 'Already saved' : null)} saveLabel={id ? 'Review trusted proposal' : 'Request selected-option preview'} onSave={saved ? undefined : () => id ? onProposal(id) : onSnapshot(o.snapshot_id)} />
          {o.compatibility && <p className="text-xs text-ink/60"><UI text={o.compatibility.status === 'unknown' ? `Compatibility unknown: ${o.compatibility.reason}` : `${o.compatibility.card_network}: ${o.compatibility.status} in seeded data only. ${o.compatibility.evidence.source}`} /></p>}
          {o.atm_info && <p className="text-xs text-ink/55">{o.atm_info.location_name}</p>}{saved && <p className="text-xs text-emerald-800"><UI text="Saved plan " />{saved.plan.plan_id}<UI text="; no second Save is offered." /></p>}</div>
      })}</div>
      case 'proposed_plan': return <div key={index} className="space-y-2"><p className="text-sm font-bold"><UI text="Trusted proposal " />{card.proposal_id}</p>{card.stale && <Warn><UI text="Backend marks this historical proposal stale. A current preview is required." /></Warn>}<AgentAssessment data={card.preview} />{proposalButton(card.proposal_id)}</div>
      case 'reserve_warning': return <div key={index} className="space-y-2"><Warn><UI text="Backend reserve warning (snapshot). Preview current values before Save." /></Warn><AgentAssessment data={card.data} />{proposalButton(card.proposal_id)}</div>
      case 'pending_plan_risk': return <AgentRisks key={index} data={card.data} pagination={card.pagination} />
      case 'plan_list': return <div key={index} className="space-y-2">{!card.data.items.length && <Card><UI text="No plans in this read." /></Card>}{card.data.items.map(planCard)}{card.data.next_cursor && <p className="text-xs"><UI text="More plans are available on Home." /></p>}</div>
      case 'plan_detail': return <div key={index}>{planCard(card.data)}</div>
      case 'ledger_history': return <Card key={index} className="space-y-3 text-sm">{!card.data.items.length && <p><UI text="No ledger entries in this read." /></p>}{card.data.items.map(item => <div key={item.entry.entry_id}><b><UI text={item.entry.type} /></b>{item.entry.lines.map((line, i) => <p key={i}>{line.account}: {fmt(line.Money, true)}</p>)}<Badge b={item.entry.badge} /></div>)}{card.data.next_cursor && <p><UI text="More ledger entries are available on Home." /></p>}</Card>
      case 'existing_balance_alternative': return <Card key={index} className="space-y-2 text-sm"><b><UI text="Existing balance · " />{card.account_id}</b><Amount v={card.balance} /><p>{card.reason}</p></Card>
      case 'comparison_unavailable': return <Warn key={index}>{card.reason} <UI text=" Change the request or retry when the service is available; no fixture fallback is used." /></Warn>
      case 'receipt_review': return <Card key={index} className="space-y-2 text-sm"><b><UI text="Receipt review · historical version " />{card.version}</b><p>{card.reviewed.merchant} · {fmt(card.reviewed.total)}</p><Badge b={card.extracted.badge} />{card.extracted.fixture_notice && <p>{card.extracted.fixture_notice}</p>}<p><UI text="Extraction is unconfirmed. Open the current version before editing or allocating." /></p><Btn disabled={disabled} onClick={() => onReceipt(card.draft_id)}><UI text="Open receipt review" /></Btn></Card>
      case 'allocation_review': return <Card key={index} className="space-y-2 text-sm"><b><UI text="Allocation review · " />{card.review_state}</b>{card.clarification.map(q => <p key={q.field}>{q.question}</p>)}{card.allocation && <><p><UI text="Total " />{fmt(card.allocation.total)} <UI text=" · payer " />{fmt(card.allocation.payer_share)}</p>{card.allocation.debtor_shares.map(s => <p key={s.participant_id}>{s.participant_id}: {fmt(s.share)}</p>)}<Badge b={card.allocation.badge} /></>}<Btn disabled={disabled} onClick={() => onReceipt(card.draft_id, card.proposal_id ?? undefined, card)}><UI text="Review current allocation" /></Btn><p><UI text="No financial action is taken by chat." /></p></Card>
      case 'shared_expense_recorded': return <RecordedBill key={card.proposal_id} data={card.data} />
      case 'receipt_workflow_unavailable': return <Warn key={index}>{card.code}: {card.reason} <UI text=" Retry receipt review when the service recovers; no financial posting occurred." /></Warn>
      default: return <Card key={index} className="text-sm"><UI text="Unsupported card. No financial action was taken. Use a supported explicit review workflow." /></Card>
    }
  })}</div>
}
