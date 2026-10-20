import { useEffect, useRef, useState } from 'react'
import type { AlertResult, AtmResult } from '@/api/types'
import { Badge, Btn, Card, Err, Title, Warn, fmt } from './kit'
import { useApp } from './ctx'
import { ChevronDown, MapPin } from 'lucide-react'

function mapLink(value?: string | null) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && ['map.naver.com', 'map.kakao.com'].includes(url.hostname) && !url.username && !url.password ? url.toString() : undefined } catch { return undefined }
}

export default function Stretch() {
  const {api, t, go} = useApp(), backend = api.atmAlerts
  const [network, setNetwork] = useState('unknown'), [open, setOpen] = useState(true), [target, setTarget] = useState('315')
  const [atms, setAtms] = useState<AtmResult | null>(null), [alert, setAlert] = useState<AlertResult | null>(null)
  const [loading, setLoading] = useState(true), [checking, setChecking] = useState(false)
  const [atmError, setAtmError] = useState<unknown>(null), [alertError, setAlertError] = useState<unknown>(null)
  const atmSequence = useRef(0), alertSequence = useRef(0), alertLock = useRef(false)
  useEffect(() => {
    if (!backend) return
    const ticket = ++atmSequence.current
    backend.atms(network).then(result => { if (ticket === atmSequence.current) {setAtms(result); setAtmError(null)} }).catch(e => { if (ticket === atmSequence.current) setAtmError(e) }).finally(() => { if (ticket === atmSequence.current) setLoading(false) })
    return () => { atmSequence.current++ }
  }, [backend, network])
  useEffect(() => () => { alertSequence.current++ }, [])
  const loadAtms = async () => {
    if (!backend || loading) return
    const ticket = ++atmSequence.current; setLoading(true); setAtmError(null)
    try { const result = await backend.atms(network); if (ticket === atmSequence.current) setAtms(result) }
    catch (e) { if (ticket === atmSequence.current) setAtmError(e) }
    finally { if (ticket === atmSequence.current) setLoading(false) }
  }
  const check = async () => {
    if (!backend || alertLock.current) return
    const ticket = ++alertSequence.current; alertLock.current = true; setChecking(true); setAlertError(null); setAlert(null)
    try {
      if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(target) || !Number.isFinite(Number(target)) || Number(target) <= 0 || Number(target) > 1e9) throw new Error(t('Enter a positive plain-decimal target rate.'))
      const result = await backend.check({pair: 'MYR/KRW', target_rate: Number(target), direction: 'above'})
      if (ticket === alertSequence.current) setAlert(result)
    } catch (e) { if (ticket === alertSequence.current) setAlertError(e) }
    finally { alertLock.current = false; if (ticket === alertSequence.current) setChecking(false) }
  }
  // Chart coordinates only; rates, trigger status and estimated proceeds come from Steve.
  const history = alert?.history_7d ?? [], low = history.length ? Math.min(...history, alert!.target_rate) - 1 : 0, high = history.length ? Math.max(...history, alert!.target_rate) + 1 : 1
  const y = (rate: number) => 70 - ((rate - low) / (high - low)) * 60
  const points = history.map((rate, index) => `${10 + index * 280 / Math.max(1, history.length - 1)},${y(rate)}`).join(' ')
  if (!backend) return <div className="p-4"><Warn>{t('ATM & Alerts requires the live Node backend. No frontend fixtures are used.')}</Warn></div>
  return <div className="space-y-3 p-4">
    <h1 className="text-xl font-extrabold">{t('ATM Links & FX Alerts')}</h1>
    <Warn>{t('Seeded ATM locations, distances and rates are Simulated, not live or based on your device location. Checks do not subscribe to notifications or execute transactions.')}</Warn>
    <Title sub={t('Server-ranked indicative ATM quotes; use Compare for trusted preview and Save.')}>{t('Nearby ATMs')}</Title>
    <label className="block text-sm">{t('Card network')}<select aria-label={t('Card network')} value={network} disabled={loading} onChange={e => {setLoading(true); setAtms(null); setAtmError(null); setNetwork(e.target.value)}} className="ml-2 min-h-[44px] rounded-xl border border-ink/15 bg-white px-3">{['unknown', 'visa', 'mastercard', 'unionpay', 'plus'].map(n => <option key={n} value={n}>{n === 'unknown' ? t('Unknown') : ({visa: 'Visa', mastercard: 'Mastercard', unionpay: 'UnionPay', plus: 'Plus'} as Record<string, string>)[n]}</option>)}</select></label>
    {loading && <p role="status">{t('Loading ATM options…')}</p>}<Err e={atmError} /><Btn kind="outline" disabled={loading} onClick={() => void loadAtms()}>{t('Refresh ATM options')}</Btn>
    {atms?.status !== 'ready' && atms && <Warn>{atms.reason}</Warn>}
    {atms?.status === 'ready' && <>
      <p className="text-xs text-ink/60">{t('Illustrative pricing target:')} {fmt(atms.pricing_context.amount)} · {t('Funded by MYR Funding; no plan or posting created.')}</p>
      {!atms.options.length && <Card>{t('No ATM metadata for these inputs. Retry or use Compare; no fixture fallback is used.')}</Card>}
      {atms.options.map(option => {
        const atm = option.atm_info!, quote = option.selection.quote, naver = mapLink(atm.map_url), kakao = mapLink(atm.kakao_map_url)
        return <Card key={quote.quote_id}>
          <div className="flex items-center gap-2 font-bold"><MapPin size={16} className="text-coral" />{option.rank}. {quote.provider}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{atm.supported_networks.map(n => <span key={n} className="rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-semibold text-cobalt">{n}</span>)}<span className="text-xs">{atm.distance_meters} {t('m away')} · {t('Simulated')}</span></div>
          <p className="mt-2 text-xs">{t('Total debit')}: {fmt(quote.total_debit)} · {t('Net proceeds')}: {fmt(quote.net_received)}</p>
          {quote.fees.map((f, i) => <p key={i} className="text-xs text-ink/60">{t(f.label)}: {fmt(f.Money)}</p>)}
          <p className="mt-2 text-xs">{t('Compatibility')}: {t(option.compatibility?.status ?? 'unknown')} {option.compatibility?.status === 'unknown' ? option.compatibility.reason : option.compatibility?.evidence.source ?? t('No supporting compatibility evidence.')}</p>
          <div className="mt-2"><Badge b={quote.badge} /></div>
          <details className="mt-2 text-xs"><summary>{t('Provider withdrawal guide (original)')}</summary>{atm.withdrawal_guide}</details>
          <div className="mt-3 grid grid-cols-2 gap-2">{naver && <a className="grid min-h-[44px] place-items-center rounded-xl border border-cobalt text-xs font-semibold text-cobalt" target="_blank" rel="noreferrer" href={naver}>{t('Open in Naver Map')}</a>}{kakao && <a className="grid min-h-[44px] place-items-center rounded-xl border border-cobalt text-xs font-semibold text-cobalt" target="_blank" rel="noreferrer" href={kakao}>{t('Open in Kakao Map')}</a>}</div>
        </Card>
      })}
    </>}
    <Card>
      <button onClick={() => setOpen(value => !value)} className="flex min-h-[44px] w-full items-center justify-between font-bold">{t('Target-rate alert')}<ChevronDown className={open ? 'rotate-180' : ''} size={18} /></button>
      {open && <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">{t('Alert me when RM 1 buys at least')}<input aria-label={t('Target rate')} inputMode="decimal" value={target} disabled={checking} onChange={e => {setTarget(e.target.value); setAlert(null); setAlertError(null)}} className="min-h-[44px] w-20 rounded-xl border border-ink/15 px-2 text-center font-bold" />KRW</label>
        <Btn disabled={checking} onClick={() => void check()}>{t(checking ? 'Checking target rate…' : 'Check target rate')}</Btn><Err e={alertError} />
        {alert && <>
          <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-ink/5 p-2"><div className="text-xs text-ink/55">{t('Current rate')}</div><b>₩ {alert.current_rate}</b></div><div className="rounded-xl bg-ink/5 p-2"><div className="text-xs text-ink/55">{t('Target rate')}</div><b>₩ {alert.target_rate}</b></div></div>
          <div><div className="text-xs text-ink/55">{t('Last 7 days')}</div><svg aria-label={t('Seeded rate history chart')} role="img" viewBox="0 0 300 80" className="w-full"><line x1="0" x2="300" y1={y(alert.target_rate)} y2={y(alert.target_rate)} stroke="#FF785F" strokeDasharray="4 3" /><polyline points={points} fill="none" stroke="#3546D3" strokeWidth="2.5" /></svg></div>
          <p className={`text-sm font-semibold ${alert.triggered ? 'text-emerald-700' : 'text-ink/70'}`}>{t(alert.triggered ? 'Target reached' : 'Target not reached')}</p>
          <p className="text-xs">{t('Reference estimate before fees:')} {fmt(alert.planned_amount)} → {fmt(alert.estimated_proceeds)}</p><p className="text-xs text-ink/60">{t('Provider recommendation (original)')}: {alert.recommendation}</p><Badge b={alert.badge} />
        </>}
        <Btn className="w-full" onClick={() => go('compare')}>{t('Review Options')}</Btn>
      </div>}
    </Card>
  </div>
}
