import UI from './i18n-view'
import type { ReactNode } from 'react'
import { User, CheckCircle2, Lock, BarChart3, CircleDot, AlertTriangle, X } from 'lucide-react'
import type { Badge as B, Money, FV } from '@/api/types'
import { useApp } from './ctx'

export const fmt = (m: Money, signed = false) => {
  const n = m.amount_minor, abs = Math.abs(n), sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  return m.currency === 'MYR' ? `${sign}RM ${(abs / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${sign}₩ ${abs.toLocaleString('en-US')}`
}
export const stamp = (iso: string) => {
  const d = new Date(iso); if (isNaN(+d)) return iso
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return f.replace(',', ',') + ' KST'
}
const S: Record<B['status'], [string, string, any]> = {
  'User-Entered': ['bg-blue-50 text-cobalt', '', User], 'User-Confirmed': ['bg-emerald-50 text-emerald-700', '', CheckCircle2],
  Simulated: ['bg-slate-100 text-slate-600', '', Lock], Indicative: ['bg-violet-50 text-violet-700', '', BarChart3], Live: ['bg-green-50 text-green-700', '', CircleDot],
}
/** Data Traceability Standard: status + source + timestamp on every figure. */
export function Badge({ b, meta = true }: { b: B; meta?: boolean }) {
  const { t } = useApp()
  const [cls, , Icon] = S[b.status]
  return <span className="inline-flex flex-col items-start gap-0.5 align-middle">
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}><Icon size={11} />{t(b.status)}</span>
    {meta && <span className="text-[10px] leading-tight text-ink/50">{b.source ? b.source + ' · ' : ''}{stamp(b.timestamp)}</span>}
  </span>
}
export const Amount = ({ v, big, signed }: { v: FV; big?: boolean; signed?: boolean }) =>
  <div><div className={big ? 'text-2xl font-extrabold tracking-tight' : 'font-bold'}>{fmt(v.Money, signed)}</div><Badge b={v.badge} /></div>
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) =>
  <div className={`rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(25,33,58,.08)] ring-1 ring-ink/5 ${className}`}>{children}</div>
export const Btn = ({ children, onClick, kind = 'primary', disabled, className = '' }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'outline' | 'coral' | 'ghost'; disabled?: boolean; className?: string }) =>
  <button disabled={disabled} onClick={onClick} className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold transition disabled:opacity-40 ${{ primary: 'bg-cobalt text-white', outline: 'border border-cobalt text-cobalt bg-white', coral: 'bg-coral text-white', ghost: 'text-ink/60' }[kind]} ${className}`}><UI text={children} /></button>
export const Title = ({ children, sub }: { children: ReactNode; sub?: string }) => <div className="mb-2 mt-5 first:mt-0"><h2 className="text-[15px] font-bold"><UI text={children} /></h2>{sub && <p className="text-xs text-ink/55"><UI text={sub} /></p>}</div>
export const Warn = ({ children }: { children: ReactNode }) => <div className="flex gap-2 rounded-xl bg-amber-100 p-3 text-sm"><AlertTriangle className="shrink-0 text-amber-600" size={18} /><div>{children}</div></div>
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const {t} = useApp()
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-canvas p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-extrabold">{t(title)}</h3><button aria-label={t('Close')} onClick={onClose} className="grid h-11 w-11 place-items-center"><X size={20} /></button></div>{children}</div></div>
}
export const Err = ({ e }: { e: any }) => e ? <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700"><UI text={e.code ? `${e.code}: ` : ''} />{e.message}</p> : null
