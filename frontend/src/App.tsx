import { useMemo, useState } from 'react'
import { Home as HomeIcon, LayoutGrid, Users, Bot, MapPin } from 'lucide-react'
import { liveApi } from '@/api/api'
import { mockApi } from '@/api/mock'
import { Ctx } from '@/ui/ctx'
import Home from '@/ui/Home'
import Compare from '@/ui/Compare'
import Split from '@/ui/Split'
import Agent from '@/ui/Agent'
import Stretch from '@/ui/Stretch'
import { makeT, type Lang } from '@/ui/i18n'

const env = (import.meta as any).env ?? {}
const BASE = env.VITE_API_BASE_URL ?? ''
const TABS = [['agent', 'Agent', Bot, Agent], ['home', 'Home', HomeIcon, Home], ['compare', 'Compare', LayoutGrid, Compare], ['split', 'Split', Users, Split], ['stretch', 'ATM & Alerts', MapPin, Stretch]] as const

export default function App() {
  const [tab, setTab] = useState('agent'), [rev, setRev] = useState(0), [lang, setLang] = useState<Lang>('en'), useMock = env.VITE_USE_MOCK !== 'false'
  const api = useMemo(() => (useMock ? mockApi() : liveApi(BASE)), [useMock])
  const Screen = TABS.find(t => t[0] === tab)![3]
  return <Ctx.Provider value={{ api, rev, bump: () => setRev(r => r + 1), go: setTab, lang, t: makeT(lang) }}>
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-canvas sm:border-x sm:border-ink/10">
      <div className="flex items-center justify-between px-4 pt-3 text-[11px]"><b className="text-base font-extrabold text-coral">Border<span className="text-cobalt">Wise</span></b>
        <div className="flex rounded-full bg-ink/5 p-0.5 font-semibold" role="group" aria-label="Language">{(['en', 'zh'] as Lang[]).map(l => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`min-h-[44px] rounded-full px-3 ${lang === l ? 'bg-white shadow text-ink' : 'text-ink/50'}`}>{l === 'en' ? 'English' : '中文'}</button>)}</div></div>
      <main className="min-h-0 flex-1 overflow-y-auto" key={api.mode + tab}><Screen /></main>
      <nav className="grid grid-cols-5 border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${tab === id ? 'text-coral' : 'text-ink/50'}`}><Icon size={22} />{makeT(lang)(label)}</button>)}
      </nav></div></Ctx.Provider>
}
