import { useState } from 'react'
import { Badge, Btn, Card, Title } from './kit'
import { useApp } from './ctx'
import { ChevronDown, MapPin } from 'lucide-react'

const TS = '2026-10-18T05:20:00.000Z' // 18 Oct 2026, 14:20 KST
const SIM = { status: 'Simulated' as const, source: 'Simulated Sample Dataset', timestamp: TS }
const ATMS = [
  { name: 'KB Kookmin Bank Global ATM (Hongdae Branch)', distance: 120, networks: ['Visa', 'Mastercard', 'Plus'], fee: 3500, map_url: 'https://map.naver.com/p/search/KB%20Kookmin%20Bank%20Hongdae', kakao_map_url: 'https://map.kakao.com/link/search/KB%20Kookmin%20Bank%20Hongdae' },
  { name: 'Shinhan Bank Global ATM (Hongdae Exit 9)', distance: 350, networks: ['UnionPay', 'Visa', 'Mastercard'], fee: 3500, map_url: 'https://map.naver.com/p/search/Shinhan%20Bank%20Hongdae', kakao_map_url: 'https://map.kakao.com/link/search/Shinhan%20Bank%20Hongdae' },
  { name: 'Woori Bank Global ATM (Sinchon Station)', distance: 220, networks: ['UnionPay', 'Visa', 'Plus'], fee: 3600, map_url: 'https://map.naver.com/p/search/Woori%20Bank%20Sinchon', kakao_map_url: 'https://map.kakao.com/link/search/Woori%20Bank%20Sinchon' },
  { name: 'CU Convenience Store ATM (Hongdae Street)', distance: 60, networks: ['Visa', 'Mastercard'], fee: 4000, map_url: 'https://map.naver.com/p/search/CU%20Hongdae', kakao_map_url: 'https://map.kakao.com/link/search/CU%20Hongdae' },
]
const HIST = [296, 297, 295, 298, 299, 297, 298] // seeded RM 1 → KRW, last 7 days

export default function Stretch() {
  const { t, go, lang } = useApp()
  const [open, setOpen] = useState(true), [target, setTarget] = useState('315')
  const cur = HIST[HIST.length - 1], tgt = Number(target) || 0
  const lo = Math.min(...HIST, tgt) - 1, hi = Math.max(...HIST, tgt) + 1, y = (v: number) => 70 - ((v - lo) / (hi - lo)) * 60
  const pts = HIST.map((v, i) => `${10 + i * 46.6},${y(v)}`).join(' ')
  return <div className="space-y-3 p-4">
    <h1 className="text-xl font-extrabold">{t('ATM Links & FX Alerts')}</h1>
    <Title sub={lang === 'zh' ? '模拟样本数据 · 非实时' : 'Simulated sample dataset · not live'}>{t('Nearby ATMs')}</Title>
    {ATMS.map(a => <Card key={a.name}>
      <div className="flex items-center gap-2 font-bold"><MapPin size={16} className="text-coral" />{a.name}</div>
      <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-semibold text-cobalt">{t('Global ATM')}</span>{a.networks.map(g => <span key={g} className="rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-semibold text-cobalt">{g}</span>)}<span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-semibold text-cobalt">{a.distance} {lang === 'zh' ? t('away') : 'm away'}</span></div>
      <p className="mt-2 text-xs text-ink/60">{t('Operator fee')}: ₩ {a.fee.toLocaleString('en-US')}</p>
      <div className="mt-2"><Badge b={SIM} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {a.map_url && <a className="grid min-h-[44px] place-items-center rounded-xl border border-cobalt text-xs font-semibold text-cobalt" target="_blank" rel="noreferrer" href={a.map_url}>{t('Open in Naver Map')}</a>}
        {a.kakao_map_url && <a className="grid min-h-[44px] place-items-center rounded-xl border border-cobalt text-xs font-semibold text-cobalt" target="_blank" rel="noreferrer" href={a.kakao_map_url}>{t('Open in Kakao Map')}</a>}</div>
    </Card>)}
    <Card>
      <button onClick={() => setOpen(o => !o)} className="flex min-h-[44px] w-full items-center justify-between font-bold">{t('Target-rate alert')}<ChevronDown className={open ? 'rotate-180' : ''} size={18} /></button>
      {open && <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">{lang === 'zh' ? '当 RM 1 可换至少' : 'Alert me when RM 1 buys at least'}<input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} className="min-h-[44px] w-20 rounded-xl border border-ink/15 px-2 text-center font-bold" />KRW</label>
        <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-ink/5 p-2"><div className="text-xs text-ink/55">{t('Current rate')}</div><b>₩ {cur}</b></div><div className="rounded-xl bg-ink/5 p-2"><div className="text-xs text-ink/55">{t('Target rate')}</div><b>₩ {tgt}</b></div></div>
        <div><div className="text-xs text-ink/55">{t('Last 7 days')}</div>
          <svg viewBox="0 0 300 80" className="w-full"><line x1="0" x2="300" y1={y(tgt)} y2={y(tgt)} stroke="#FF785F" strokeDasharray="4 3" /><polyline points={pts} fill="none" stroke="#3546D3" strokeWidth="2.5" /></svg></div>
        <p className={`text-sm font-semibold ${cur >= tgt ? 'text-emerald-700' : 'text-ink/70'}`}>{cur >= tgt ? (lang === 'zh' ? '已达到目标汇率' : 'Target reached') : (lang === 'zh' ? `还差 ₩${tgt - cur}` : `₩${tgt - cur} to go`)}</p>
        <Badge b={{ status: 'Simulated', source: 'Seeded historical dataset', timestamp: TS }} />
        <Btn className="w-full" onClick={() => go('compare')}>{t('Review Options')}</Btn></div>}
    </Card></div>
}
