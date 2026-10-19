import { useMemo, useState } from 'react'
import { seedCompare, type Objective, type Mode } from '@/api/compare'
import type { Selection } from '@/api/types'
import { Card, Title, Warn } from './kit'
import { ComparisonCard, SaveFlow } from './shared'
import { useApp } from './ctx'

const OBJ: { id: Objective; t: string; s: string }[] = [
  { id: 'exchange', t: 'Exchange currency before spending', s: 'Money changers & transfer services like Wise' },
  { id: 'card', t: 'Pay by card in another country', s: 'Visa/Mastercard indicative rates + issuer fees' },
  { id: 'atm_withdrawal', t: 'Withdraw cash from an ATM', s: 'ATM operator fees & foreign-card charges' }]

export default function Compare() {
  const { api, bump, go, t } = useApp()
  const [obj, setObj] = useState<Objective>('exchange'), [mode, setMode] = useState<Mode>('budget'), [val, setVal] = useState('100')
  const [saving, setSaving] = useState<Selection | null>(null), [toast, setToast] = useState('')
  const amount = mode === 'budget' ? Math.round(Number(val) * 100) : Math.round(Number(val))
  const opts = useMemo(() => amount > 0 ? seedCompare({ objective: obj, mode, amount }) : [], [obj, mode, amount])
  // "Reduce to safe amount": ask the (seeded) Compare for a brand-new complete quote from the same provider.
  const reduce = (maxDebit: number) => {
    const same = seedCompare({ objective: obj, mode: 'budget', amount: maxDebit }).find(o => o.selection.quote.provider === saving!.quote.provider)
    if (same) setSaving(same.selection)
  }
  return <div className="space-y-3 p-4">
    <h1 className="text-xl font-extrabold">{t('Find a better way to move money')}</h1>
    <Title>1 · What do you want to do?</Title>
    {OBJ.map(o => <button key={o.id} onClick={() => setObj(o.id)} className={`flex min-h-[44px] w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left ${obj === o.id ? 'border-cobalt ring-1 ring-cobalt' : 'border-ink/10'}`}>
      <i className={`grid h-5 w-5 place-items-center rounded-full border-2 ${obj === o.id ? 'border-cobalt' : 'border-ink/25'}`}>{obj === o.id && <b className="h-2.5 w-2.5 rounded-full bg-cobalt" />}</i>
      <span><span className="block text-sm font-bold">{t(o.t)}</span><span className="text-xs text-ink/55">{o.s}</span></span></button>)}
    <Title>2 · Amount</Title>
    <Card>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 text-sm font-semibold">
        {(['budget', 'target'] as Mode[]).map(m => <button key={m} onClick={() => { setMode(m); setVal(m === 'budget' ? '100' : '100000') }} className={`min-h-[44px] rounded-lg ${mode === m ? 'bg-white shadow' : 'text-ink/55'}`}>{t(m === 'budget' ? 'Fixed budget' : 'Fixed target')}</button>)}</div>
      <label className="flex items-center gap-2 text-sm">{mode === 'budget' ? 'I have RM' : 'I need ₩'}
        <input inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} className="min-h-[44px] flex-1 rounded-xl border border-ink/15 px-3 text-lg font-bold" /></label>
      <p className="mt-2 text-xs text-ink/55">{mode === 'budget' ? 'Ranked by most KRW received after all fees.' : 'Ranked by lowest total MYR cost including fees.'}</p>
    </Card>
    <Title sub="3 seeded options · not live market quotes">3 · Ranked options</Title>
    {obj === 'card' && <Warn>Card-purchase plans can’t be saved yet — the ledger has no purchase type. You can compare, not plan.</Warn>}
    {opts.map((o, i) => <ComparisonCard key={o.selection.quote.quote_id} sel={o.selection} rank={i + 1} primary={mode === 'budget' ? 'net' : 'debit'} blocked={obj === 'card' ? 'Planning unsupported' : null} onSave={() => setSaving(o.selection)} />)}
    {toast && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{toast}</div>}
    {saving && <SaveFlow key={saving.quote.quote_id} preview={() => api.previewPlan(saving)} save={(k, ack) => api.savePlan(saving, k, ack)} onReduce={reduce}
      onClose={() => setSaving(null)} onDone={() => { setSaving(null); setToast('Saved to your pending plans. Balances are unchanged.'); bump(); setTimeout(() => go('home'), 900) }} />}
  </div>
}
