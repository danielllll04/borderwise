import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AgentService } from './service.js';
import { agentParams, proposalParams } from './inputs.js';
import { ReceiptService } from '../receipts/service.js';

const empty = z.object({}).strict();
export function registerAgentRoutes(app: FastifyInstance, db: PrismaClient, receipts = new ReceiptService(db)) {
  const agent = new AgentService(db, undefined, undefined, receipts);
  app.get('/api/agent', request => { empty.parse(request.query); return agent.availability(); });
  app.post('/api/agent/sessions', request => { empty.parse(request.query); empty.parse(request.body ?? {}); return agent.createSession(); });
  app.get('/api/agent/sessions/:sessionId', async request => {
    empty.parse(request.query);
    const session = await agent.session(agentParams.parse(request.params).sessionId);
    return { session_id: session.id, active_proposal_id: session.activeProposalId, agent: agent.availability() };
  });
  app.post('/api/agent/sessions/:sessionId/messages', async (request, reply) => {
    empty.parse(request.query);
    const result = await agent.message(agentParams.parse(request.params).sessionId, request.body);
    if (result.httpStatus >= 400) return reply.code(result.httpStatus).send({ error: {
      code: result.result.response.error_code, message: result.result.response.explanation,
      details: result.result, request_id: request.id,
    } });
    return result.result;
  });
  app.get('/api/agent/sessions/:sessionId/history', request => agent.history(agentParams.parse(request.params).sessionId, request.query));
  app.get('/api/agent/sessions/:sessionId/proposals/:proposalId', request => {
    empty.parse(request.query); const args = proposalParams.parse(request.params);
    return agent.proposals.read(args.sessionId, args.proposalId);
  });
  app.post('/api/agent/sessions/:sessionId/proposals/:proposalId/preview', request => {
    empty.parse(request.query); empty.parse(request.body ?? {}); const args = proposalParams.parse(request.params);
    return agent.proposals.preview(args.sessionId, args.proposalId);
  });
  app.post('/api/agent/sessions/:sessionId/proposals/:proposalId/save', request => {
    empty.parse(request.query); const args = proposalParams.parse(request.params);
    return agent.proposals.saveFromFrontend(args.sessionId, args.proposalId, request.body);
  });
}
