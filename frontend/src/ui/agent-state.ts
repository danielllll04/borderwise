import type { AgentBackendApi, AgentMessageInput, AgentProposalPreview } from '@/api/types'

export type SaveAttempt = {preview_token: string; reserve_acknowledgement?: {acknowledged: true; check_token: string}}
export type ProposalState = {attempt?: SaveAttempt; saved?: {plan: {plan_id: string}}}
export type AgentLocalState = {session: string; pending?: AgentMessageInput; receipt?: {draft_id: string; version: number}; proposals: Record<string, ProposalState>; resolved: Record<string, string>}
const memory = new Map<string, AgentLocalState>()
const creations = new Map<string, Promise<string>>()
export function readState(key: string): AgentLocalState {
  if (memory.has(key)) return memory.get(key)!
  let value: AgentLocalState = {session: '', proposals: {}, resolved: {}}
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (saved && typeof saved === 'object' && 'session' in saved && typeof saved.session === 'string' && 'proposals' in saved && 'resolved' in saved) value = saved as AgentLocalState
  } catch { /* Unavailable storage is handled explicitly before submitting an action. */ }
  memory.set(key, value)
  return value
}
export function writeState(key: string, value: AgentLocalState) {
  // Tab-scoped private workflow state, never credentials, hidden prompts or provider replies.
  // Fail closed before sending if durable retry details cannot be retained across reload.
  sessionStorage.setItem(`${key}:session:${value.session}`, JSON.stringify(value))
  sessionStorage.setItem(key, JSON.stringify(value))
  memory.set(key, value)
}
export function resumeState(key: string, id: string): AgentLocalState {
  const current = readState(key)
  if (current.session === id) return current
  const saved = sessionStorage.getItem(`${key}:session:${id}`)
  return saved ? JSON.parse(saved) as AgentLocalState : {session: id, proposals: {}, resolved: {}}
}
export async function initialSession(api: AgentBackendApi) {
  const saved = readState(api.storageNamespace).session
  if (saved) return saved
  let pending = creations.get(api.storageNamespace)
  if (!pending) {
    pending = api.create().then(session => {
      writeState(api.storageNamespace, {session: session.session_id, proposals: {}, resolved: {}})
      return session.session_id
    }).finally(() => creations.delete(api.storageNamespace))
    creations.set(api.storageNamespace, pending)
  }
  return pending
}
export function saveAttempt(review: AgentProposalPreview): SaveAttempt {
  return {preview_token: review.preview.check_token, ...(review.preview.requires_reserve_acknowledgement ? {reserve_acknowledgement: {acknowledged: true, check_token: review.preview.check_token}} : {})}
}
