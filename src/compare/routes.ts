import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { decisionSchema } from '../agent/inputs.js';
import { configuredCompare } from '../integrations/configured-compare.js';
import { readComparison } from '../integrations/comparison-service.js';
import { PlanService } from '../services/plans.js';
import { AppError } from '../domain/errors.js';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';

const inputSchema = decisionSchema.required({ objective: true, amount: true, amount_basis: true, funding_account: true, destination_account: true })
  .extend({ objective: z.enum(['exchange', 'atm_withdrawal', 'card']) }).strict();

/** No model inference or financial writes. Existing proposal preview/Save owns the explicit handoff. */
export function registerCompareRoutes(app: FastifyInstance, db: PrismaClient) {
  const adapter = configuredCompare();
  const plans = new PlanService(db);
  app.post('/api/compare/quotes', async request => {
    z.object({}).strict().parse(request.query);
    const input = inputSchema.parse(request.body);
    if (input.objective === 'card') return { status: 'unsupported', reason: 'Card-purchase comparison and planning are unsupported by the integrated Node contract.', options: [] };
    const decision = decisionSchema.parse(input);
    if (adapter.requiresCardNetwork?.(decision) && !decision.card_network) throw new AppError(400, 'CARD_NETWORK_REQUIRED', 'Select a card network or explicitly unknown before comparing ATMs.');
    if (!await db.profile.findUnique({ where: { id: DEMO_PROFILE_ID }, select: { id: true } })) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Configure the local demo profile before comparing.');
    const result = await readComparison(adapter, decision);
    if (result.status !== 'ready') return result;
    const options = await Promise.all(result.options.map(async option => {
      let preview = null;
      let blockingError: string | null = null;
      try { preview = await plans.preview(option.selection); }
      catch (error) { if (!(error instanceof AppError)) throw error; blockingError = error.code; }
      return { ...option, snapshot_id: randomUUID(), proposal_id: preview ? randomUUID() : null, preview, blocking_error: blockingError };
    }));
    const sessionId = randomUUID();
    await db.$transaction(async tx => {
      await tx.agentSession.create({ data: { id: sessionId, profileId: DEMO_PROFILE_ID } });
      for (const option of options) {
        await tx.agentQuoteSnapshot.create({ data: {
          id: option.snapshot_id, sessionId, quoteId: option.selection.quote.quote_id,
          selectionJson: JSON.stringify(option.selection),
          assumptionsJson: JSON.stringify({ ...option.assumptions, request_decision: decision, origin: 'manual_compare', ...(option.integration ? { integration: option.integration } : {}) }),
        } });
        if (option.proposal_id && option.preview) await tx.agentProposal.create({ data: {
          id: option.proposal_id, sessionId, snapshotId: option.snapshot_id,
          previewJson: JSON.stringify(option.preview), contextToken: option.preview.check_token,
        } });
      }
    });
    return { ...result, session_id: sessionId, options };
  });
}
