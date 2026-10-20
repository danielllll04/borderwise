import Fastify from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z, ZodError } from 'zod';
import { AppError } from './domain/errors.js';
import { HomeService, profileUpdateSchema } from './services/home.js';
import { PlanService } from './services/plans.js';
import { completionPreviewSchema } from './services/plan-inputs.js';
import { registerAgentRoutes } from './agent/routes.js';
import { SharedExpenseService } from './services/shared-expenses.js';
import { PendingPlanRiskService } from './services/pending-plan-risk.js';
import { ReceiptService, type ReceiptOptions } from './receipts/service.js';
import { registerReceiptRoutes } from './receipts/routes.js';
import { registerSettlementRoutes } from './settlements/routes.js';
import { registerCompareRoutes } from './compare/routes.js';
import { registerAtmAlertRoutes } from './compare/alerts-routes.js';

const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
}).strict();
const emptyQuery = z.object({}).strict();
const planParams = z.object({ planId: z.string().uuid() }).strict();

export function buildApp(db: PrismaClient, logger = true, receiptOptions: ReceiptOptions = {}) {
  const app = Fastify({
    logger: logger ? { level: process.env.LOG_LEVEL ?? 'info' } : false,
    bodyLimit: 32 * 1024,
  });
  const home = new HomeService(db);
  const plans = new PlanService(db);
  const sharedExpenses = new SharedExpenseService(db);
  const pendingPlanRisk = new PendingPlanRiskService(db);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: {
        code: 'VALIDATION_ERROR', message: 'Request validation failed',
        details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
        request_id: request.id,
      } });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: {
        code: error.code, message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}), request_id: request.id,
      } });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P1008', 'P2028', 'P2034'].includes(error.code)) {
      return reply.code(503).send({ error: { code: 'DATABASE_BUSY', message: 'Database is busy; retry the request', request_id: request.id } });
    }
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: {
        code: 'INVALID_REQUEST', message: error.message, request_id: request.id,
      } });
    }
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred', request_id: request.id } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: {
    code: 'NOT_FOUND', message: 'Route not found', request_id: request.id,
  } }));

  app.get('/health', () => ({ status: 'ok', authentication: 'not-implemented', mode: 'local-demo' }));
  app.get('/api/profile', request => { emptyQuery.parse(request.query); return home.profile(); });
  app.patch('/api/profile', request => { emptyQuery.parse(request.query); return home.updateProfile(profileUpdateSchema.parse(request.body)); });
  app.get('/api/balances', request => { emptyQuery.parse(request.query); return home.balances(); });
  app.get('/api/ledger', request => {
    const query = ledgerQuerySchema.parse(request.query);
    return home.ledger(query.limit, query.cursor);
  });
  app.get('/api/home', request => { emptyQuery.parse(request.query); return home.summary(); });
  app.post('/api/shared-expenses/confirm', request => {
    emptyQuery.parse(request.query); return sharedExpenses.confirm(request.body);
  });
  app.post('/api/plans/preview', request => { emptyQuery.parse(request.query); return plans.preview(request.body); });
  app.post('/api/plans', request => { emptyQuery.parse(request.query); return plans.save(request.body); });
  app.get('/api/plans', request => plans.list(request.query));
  app.get('/api/plans/assessments', async (request, reply) => {
    const result = await pendingPlanRisk.list(request.query);
    if (result.status === 'unavailable') return reply.code(503).send({ error: {
      code: result.code, message: result.reason, details: result, request_id: request.id,
    } });
    return result;
  });
  app.get('/api/plans/:planId', request => {
    emptyQuery.parse(request.query); return plans.read(planParams.parse(request.params).planId);
  });
  app.post('/api/plans/:planId/cancel', request => {
    emptyQuery.parse(request.query); emptyQuery.parse(request.body ?? {});
    return plans.cancel(planParams.parse(request.params).planId);
  });
  app.post('/api/plans/:planId/completion-preview', request => {
    emptyQuery.parse(request.query);
    return plans.completionPreview(planParams.parse(request.params).planId, completionPreviewSchema.parse(request.body).actual);
  });
  app.post('/api/plans/:planId/confirm', request => {
    emptyQuery.parse(request.query); return plans.confirm(planParams.parse(request.params).planId, request.body);
  });
  const receipts = new ReceiptService(db, receiptOptions);
  registerSettlementRoutes(app, db);
  registerCompareRoutes(app, db);
  registerAtmAlertRoutes(app);
  registerReceiptRoutes(app, receipts);
  registerAgentRoutes(app, db, receipts);
  return app;
}
