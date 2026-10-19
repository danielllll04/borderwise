import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import { agentParams } from '../agent/inputs.js';
import { MAX_RECEIPT_BYTES } from './uploads.js';
import type { ReceiptService } from './service.js';

const empty = z.object({}).strict();
const draftParams = agentParams.extend({ draftId: z.string().uuid() });
const receiptProposalParams = agentParams.extend({ proposalId: z.string().uuid() });
export function registerReceiptRoutes(app: FastifyInstance, receipts: ReceiptService) {
  app.addContentTypeParser(['image/jpeg', 'image/png'], { parseAs: 'buffer', bodyLimit: MAX_RECEIPT_BYTES }, (_request, body, done) => done(null, body));
  app.post('/api/agent/sessions/:sessionId/attachments', { bodyLimit: MAX_RECEIPT_BYTES }, request => {
    empty.parse(request.query);
    if (!Buffer.isBuffer(request.body)) throw new AppError(415, 'UNSUPPORTED_RECEIPT_IMAGE', 'Send raw image/jpeg or image/png bytes; paths, URLs and JSON upload bodies are not accepted');
    return receipts.uploads.upload(agentParams.parse(request.params).sessionId, request.headers['content-type']?.split(';')[0]?.trim() ?? '', request.body);
  });
  app.post('/api/agent/sessions/:sessionId/receipts', request => {
    empty.parse(request.query);
    const input = z.object({ attachment_id: z.string().uuid() }).strict().parse(request.body);
    return receipts.extract(agentParams.parse(request.params).sessionId, input.attachment_id);
  });
  app.get('/api/agent/sessions/:sessionId/receipts/:draftId', request => {
    empty.parse(request.query); const args = draftParams.parse(request.params); return receipts.review(args.sessionId, args.draftId);
  });
  app.patch('/api/agent/sessions/:sessionId/receipts/:draftId', request => {
    empty.parse(request.query); const args = draftParams.parse(request.params); return receipts.edit(args.sessionId, args.draftId, request.body);
  });
  app.post('/api/agent/sessions/:sessionId/receipts/:draftId/allocations', request => {
    empty.parse(request.query); const args = draftParams.parse(request.params); return receipts.propose(args.sessionId, args.draftId, request.body);
  });
  app.get('/api/agent/sessions/:sessionId/receipt-proposals/:proposalId', request => {
    empty.parse(request.query); const args = receiptProposalParams.parse(request.params); return receipts.proposal(args.sessionId, args.proposalId);
  });
  app.post('/api/agent/sessions/:sessionId/receipt-proposals/:proposalId/confirm', request => {
    empty.parse(request.query); const args = receiptProposalParams.parse(request.params); return receipts.confirm(args.sessionId, args.proposalId, request.body);
  });
}
