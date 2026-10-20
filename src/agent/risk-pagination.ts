import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';
import { PendingPlanRiskService } from '../services/pending-plan-risk.js';

export const riskPageInputSchema = z.object({
  limit: z.number().int().min(1).max(5).default(3),
  continuation: z.string().min(1).max(96).optional(),
}).strict();
type Recovery = 'INVALID_PAGINATION_INPUT' | 'UNKNOWN_OR_STALE_CONTINUATION' | 'EXPIRED_CONTINUATION' | 'PAGE_SIZE_CHANGED' | 'CURSOR_UNAVAILABLE' | 'FINANCIAL_CONTEXT_CHANGED';
export type RiskPageRequest = z.infer<typeof riskPageInputSchema> & { restart_reason?: Recovery; use_reference_limit?: true };
export interface RiskPaginationNotice {
  status: 'first_page' | 'continued' | 'restarted' | 'unavailable';
  next_continuation: string | null;
  reason?: Recovery;
}
const stateSchema = z.object({
  flow_id: z.string().uuid(), revision: z.number().int().nonnegative(),
  reference: z.string().nullable(), cursor: z.string().uuid().nullable(),
  limit: z.number().int().min(1).max(5), fingerprint: z.string(), expires_at: z.number(),
});
type PageState = z.infer<typeof stateSchema>;

/** Model capabilities only; the existing Home assessment/cursor contract is unchanged. */
export class RiskPagination {
  private loaded = false;
  private state: PageState | null = null;
  constructor(private readonly db: PrismaClient, private readonly sessionId: string,
    private readonly service = new PendingPlanRiskService(db)) {}

  parse(raw: unknown): RiskPageRequest {
    const input = riskPageInputSchema.safeParse(raw);
    if (input.success) return { ...input.data, ...(input.data.continuation && raw && typeof raw === 'object' && !Object.hasOwn(raw, 'limit') ? { use_reference_limit: true as const } : {}) };
    // Retire legacy cursor arguments and recover malformed pagination without losing the risk read.
    return { limit: 3, restart_reason: 'INVALID_PAGINATION_INPUT' };
  }

  private async load() {
    if (this.loaded) return this.state;
    const rows = await this.db.agentToolExecution.findMany({
      where: { toolName: 'read_pending_plan_risks', summaryJson: { contains: '"_risk_page":' },
        turn: { sessionId: this.sessionId, status: 'completed', httpStatus: 200, session: { profileId: DEMO_PROFILE_ID } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 8,
      select: { summaryJson: true },
    });
    // A turn has at most eight executions. Revisions order same-millisecond records reliably.
    for (const row of rows) {
      try {
        const saved = stateSchema.safeParse((JSON.parse(row.summaryJson) as { _risk_page?: unknown })._risk_page);
        if (saved.success && (!this.state || saved.data.revision > this.state.revision)) this.state = saved.data;
      } catch { /* Old execution metadata is not a continuation capability. */ }
    }
    this.loaded = true;
    return this.state;
  }

  async continuation() {
    const state = await this.load();
    return state?.reference && state.expires_at > Date.now() ? { continuation: state.reference, limit: state.limit } : null;
  }

  async read(input: RiskPageRequest) {
    const previous = await this.load();
    const limit = input.use_reference_limit && previous && previous.reference === input.continuation ? previous.limit : input.limit;
    let reason = input.restart_reason;
    let cursor: string | undefined;
    if (input.continuation && !reason) {
      if (!previous?.reference || previous.reference !== input.continuation) reason = 'UNKNOWN_OR_STALE_CONTINUATION';
      else if (previous.expires_at <= Date.now()) reason = 'EXPIRED_CONTINUATION';
      else if (previous.limit !== limit) reason = 'PAGE_SIZE_CHANGED';
      else cursor = previous.cursor ?? undefined;
    }
    let data;
    try { data = await this.service.list({ limit, ...(cursor ? { cursor } : {}) }); }
    catch (error) {
      if (!(error instanceof AppError) || error.code !== 'INVALID_CURSOR') throw error;
      reason = 'CURSOR_UNAVAILABLE'; cursor = undefined;
      data = await this.service.list({ limit });
    }
    if (cursor && data.status === 'available' && data.financial_context_fingerprint !== previous?.fingerprint) {
      reason = 'FINANCIAL_CONTEXT_CHANGED'; cursor = undefined;
      data = await this.service.list({ limit });
    }
    if (data.status !== 'available') return { data,
      pagination: { status: 'unavailable', next_continuation: null, ...(reason ? { reason } : {}) } as RiskPaginationNotice,
      metadata: null,
    };
    const continued = Boolean(cursor && !reason);
    const metadata: PageState = {
      flow_id: continued && previous ? previous.flow_id : randomUUID(), revision: (previous?.revision ?? 0) + 1,
      reference: data.next_cursor ? `risk-page:${randomUUID()}` : null, cursor: data.next_cursor,
      limit, fingerprint: data.financial_context_fingerprint,
      expires_at: continued && previous ? previous.expires_at : Date.now() + 15 * 60 * 1000,
    };
    this.state = metadata;
    return { data, pagination: { status: reason ? 'restarted' : continued ? 'continued' : 'first_page',
      next_continuation: metadata.reference, ...(reason ? { reason } : {}) } as RiskPaginationNotice, metadata };
  }
}
