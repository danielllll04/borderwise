import type * as T from './types'
import { ApiError } from './types'

export interface ReceiptInput { paid_from: 'MYR_BANK' | 'KRW_CARD' | 'KRW_CASH'; total: number; debts: { debtor: string; amount: number }[] }
/** Every screen talks to this interface only. Swap implementations in createApi(). */
export interface BorderWiseApi {
  mode: 'live' | 'mock'
  compare?: T.ManualCompareApi
  homeBackend?: T.HomeBackendApi
  agentBackend?: T.AgentBackendApi
  home(): Promise<T.HomeData>
  ledger(limit?: number): Promise<{ items: T.LedgerItem[]; next_cursor: string | null }>
  listPlans(status?: string): Promise<{ items: T.PlanResponse[] }>
  previewPlan(sel: T.Selection): Promise<T.Assessment>
  savePlan(sel: T.Selection, key: string, ack?: { acknowledged: true; check_token: string }): Promise<T.PlanResponse>
  cancelPlan(id: string): Promise<T.PlanResponse>
  completionPreview(id: string, actual: T.ActualActivity): Promise<T.Assessment>
  confirmPlan(id: string, actual: T.ActualActivity, key: string, ack?: { acknowledged: true; check_token: string }): Promise<unknown>
  // Split: no backend route yet (README) – mock-backed until one exists.
  receivables(): Promise<T.Receivable[]>
  settleReceivable(id: string, cleared: T.Money, received: T.Money, key: string): Promise<void>
  /** Confirmed receipt: books ONLY the payer's expense; friends' shares become KRW receivables (never income). */
  confirmReceipt(r: ReceiptInput, key: string): Promise<void>
  // Agent
  agentCreateSession(): Promise<{ session_id: string }>
  agentSend(sid: string, message: string, key: string, decision?: T.AgentDecision): Promise<{ response: T.AgentResponse }>
  agentProposalPreview(sid: string, pid: string): Promise<T.Assessment>
  agentProposalSave(sid: string, pid: string, key: string, token: string, ack?: { acknowledged: true; check_token: string }): Promise<T.PlanResponse>
}

export const uid = () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)

export function liveApi(base: string): BorderWiseApi {
  // Public routing only: credentials, query strings and fragments never belong in browser config.
  if (base) {
    const url = new URL(base)
    if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use a public HTTPS backend URL or loopback HTTP URL without credentials, query or fragment.')
    base = url.toString().replace(/\/$/, '')
  }
  async function req<R>(method: string, path: string, body?: unknown): Promise<R> {
    let res: Response
    try {
      res = await fetch(base + path, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
    } catch { throw new ApiError('NETWORK', `Cannot reach backend at ${base}. Is it running (and is CORS enabled)?`) }
    const json = await res.json().catch(() => null)
    if (!res.ok) { const e = json?.error; throw new ApiError(e?.code ?? 'HTTP_' + res.status, e?.message ?? res.statusText, e?.details, res.status) }
    return json as R
  }
  const a = (sid: string) => `/api/agent/sessions/${sid}`
  return {
    mode: 'live',
    agentBackend: {
      storageNamespace: `borderwise-agent:${base || 'same-origin'}:v1`,
      create: () => req('POST', '/api/agent/sessions', {}),
      session: id => req('GET', a(encodeURIComponent(id))),
      history: (id, cursor) => req('GET', `${a(encodeURIComponent(id))}/history?limit=20${cursor ? `&cursor=${cursor}` : ''}`),
      message: (id, input) => req('POST', `${a(encodeURIComponent(id))}/messages`, input),
      preview: (id, proposal) => req('POST', `${a(encodeURIComponent(id))}/proposals/${encodeURIComponent(proposal)}/preview`, {}),
      save: (id, proposal, input) => req('POST', `${a(encodeURIComponent(id))}/proposals/${encodeURIComponent(proposal)}/save`, input),
    },
    homeBackend: {
      summary: () => req('GET', '/api/home'),
      ledger: cursor => req('GET', `/api/ledger?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
      pending: cursor => req('GET', `/api/plans?status=pending&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
      assessments: cursor => req('GET', `/api/plans/assessments?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
      readPlan: id => req('GET', `/api/plans/${encodeURIComponent(id)}`),
      preview: (id, actual) => req('POST', `/api/plans/${encodeURIComponent(id)}/completion-preview`, { actual }),
      confirm: (id, input) => req('POST', `/api/plans/${encodeURIComponent(id)}/confirm`, input),
      cancel: id => req('POST', `/api/plans/${encodeURIComponent(id)}/cancel`, {}),
    },
    compare: {
      quotes: input => req('POST', '/api/compare/quotes', input),
      preview: (sid, pid) => req('POST', `${a(sid)}/proposals/${pid}/preview`, {}),
      save: (sid, pid, key, token, ack) => req('POST', `${a(sid)}/proposals/${pid}/save`, { frontend_action: 'save_pending_plan', idempotency_key: key, preview_token: token, ...(ack ? { reserve_acknowledgement: ack } : {}) }),
    },
    home: () => req('GET', '/api/home'),
    ledger: (l = 20) => req('GET', `/api/ledger?limit=${l}`),
    listPlans: s => req('GET', `/api/plans${s ? `?status=${s}` : ''}`),
    previewPlan: sel => req('POST', '/api/plans/preview', sel), // body is {quote, context} directly
    savePlan: (sel, key, ack) => req('POST', '/api/plans', { selection: sel, idempotency_key: key, ...(ack ? { reserve_acknowledgement: ack } : {}) }),
    cancelPlan: id => req('POST', `/api/plans/${id}/cancel`, {}),
    completionPreview: (id, actual) => req('POST', `/api/plans/${id}/completion-preview`, { actual }),
    confirmPlan: (id, actual, key, ack) => req('POST', `/api/plans/${id}/confirm`, { actual, confirmed: true, idempotency_key: key, ...(ack ? { reserve_acknowledgement: ack } : {}) }),
    receivables: async () => [], settleReceivable: async () => { throw new ApiError('NOT_IMPLEMENTED', 'Split settlement has no backend route yet') },
    confirmReceipt: async () => { throw new ApiError('NOT_IMPLEMENTED', 'Receipt/split confirmation has no backend route yet') },
    agentCreateSession: () => req('POST', '/api/agent/sessions', {}),
    agentSend: (sid, message, key, decision) => req('POST', `${a(sid)}/messages`, { message, idempotency_key: key, ...(decision ? { decision } : {}) }),
    agentProposalPreview: (sid, pid) => req('POST', `${a(sid)}/proposals/${pid}/preview`, {}),
    agentProposalSave: (sid, pid, key, token, ack) => req('POST', `${a(sid)}/proposals/${pid}/save`, { frontend_action: 'save_pending_plan', idempotency_key: key, preview_token: token, ...(ack ? { reserve_acknowledgement: ack } : {}) }),
  }
}
