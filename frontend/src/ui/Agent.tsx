import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Send } from 'lucide-react'
import type { AgentCard, AgentResponse, Assessment, FV, HomeData, Selection } from '@/api/types'
import { seedCompare } from '@/api/compare'
import { uid } from '@/api/api'
import { Amount, Badge, Btn, Card, Err, Warn, fmt } from './kit'
import { ComparisonCard, SaveFlow } from './shared'
import { useApp } from './ctx'
import HomeSummary from './HomeSummary'

// ---------- chat model ----------
type Step = { label: string; ok: boolean; detail: string }
type Block =
  | { k: 'text'; text: string }
  | { k: 'trace'; steps: Step[] }
  | { k: 'chips'; q: string; opts: string[]; picked?: string }
  | { k: 'options'; sels: Selection[] }
  | { k: 'reserve'; sel: Selection; a: Assessment; state: 'open' | 'saved' | 'cancelled'; note?: string }
  | { k: 'safe'; h: HomeData }
  | { k: 'receipt'; done?: boolean }
  | { k: 'cards'; cards: AgentCard[]; res: AgentResponse }
type Msg = { id: string; role: 'user' | 'agent'; blocks: Block[] }
type PaidFrom = 'MYR_BANK' | 'KRW_CARD' | 'KRW_CASH'

const STARTERS = [
  'I need ₩100,000 cash in Seoul tomorrow. Find cheapest option and check if I can afford it.',
  "Split this ₩50,000 receipt with Daniel and Tze Loon. I paid, but Tze Loon didn't have drinks.",
  'Check my budget & reserves',
]
const CHIP_LABEL = ['Cheapest ₩100,000 cash', 'Split ₩50,000 receipt', 'Check budget & reserves']
const NETWORKS = ['Visa', 'Mastercard', 'UnionPay']
const RECEIPT = [
  { name: 'Shared food', amount: 42000, who: ['You', 'Daniel', 'Tze Loon'] },
  { name: 'Beverages', amount: 7000, who: ['Daniel'] },
  { name: 'Small extra item', amount: 1000, who: ['You'] },
]
const shares = () => RECEIPT.reduce<Record<string, number>>((m, it) => { it.who.forEach(w => (m[w] = (m[w] ?? 0) + it.amount / it.who.length)); return m }, {})
const mk = (role: Msg['role'], ...blocks: Block[]): Msg => ({ id: uid(), role, blocks })

// ---------- blocks ----------
function Trace({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false)
  return <div className="rounded-xl bg-white ring-1 ring-ink/10">
    <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left text-xs font-semibold">
      <span>{steps.map((s, i) => <span key={i}>{i > 0 && ' → '}<span className={s.ok ? 'text-emerald-700' : 'text-amber-600'}>{s.ok ? '✓' : '⚠'}</span> {s.label}</span>)}</span>
      <ChevronDown size={16} className={`shrink-0 ${open ? 'rotate-180' : ''}`} /></button>
    {open && <ul className="space-y-1 border-t border-ink/10 px-3 py-2 text-xs text-ink/70">{steps.map((s, i) => <li key={i}><b>{s.ok ? '✓' : '⚠'} {s.label}:</b> {s.detail}</li>)}</ul>}
  </div>
}

/** MaxSafeTotalDebit = CurrentReportedBalance − (FixedReserve + EmergencyReserve) */
function SafeFormula({ balance, reserve, planned }: { balance: FV; reserve: FV; planned?: FV }) {
  const safe = Math.max(0, balance.Money.amount_minor - reserve.Money.amount_minor)
  const row = (k: string, v: FV) => <div className="flex items-start justify-between gap-3"><span className="text-ink/60">{k}</span><Amount v={v} /></div>
  return <Card className="space-y-3 text-sm">
    {row('Reported MYR balance', balance)}{row('Stated reserves (fixed + emergency)', reserve)}
    {row('MaxSafeTotalDebit', { Money: { amount_minor: safe, currency: 'MYR' }, badge: { ...reserve.badge, source: 'Balance − (Fixed + Emergency reserve)' } })}
    {planned && row('Planned total debit', planned)}
  </Card>
}

function ReserveCard({ b, onReduce, onCancel, onOverride }: { b: Extract<Block, { k: 'reserve' }>; onReduce: () => void; onCancel: () => void; onOverride: () => void }) {
  const { a } = b, short = a.projected_reserve_shortfall.Money.amount_minor
  if (b.state !== 'open') return <Card className="text-sm">{b.state === 'saved' ? '✓ ' : ''}{b.note}</Card>
  return <div className="space-y-2"><Warn><b>This uses part of your reserve.</b> Projected balance is {fmt({ amount_minor: short, currency: 'MYR' })} below your stated reserve.</Warn>
    <SafeFormula balance={a.current_balance} reserve={a.total_reserve} planned={a.total_debit} />
    <Btn className="w-full" disabled={a.safe_principal.status !== 'available'} onClick={onReduce}>Reduce to Safe Amount</Btn>
    <Btn kind="outline" className="w-full" onClick={onCancel}>Cancel Plan</Btn>
    <Btn kind="coral" className="w-full" onClick={onOverride}>Save Plan Anyway (Override)</Btn></div>
}

function ReceiptCard({ done, onConfirm }: { done?: boolean; onConfirm: (from: PaidFrom, sh: Record<string, number>) => void }) {
  const [from, setFrom] = useState<PaidFrom>('KRW_CARD'), sh = shares(), total = RECEIPT.reduce((s, i) => s + i.amount, 0), w = (n: number) => fmt({ amount_minor: n, currency: 'KRW' })
  const badge = { status: done ? 'User-Confirmed' : 'Simulated', source: done ? 'Receipt confirmed by user' : 'Simulated OCR fixture (demo)', timestamp: new Date().toISOString() } as const
  return <Card className="space-y-3 text-sm">
    <div className="font-extrabold">Receipt review &amp; allocation</div>
    <table className="w-full"><tbody>{RECEIPT.map(i => <tr key={i.name} className="border-b border-ink/5 align-top"><td className="py-1.5"><b>{i.name}</b><div className="text-[11px] text-ink/55">{i.who.join(', ')}{i.who.length > 1 ? ` → ${w(i.amount / i.who.length)} each` : ' only'}</div></td><td className="py-1.5 text-right font-semibold">{w(i.amount)}</td></tr>)}
      <tr><td className="pt-2 font-extrabold">Total</td><td className="pt-2 text-right font-extrabold">{w(total)}</td></tr></tbody></table>
    <div className="grid grid-cols-3 gap-2 text-center text-xs">{[['Your share', sh['You']], ['Daniel owes', sh['Daniel']], ['Tze Loon owes', sh['Tze Loon']]].map(([k, v]) => <div key={k as string} className="rounded-xl bg-ink/5 p-2"><div className="text-ink/55">{k}</div><b className="text-sm">{w(v as number)}</b></div>)}</div>
    <label className="block"><span className="text-ink/60">paid_from_account</span><select disabled={done} value={from} onChange={e => setFrom(e.target.value as PaidFrom)} className="mt-1 min-h-[44px] w-full rounded-xl border border-ink/15 bg-white px-3 font-semibold">{['MYR_BANK', 'KRW_CARD', 'KRW_CASH'].map(x => <option key={x}>{x}</option>)}</select></label>
    <Badge b={badge} />
    {done ? <p className="font-semibold text-emerald-700">✓ Confirmed. Friends’ shares are tracked as KRW receivables, not income.</p> : <Btn className="w-full" onClick={() => onConfirm(from, sh)}>Confirm Extracted Receipt</Btn>}
  </Card>
}

// ---------- screen ----------
export default function Agent() {
  const { api, bump, go } = useApp()
  const [sid, setSid] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<any>(null), [save, setSave] = useState<{ pid: string; token: string } | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([mk('agent', { k: 'text', text: 'Hi! I can find the cheapest way to get cash, check your reserves and split receipts. Saving a plan never changes balances — only confirming completion does.' })])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { api.agentCreateSession().then(s => setSid(s.session_id)).catch(() => {}) }, [api])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  const push = (...m: Msg[]) => setMsgs(x => [...x, ...m])
  const patch = (id: string, f: (b: Block) => Block, only?: Block['k']) => setMsgs(x => x.map(m => m.id === id ? { ...m, blocks: m.blocks.map(b => !only || b.k === only ? f(b) : b) } : m))
  const guard = async (f: () => Promise<void>) => { setBusy(true); setErr(null); try { await f() } catch (e) { setErr(e) } setBusy(false) }

  // Flow 1 — cash: asks for card network, then runs the shared compare + reserve logic.
  const askCash = () => push(mk('agent', { k: 'text', text: 'Which card network will you use at the ATM? I need it to compare compatible ATMs.' }, { k: 'chips', q: 'network', opts: NETWORKS }))
  const runCash = (network: string) => guard(async () => {
    const home = await api.home(), sels = seedCompare({ objective: 'atm_withdrawal', mode: 'target', amount: 100000 }).map(o => o.selection)
    let a: Assessment | null = null; try { a = await api.previewPlan(sels[0]) } catch (e: any) { if (e.code !== 'INSUFFICIENT_FUNDS') throw e }
    const breach = !!a?.requires_reserve_acknowledgement, myr = home.balances.find(b => b.account_id === 'myr_funding')!.balance
    const steps: Step[] = [
      { label: 'Checked balances', ok: true, detail: `MYR Funding ${fmt(myr.Money)} (${myr.badge.status})` },
      { label: 'Compared ATM options', ok: true, detail: `${sels.length} simulated ${network} ATM options, ranked by lowest total MYR debit` },
      { label: breach ? 'Found reserve breach' : 'Reserve check passed', ok: !breach, detail: breach ? `Top option projects ${fmt(a!.projected_reserve_shortfall.Money)} below your stated reserve` : 'Top option stays above your stated reserves' }]
    if (breach) steps.push({ label: 'Calculated safe amount', ok: true, detail: `MaxSafeTotalDebit = ${fmt(home.budget.max_safe_total_debit.Money)}` })
    push(mk('agent', { k: 'text', text: `Here is the cheapest way to get ₩100,000 cash with ${network}. Simulated fixtures — not live quotes.` }, { k: 'trace', steps }, { k: 'options', sels }))
  })
  const choose = (sel: Selection) => guard(async () => {
    const a = await api.previewPlan(sel)
    if (!a.requires_reserve_acknowledgement) { await api.savePlan(sel, uid()); bump(); push(mk('agent', { k: 'text', text: `✓ Saved ${sel.quote.provider} to Pending Plans. Balances are unchanged until you confirm completion on Home.` })); return }
    push(mk('agent', { k: 'reserve', sel, a, state: 'open' }))
  })
  const resolve = (id: string, sel: Selection, a: Assessment, how: 'reduce' | 'cancel' | 'override') => guard(async () => {
    const set = (state: 'saved' | 'cancelled', note: string) => patch(id, b => ({ ...(b as any), state, note }), 'reserve')
    if (how === 'cancel') return set('cancelled', 'Plan cancelled. Nothing was saved.')
    if (how === 'override') { await api.savePlan(sel, uid(), { acknowledged: true, check_token: a.check_token }); bump(); return set('saved', 'Saved with reserve override and flagged as breached. Balances unchanged.') }
    const maxSafe = Math.max(0, a.current_balance.Money.amount_minor - a.total_reserve.Money.amount_minor) // MaxSafeTotalDebit
    const next = seedCompare({ objective: 'atm_withdrawal', mode: 'budget', amount: maxSafe }).find(o => o.selection.quote.provider === sel.quote.provider)!.selection
    await api.savePlan(next, uid()); bump()
    set('saved', `Reduced to a ${fmt(next.quote.total_debit)} total debit (₩${next.quote.net_received.amount_minor.toLocaleString()} cash) so MYR lands at your reserve. Saved to Pending Plans; balances unchanged.`)
  })

  // Flow 2 — receipt split + proactive risk alert.
  const confirmReceipt = (id: string, from: PaidFrom, sh: Record<string, number>) => guard(async () => {
    await api.confirmReceipt({ paid_from: from, total: 50000, debts: [{ debtor: 'Daniel', amount: sh['Daniel'] }, { debtor: 'Tze Loon', amount: sh['Tze Loon'] }] }, uid())
    patch(id, b => ({ ...(b as any), done: true }), 'receipt'); bump()
    const [h, p] = await Promise.all([api.home(), api.listPlans('pending')])
    const myr = h.balances.find(b => b.account_id === 'myr_funding')!.balance.Money.amount_minor
    const pending = p.items.reduce((s, x) => s + (x.plan.quote.total_debit.currency === 'MYR' ? x.plan.quote.total_debit.amount_minor : 0), 0)
    const gap = h.budget.total_reserve.Money.amount_minor - (myr - pending)
    const r: Block[] = [{ k: 'text', text: "I've recorded the ₩50,000 receipt and saved the confirmed split." }]
    if (pending > 0 && gap > 0) {
      r.push({ k: 'text', text: `Warning: Your saved cash plan for tomorrow will now put you ${fmt({ amount_minor: gap, currency: 'MYR' })} below your stated emergency reserve. Would you like me to review cheaper options or calculate a safer withdrawal amount?` }, { k: 'chips', q: 'followup', opts: ['Review cheaper options', 'Calculate safer amount'] })
    }
    push(mk('agent', ...r))
  })

  // Flow 3 — budget.
  const runBudget = () => guard(async () => {
    const h = await api.home(), safe = h.budget.max_safe_total_debit.Money
    push(mk('agent', { k: 'text', text: 'Here are your balances and protected reserves.' }, { k: 'trace', steps: [{ label: 'Checked balances', ok: true, detail: 'Read all three accounts' }, { label: 'Calculated safe amount', ok: true, detail: `MaxSafeTotalDebit = ${fmt(safe)}` }] }, { k: 'safe', h }))
  })

  const onChip = (m: Msg, q: string, v: string) => {
    patch(m.id, b => ({ ...(b as any), picked: v }), 'chips'); push(mk('user', { k: 'text', text: v }))
    if (q === 'network') runCash(v)
    else if (v === 'Review cheaper options') go('compare')
    else runCash('your card')
  }
  const send = (t: string) => {
    if (busy) return; setText(''); push(mk('user', { k: 'text', text: t }))
    if (t === STARTERS[0]) return askCash()
    if (t === STARTERS[1]) return push(mk('agent', { k: 'text', text: 'I read the receipt (simulated OCR). Please review the allocation before I record anything.' }, { k: 'receipt' }))
    if (t === STARTERS[2]) return runBudget()
    guard(async () => { const { response } = await api.agentSend(sid, t, uid()); push(mk('agent', { k: 'text', text: response.explanation }, { k: 'cards', cards: response.cards, res: response })) })
  }
  const startSave = (pid: string) => guard(async () => { const pv = await api.agentProposalPreview(sid, pid); setSave({ pid, token: pv.check_token }) })

  const render = (m: Msg, b: Block, i: number): ReactNode => {
    switch (b.k) {
      case 'text': return m.role === 'user' ? <span key={i}>{b.text}</span> : <div key={i} className="mr-6 rounded-2xl rounded-bl-md bg-white p-3 text-sm shadow-sm ring-1 ring-ink/5">{b.text}</div>
      case 'trace': return <Trace key={i} steps={b.steps} />
      case 'chips': return <div key={i} className="flex flex-wrap gap-2">{b.opts.map(o => <button key={o} disabled={!!b.picked} onClick={() => onChip(m, b.q, o)} className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ring-1 ${b.picked === o ? 'bg-cobalt text-white ring-cobalt' : 'bg-white text-cobalt ring-cobalt/40'} disabled:opacity-50`}>{o}</button>)}</div>
      case 'options': return <div key={i} className="space-y-2">{b.sels.map((s, k) => <ComparisonCard key={s.quote.quote_id} sel={s} rank={k + 1} primary="debit" onSave={() => choose(s)} />)}<p className="text-[11px] text-ink/50">Ranked by lowest total MYR debit including fees. Seeded sample data.</p></div>
      case 'reserve': return <ReserveCard key={i} b={b} onReduce={() => resolve(m.id, b.sel, b.a, 'reduce')} onCancel={() => resolve(m.id, b.sel, b.a, 'cancel')} onOverride={() => resolve(m.id, b.sel, b.a, 'override')} />
      case 'safe': return <div key={i} className="space-y-2"><HomeSummary h={b.h} /><SafeFormula balance={b.h.balances.find(x => x.account_id === 'myr_funding')!.balance} reserve={b.h.budget.total_reserve} /></div>
      case 'receipt': return <ReceiptCard key={i} done={b.done} onConfirm={(f, sh) => confirmReceipt(m.id, f, sh)} />
      case 'cards': return <div key={i} className="space-y-2">{b.cards.map((c, k) => c.type === 'balance_summary' ? <HomeSummary key={k} h={c.data} /> : c.type === 'quote_comparison' ? <div key={k} className="space-y-2">{c.options.map(o => <ComparisonCard key={o.snapshot_id} sel={o.selection} rank={o.rank} primary={o.selection.quote.objective === 'atm_withdrawal' ? 'debit' : 'net'} blocked={o.blocking_error} onSave={() => startSave(o.snapshot_id)} />)}</div> : c.type === 'comparison_unavailable' ? <Card key={k} className="text-sm">{c.reason}</Card> : null)}</div>
    }
  }
  return <div className="flex h-full flex-col">
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {msgs.map(m => <div key={m.id} className={m.role === 'user' ? 'ml-10 rounded-2xl rounded-br-md bg-cobalt p-3 text-sm text-white' : 'space-y-2'}>{m.blocks.map((b, i) => render(m, b, i))}</div>)}
      <Err e={err} />{busy && <p className="text-xs text-ink/50">Working…</p>}<div ref={end} />
    </div>
    <div className="border-t border-ink/10 bg-canvas p-3">
      <div className="mb-2 flex gap-2 overflow-x-auto">{STARTERS.map((s, i) => <button key={s} onClick={() => send(s)} title={s} className="min-h-[44px] shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-cobalt ring-1 ring-cobalt/30">{CHIP_LABEL[i]}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); text.trim() && send(text.trim()) }} className="flex gap-2"><input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…" className="min-h-[44px] flex-1 rounded-xl border border-ink/15 bg-white px-3 text-sm" />
        <button aria-label="Send" className="grid h-11 w-11 place-items-center rounded-xl bg-coral text-white"><Send size={18} /></button></form>
    </div>
    {save && <SaveFlow preview={() => api.agentProposalPreview(sid, save.pid)} save={(k, ack) => api.agentProposalSave(sid, save.pid, k, save.token, ack)} onClose={() => setSave(null)} onDone={() => { setSave(null); bump(); push(mk('agent', { k: 'text', text: 'Saved as a pending plan — no balances changed.' })) }} />}
  </div>
}
