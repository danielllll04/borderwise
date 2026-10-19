import { useEffect, useState } from 'react'
import type { Assessment, Selection, PlanResponse } from '@/api/types'
import { Amount, Badge, Btn, Card, Err, Modal, Warn, fmt } from './kit'
import { uid } from '@/api/api'
import { useApp } from './ctx'

/** Ranked comparison card — used by Compare tab AND Agent tab (single source of UI truth). */
export function ComparisonCard({ sel, rank, primary, onSave, blocked, saveLabel = 'Select & Save as Plan' }: { sel: Selection; rank: number; primary: 'net' | 'debit'; onSave?: () => void; blocked?: string | null; saveLabel?: string }) {
  const { t } = useApp(), q = sel.quote
  return <Card className={rank === 1 ? 'ring-2 ring-cobalt/40' : ''}>
    <div className="flex items-start justify-between"><div><div className="text-[11px] font-bold uppercase text-cobalt">{rank === 1 ? 'Top ranked' : `Option ${rank}`}</div><div className="text-base font-extrabold">{q.provider}</div></div>
      <div className="text-right"><div className="text-[11px] text-ink/55">{t(primary === 'net' ? 'Net proceeds' : 'Total debit')}</div><div className="text-xl font-extrabold">{fmt(primary === 'net' ? q.net_received : q.total_debit)}</div></div></div>
    <dl className="mt-3 space-y-1 text-sm">
      <Row k={t("Exchange rate")} v={`RM 1 = ₩ ${q.rate}`} />
      {q.fees.map(f => <Row key={f.label} k={f.label} v={fmt(f.Money)} />)}
      <Row k={primary === 'net' ? 'Total debit' : 'Net proceeds'} v={fmt(primary === 'net' ? q.total_debit : q.net_received)} />
    </dl>
    <div className="mt-3 flex items-end justify-between gap-2"><Badge b={q.badge} />{blocked && <span className="text-xs text-red-600">{blocked}</span>}</div>
    {onSave && <Btn className="mt-3 w-full" onClick={onSave} disabled={!!blocked}>{t(saveLabel)}</Btn>}
  </Card>
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><dt className="text-ink/60">{k}</dt><dd className="font-semibold">{v}</dd></div>

/** Modal A. Preview first; if no reserve breach, saves straight away. */
export function SaveFlow({ preview, save, onReduce, onDone, onClose }: {
  preview: () => Promise<Assessment>; save: (key: string, ack?: { acknowledged: true; check_token: string }) => Promise<PlanResponse>
  onReduce?: (maxSafeTotalDebit: number) => void; onDone: (p: PlanResponse) => void; onClose: () => void
}) {
  const { t } = useApp()
  const [a, setA] = useState<Assessment | null>(null), [err, setErr] = useState<any>(null), [busy, setBusy] = useState(false)
  const [key] = useState(uid)
  const doSave = async (ack?: Assessment) => {
    setBusy(true); setErr(null)
    try { onDone(await save(key, ack ? { acknowledged: true, check_token: ack.check_token } : undefined)) }
    catch (e: any) { if (e.details?.preview) setA(e.details.preview); setErr(e); setBusy(false) }
  }
  useEffect(() => { preview().then(r => { setA(r); if (!r.requires_reserve_acknowledgement) doSave() }).catch(setErr) }, [])
  if (!a) return <Modal title="Checking your plan…" onClose={onClose}><Err e={err} />{!err && <p className="text-sm text-ink/60">Running the fee-aware budget check.</p>}{err && <Btn kind="outline" className="mt-3 w-full" onClick={onClose}>Back</Btn>}</Modal>
  const short = a.projected_reserve_shortfall.Money.amount_minor
  const safe = a.safe_principal
  return <Modal title={t('This uses part of your reserve')} onClose={onClose}>
    <Warn>Total debit including fees takes your balance below your <b>stated reserve</b>.</Warn>
    <Card className="mt-3 space-y-3 text-sm">
      <Line k="Reported MYR balance" v={a.current_balance} />
      <Line k="Stated protected reserves" v={a.total_reserve} />
      <Line k="Planned total debit (principal + fees)" v={a.total_debit} />
      <Line k="Projected balance after plan" v={a.projected_balance} />
      <p className="font-semibold text-amber-700">{fmt({ amount_minor: short, currency: 'MYR' })} below your stated reserve</p>
    </Card>
    <Err e={err} />
    <div className="mt-4 space-y-2">
      {onReduce && safe.status === 'available' && safe.amount && <Btn className="w-full" onClick={() => onReduce(safe.amount!.Money.amount_minor + (a.total_debit.Money.amount_minor - a.principal.Money.amount_minor))}>Reduce to safe amount ({fmt(safe.amount.Money)} exchange)</Btn>}
      {!onReduce && <p className="text-xs text-ink/55">To change the amount, ask for a new quote — plans are never edited in place.</p>}
      <Btn kind="outline" className="w-full" onClick={onClose}>Cancel plan</Btn>
      <Btn kind="coral" className="w-full" disabled={busy} onClick={() => doSave(a)}>Save plan anyway (override reserve)</Btn>
    </div></Modal>
}
const Line = ({ k, v }: { k: string; v: { Money: any; badge: any } }) => { const { t } = useApp(); return <div className="flex items-start justify-between gap-3"><span className="text-ink/60">{t(k)}</span><div className="text-right"><div className="font-bold">{fmt(v.Money)}</div><Badge b={v.badge} /></div></div> }
export { Amount }
