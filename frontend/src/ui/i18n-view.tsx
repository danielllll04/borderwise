import type { ReactNode } from 'react'
import { useApp } from './ctx'

/** Localized interface copy only; never rewrite stored messages or financial payloads. */
export default function UI({text}: {text: ReactNode}) {
  const {t} = useApp()
  return typeof text === 'string' ? t(text) : text
}
