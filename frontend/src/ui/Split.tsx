import { useEffect, useState } from 'react'
import type { Receivable, Money } from '@/api/types'
import { Badge, Btn, Card, Err, Modal, Title, Warn, fmt } from './kit'
import { useApp } from './ctx'
import { uid } from '@/api/api'

export default function Split() {
  const { api, rev, bump, t } = useApp()
  const [rs, setRs] = useState<Receivable[]>([]), [sel, setSel] = useState<Receivable | null>(null)
  useEffect(() => { api.receivables().then(setRs) }, [rev, api])
  return <div className="space-y-3 p-4">
    <h1 className="text-xl font-extrabold">{t('Split expenses')}</h1>
    <Warn>Receipt scan &amp; item allocation come next. Settlement below follows the final rules: debt locked in receipt currency, repayment recorded in the currency actually received.</Warn>
    <Title>Owed to you</Title>
    {rs.length === 0 && <p className="text-sm text-ink/55">Nothing outstanding.</p>}
    {rs.map(r => { const rate = Number(r.snapshot.rate), eq = Math.round(r.remaining.amount_minor / rate * 100)
      return <Card key={r.receivable_id}>
        <div className="flex justify-between"><div className="font-bold">{r.debtor} owes</div><div className="text-lg font-extrabold">{fmt(r.remaining)}</div></div>
        <p className="mt-1 text-xs text-ink/60">≈ {fmt({ amount_minor: eq, currency: 'MYR' })} (snapshot RM 1 = ₩ {r.snapshot.rate})</p>
        <div className="mt-1"><Badge b={r.snapshot.badge} /></div>
        <Btn className="mt-3 w-full" onClick={() => setSel(r)}>Mark as Settled</Btn></Card> })}
    {sel && <Settle r={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); bump() }} />}
  </div>
}
function Settle({ r, onClose, onDone }: { r: Receivable; onClose: () => void; onDone: () => void }) {
  const { api } = useApp(), [cur, setCur] = useState<'MYR' | 'KRW'>('KRW'), [amt, setAmt] = useState(String(r.remaining.amount_minor)), [err, setErr] = useState<any>(null), [key] = useState(uid)
  const go = async () => {
    const received: Money = { currency: cur, amount_minor: Math.round(Number(amt) * (cur === 'MYR' ? 100 : 1)) }
    try { await api.settleReceivable(r.receivable_id, r.remaining, received, key); onDone() } catch (e) { setErr(e) }
  }
  return <Modal title="Settle debt" onClose={onClose}>
    <p className="text-sm text-ink/60">Debt cleared</p><p className="text-xl font-extrabold">{fmt(r.remaining)} <span className="text-sm font-medium">({r.debtor})</span></p>
    <div className="mt-3 flex gap-2"><select value={cur} onChange={e => { const c = e.target.value as 'MYR' | 'KRW'; setCur(c); setAmt(c === 'KRW' ? String(r.remaining.amount_minor) : String((r.remaining.amount_minor / Number(r.snapshot.rate)).toFixed(2))) }} className="min-h-[44px] rounded-xl border border-ink/15 bg-white px-3 font-semibold"><option value="KRW">KRW</option><option value="MYR">MYR</option></select>
      <input inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} className="min-h-[44px] flex-1 rounded-xl border border-ink/15 bg-white px-3 font-bold" /></div>
    <p className="mt-2 text-xs text-ink/55">Credited to {cur === 'MYR' ? 'MYR Funding Balance' : 'KRW Cash-on-Hand'}. This clears a receivable — it is never counted as income.</p>
    <Err e={err} /><Btn className="mt-4 w-full" onClick={go}>Confirm settlement</Btn></Modal>
}
