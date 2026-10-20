import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import { badgeSchema, positiveMoneySchema } from '../domain/validation.js';
import { configuredCompare } from '../integrations/configured-compare.js';
import { readComparison } from '../integrations/comparison-service.js';
import { SteveHttpClient } from '../integrations/steve-http.js';

const rate = z.number().finite().positive().max(1e9);
const alertInput = z.object({ pair: z.literal('MYR/KRW'), target_rate: rate, direction: z.enum(['above', 'below']).default('above') }).strict();
const alertResponse = z.object({
  pair: z.literal('MYR/KRW'), triggered: z.boolean(), current_rate: rate, target_rate: rate,
  direction: z.enum(['above', 'below']), history_7d: z.array(rate).min(1).max(31),
  planned_amount: positiveMoneySchema.extend({currency: z.literal('MYR')}),
  estimated_proceeds: positiveMoneySchema.extend({currency: z.literal('KRW')}),
  recommendation: z.string().min(1).max(2000), badge: badgeSchema.extend({status: z.literal('Simulated')}),
}).strict();

/** Read/preview only. No database, proposals, alert subscription or financial posting. */
export function registerAtmAlertRoutes(app: FastifyInstance) {
  const compare = configuredCompare();
  app.get('/api/atms', async request => {
    const query = z.object({card_network: z.enum(['visa', 'mastercard', 'unionpay', 'plus', 'unknown']).default('unknown')}).strict().parse(request.query);
    const context = {objective: 'atm_withdrawal' as const, amount: {amount_minor: 100000, currency: 'KRW' as const}, amount_basis: 'destination_target' as const, funding_account: 'myr_funding' as const, destination_account: 'krw_cash' as const, card_network: query.card_network};
    const result = await readComparison(compare, context);
    if (result.status !== 'ready') return result;
    return {...result, pricing_context: context, options: result.options.filter(option => option.atm_info).map(({selection, rank, atm_info, compatibility}) => ({selection, rank, atm_info, compatibility}))};
  });
  app.post('/api/alerts/check', async request => {
    z.object({}).strict().parse(request.query);
    const input = alertInput.parse(request.body);
    const http = new SteveHttpClient(process.env.STEVE_COMPARE_BASE_URL ?? process.env.STEVE_BASE_URL, process.env.STEVE_COMPARE_TIMEOUT_MS ?? '5000', 'ALERT');
    const raw = await http.request('/api/alerts/check', input);
    const parsed = alertResponse.safeParse(raw);
    if (!parsed.success || parsed.data.target_rate !== input.target_rate || parsed.data.direction !== input.direction) throw new AppError(502, 'ALERT_INVALID_RESPONSE', 'Steve returned an invalid target-rate check. No result was trusted.');
    return parsed.data;
  });
}
