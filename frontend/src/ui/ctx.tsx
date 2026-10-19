import { createContext, useContext } from 'react'
import type { BorderWiseApi } from '@/api/api'
import type { Lang } from './i18n'
export const Ctx = createContext<{ api: BorderWiseApi; rev: number; bump: () => void; go: (t: string) => void; lang: Lang; setLang: (lang: Lang) => void; t: (s: string) => string }>(null as any)
export const useApp = () => useContext(Ctx)
