import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { receivableParams } from './contracts.js';
import { SettlementService } from './service.js';

const empty = z.object({}).strict();
export function registerSettlementRoutes(app: FastifyInstance, db: PrismaClient) {
  const settlements = new SettlementService(db);
  app.get('/api/receivables', request => settlements.list(request.query));
  app.get('/api/receivables/:receivableId', request => {
    empty.parse(request.query); return settlements.read(receivableParams.parse(request.params).receivableId);
  });
  app.get('/api/receivables/:receivableId/settlements', request => settlements.history(receivableParams.parse(request.params).receivableId, request.query));
  app.post('/api/receivables/:receivableId/settlements/confirm', request => {
    empty.parse(request.query); return settlements.confirm(receivableParams.parse(request.params).receivableId, request.body);
  });
}
