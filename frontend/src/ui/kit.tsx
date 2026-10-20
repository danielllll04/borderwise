import UI from './i18n-view'
import type { ReactNode } from 'react'
import { User, CheckCircle2, Lock, BarChart3, CircleDot, AlertTriangle, X, type LucideIcon } from 'lucide-react'
import type { Badge as B, Money, FV } from '@/api/types'
import { useApp } from './ctx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const fmt = (m: Money, signed = false) => {
  const n = m.amount_minor, abs = Math.abs(n), sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  return m.currency === 'MYR' ? `${sign}RM ${(abs / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${sign}₩ ${abs.toLocaleString('en-US')}`
}
export const stamp = (iso: string) => {
  const d = new Date(iso); if (isNaN(+d)) return iso
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return f.replace(',', ',') + ' KST'
}
const S: Record<B['status'], [string, string, LucideIcon]> = {
  'User-Entered': ['bg-blue-50 text-cobalt', '', User], 'User-Confirmed': ['bg-emerald-50 text-emerald-700', '', CheckCircle2],
  Simulated: ['bg-slate-100 text-slate-600', '', Lock], Indicative: ['bg-violet-50 text-violet-700', '', BarChart3], Live: ['bg-green-50 text-green-700', '', CircleDot],
}
const provenanceHelp: Record<B['status'], string> = {
  Simulated: 'Sample data for demonstration, not a live quote or bank balance.',
  Indicative: 'An estimate to review before confirming.',
  'User-Entered': 'Based on details you entered.',
  'User-Confirmed': 'Based on activity you confirmed.',
  Live: 'Provided by a connected live source.',
}
/** Keep provenance visible; technical source strings are not customer-facing copy. */
export function Badge({ b, meta = true }: { b: B; meta?: boolean }) {
  const { t } = useApp()
  const [cls, , Icon] = S[b.status]
  const label = <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-4 ${cls}`}><Icon size={10} aria-hidden="true" />{t(b.status)}</span>
  return meta ? <Tooltip><TooltipTrigger asChild><button type="button" aria-label={`${t(b.status)}: ${t('About this value')}`} className="inline-flex rounded-full align-middle outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40">{label}</button></TooltipTrigger><TooltipContent className="max-w-60 text-xs leading-relaxed">{t(provenanceHelp[b.status])}</TooltipContent></Tooltip> : label
}
export const Amount = ({ v, big, signed }: { v: FV; big?: boolean; signed?: boolean }) =>
  <div className="space-y-1"><div className={`tabular-nums ${big ? 'text-2xl font-semibold tracking-tight' : 'font-semibold'}`}>{fmt(v.Money, signed)}</div><Badge b={v.badge} /></div>
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) =>
  <div className={`rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(25,33,58,.025)] ring-1 ring-ink/[.06] ${className}`}>{children}</div>
export const Btn = ({ children, onClick, kind = 'primary', disabled, className = '' }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'outline' | 'coral' | 'ghost'; disabled?: boolean; className?: string }) =>
  <button disabled={disabled} onClick={onClick} className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40 disabled:opacity-40 ${{ primary: 'bg-cobalt text-white', outline: 'border border-ink/10 text-ink/70 bg-white hover:bg-ink/[.025]', coral: 'bg-coral text-white', ghost: 'text-ink/60' }[kind]} ${className}`}><UI text={children} /></button>
export const Title = ({ children, sub }: { children: ReactNode; sub?: string }) => <div className="mb-3 mt-6 first:mt-0"><h2 className="text-[15px] font-semibold tracking-tight"><UI text={children} /></h2>{sub && <p className="mt-1 text-xs leading-relaxed text-ink/50"><UI text={sub} /></p>}</div>
export const Details = ({ children, label = 'How this works' }: { children: ReactNode; label?: string }) => <details className="text-xs leading-relaxed text-ink/55"><summary className="w-fit cursor-pointer rounded py-1 font-medium text-ink/50 marker:text-ink/30 focus-visible:outline-cobalt"><UI text={label} /></summary><div className="mt-1 space-y-2 rounded-xl bg-ink/[.025] p-3">{children}</div></details>
export const Warn = ({ children }: { children: ReactNode }) => <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200/40"><AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={16} /><div>{children}</div></div>
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const {t} = useApp()
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-canvas p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-extrabold">{t(title)}</h3><button aria-label={t('Close')} onClick={onClose} className="grid h-11 w-11 place-items-center"><X size={20} /></button></div>{children}</div></div>
}
export function Err({ e }: { e: unknown }) {
  if (!e) return null
  const details = typeof e === 'object' && e !== null ? e as { code?: unknown; message?: unknown } : undefined
  const message = e instanceof Error ? e.message : String(details?.message ?? e)
  return <div className="mt-2 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-700"><p>{message}</p>{details?.code ? <Details label="Error details">{String(details.code)}</Details> : null}</div>
}
