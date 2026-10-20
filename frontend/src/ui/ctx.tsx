import { createContext, useContext } from 'react'
import type { BorderWiseApi } from '@/api/api'
import type { Lang } from './i18n'
export type AppContext = { api: BorderWiseApi; rev: number; bump: () => void; go: (t: string) => void; lang: Lang; setLang: (lang: Lang) => void; t: (s: string) => string }
export const Ctx = createContext<AppContext>(null as unknown as AppContext)
export const useApp = () => useContext(Ctx)
