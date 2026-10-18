import type { PrismaClient } from '@prisma/client';
import { AppError } from '../domain/errors.js';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { payloadHash } from '../domain/idempotency.js';
import { PlanService } from '../services/plans.js';
import { selectionSchema } from '../services/plan-inputs.js';
import { proposalSaveSchema } from './inputs.js';
import type { ProposalCard } from './contracts.js';

/** Frontend handoff service. Its Save operation is deliberately absent from model tools. */
export class ProposalService {
  private readonly plans: PlanService;
  constructor(private readonly db: PrismaClient) { this.plans = new PlanService(db); }

  async find(sessionId: string, proposalId: string) {
    const row = await this.db.agentProposal.findFirst({
      where: { id: proposalId, sessionId, session: { profileId: DEMO_PROFILE_ID } }, include: { snapshot: true },
    });
    if (!row || row.snapshot.sessionId !== sessionId) throw new AppError(404, 'PROPOSAL_NOT_FOUND', 'Proposal does not exist in this demo session');
    return row;
  }

  async read(sessionId: string, proposalId: string): Promise<ProposalCard> {
    const row = await this.find(sessionId, proposalId);
    let stale = true;
    try { stale = (await this.plans.preview(selectionSchema.parse(JSON.parse(row.snapshot.selectionJson) as unknown))).check_token !== row.contextToken; }
    catch (error) { if (!(error instanceof AppError)) throw error; }
    return {
      type: 'proposed_plan', proposal_id: row.id, snapshot_id: row.snapshotId, quote_id: row.snapshot.quoteId,
      preview: JSON.parse(row.previewJson) as ProposalCard['preview'], stale, next_action: 'preview_before_frontend_save',
    };
  }

  async preview(sessionId: string, proposalId: string) {
    const row = await this.find(sessionId, proposalId);
    const selection = selectionSchema.parse(JSON.parse(row.snapshot.selectionJson) as unknown);
    const preview = await this.plans.preview(selection);
    await this.db.agentProposalPreview.upsert({
      where: { proposalId_token: { proposalId, token: preview.check_token } },
      create: { proposalId, token: preview.check_token }, update: {},
    });
    return { proposal_id: proposalId, quote_id: row.snapshot.quoteId, selection, preview, next_action: 'tap_save_pending_plan' };
  }

  async saveFromFrontend(sessionId: string, proposalId: string, raw: unknown) {
    const input = proposalSaveSchema.parse(raw);
    const row = await this.find(sessionId, proposalId);
    const reviewed = await this.db.agentProposalPreview.findUnique({ where: { proposalId_token: { proposalId, token: input.preview_token } } });
    if (!reviewed) throw new AppError(409, 'PROPOSAL_PREVIEW_REQUIRED', 'Re-preview this stored proposal through its frontend preview endpoint before tapping Save');
    return this.plans.save({
      selection: selectionSchema.parse(JSON.parse(row.snapshot.selectionJson) as unknown),
      idempotency_key: `agent-save:${payloadHash({ sessionId, proposalId, key: input.idempotency_key })}`,
      ...(input.reserve_acknowledgement ? { reserve_acknowledgement: input.reserve_acknowledgement } : {}),
    }, input.preview_token);
  }
}
