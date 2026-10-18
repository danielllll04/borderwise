/** LOCAL DEMO WRITE: sends fictional user-reported completion to an already running demo API. */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DEMO_EXCHANGE_SELECTION } from '../src/integrations/compare-fixture.js';

const base = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3000';
const runId = randomUUID();
interface DemoResponse {
  plan?: { plan_id: string; status: string };
  check_token?: string;
  requires_reserve_acknowledgement?: boolean;
  posting?: { activity_id: string; entries: { type: string }[] };
  [key: string]: unknown;
}
async function request(path: string, body?: unknown): Promise<DemoResponse> {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json() as DemoResponse;
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result)}`);
  return result;
}
function acknowledgement(preview: DemoResponse) {
  if (!preview.requires_reserve_acknowledgement) return {};
  console.log('Reserve warning:', JSON.stringify(preview, null, 2));
  if (process.env.DEMO_ACKNOWLEDGE_RESERVE !== 'true') {
    throw new Error('Demo stopped at reserve warning. Review it; use DEMO_ACKNOWLEDGE_RESERVE=true only to explicitly acknowledge fictional demo debits.');
  }
  return { reserve_acknowledgement: { acknowledged: true, check_token: preview.check_token } };
}

try {
  console.log(`SIMULATED LOCAL DEMO INPUTS. Each invocation creates new plans (${runId}). No financial transfer is executed.`);
  const preview = await request('/api/plans/preview', DEMO_EXCHANGE_SELECTION);
  console.log('Modal A:', JSON.stringify(preview, null, 2));
  const saved = await request('/api/plans', {
    selection: DEMO_EXCHANGE_SELECTION, idempotency_key: `${runId}:save`, ...acknowledgement(preview),
  });
  const planId = saved.plan!.plan_id;
  console.log('Pending; Not completed yet needs no request:', planId);
  const actual = {
    activity_type: 'exchange', funding_account: 'myr_funding', destination_account: 'krw_card',
    principal: { amount_minor: 10200, currency: 'MYR' }, amount_received: { amount_minor: 30100, currency: 'KRW' },
    fees: [{ label: 'Fictional actual fee', account_id: 'myr_funding', Money: { amount_minor: 120, currency: 'MYR' } }],
    completed_at: new Date().toISOString(),
  };
  const completion = await request(`/api/plans/${planId}/completion-preview`, { actual });
  console.log('Modal B (actual vs quoted):', JSON.stringify(completion, null, 2));
  const confirmBody = { actual, confirmed: true, idempotency_key: `${runId}:confirm`, ...acknowledgement(completion) };
  const completed = await request(`/api/plans/${planId}/confirm`, confirmBody);
  const replayed = await request(`/api/plans/${planId}/confirm`, confirmBody);
  console.log('Completion and exact replay use the same activity:', completed.posting?.activity_id, replayed.posting?.activity_id);
  console.log('Separate entries:', completed.posting?.entries.map(entry => entry.type));
  const nextPreview = await request('/api/plans/preview', DEMO_EXCHANGE_SELECTION);
  const cancellable = await request('/api/plans', {
    selection: DEMO_EXCHANGE_SELECTION, idempotency_key: `${runId}:cancel-save`, ...acknowledgement(nextPreview),
  });
  const cancelled = await request(`/api/plans/${cancellable.plan!.plan_id}/cancel`, {});
  const cancelledAgain = await request(`/api/plans/${cancellable.plan!.plan_id}/cancel`, {});
  console.log('Repeated cancellation:', cancelled.plan?.status, cancelledAgain.plan?.status);
  console.log('Current Home:', JSON.stringify(await request('/api/home'), null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
