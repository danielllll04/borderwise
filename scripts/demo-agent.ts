/** LOCAL DEMO: chat is read/preview only. Optional Save is a separate explicit frontend API action. */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { AgentMessageResult } from '../src/agent/contracts.js';

const base = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3000';
async function request(path: string, body?: unknown) {
  const response = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result)}`);
  return result;
}
try {
  console.log('Agent configuration:', await request('/api/agent'));
  const session = await request('/api/agent/sessions', {}) as { session_id: string };
  const prefix = `/api/agent/sessions/${session.session_id}`;
  const before = JSON.stringify(await request('/api/balances'));
  const send = async (message: string, decision?: unknown) => {
    const body = { message, idempotency_key: randomUUID(), ...(decision ? { decision } : {}) };
    const result = await request(prefix + '/messages', body) as AgentMessageResult;
    console.log(JSON.stringify(result, null, 2));
    return result;
  };
  await send('I need cash for tonight');
  await send('Use my card account for this cash target', {
    objective: 'atm_withdrawal', amount: { amount_minor: 90000, currency: 'KRW' }, amount_basis: 'destination_target',
    funding_account: 'krw_card', destination_account: 'krw_cash',
  });
  const compared = await send('I want to exchange MYR 300');
  await send('yes save it');
  console.log('Chat left balances unchanged:', before === JSON.stringify(await request('/api/balances')));
  if (process.env.DEMO_AGENT_SAVE === 'true') {
    const proposal = compared.response.cards.find(card => card.type === 'proposed_plan');
    if (!proposal || proposal.type !== 'proposed_plan') throw new Error('No supported proposal is available to save');
    const preview = await request(`${prefix}/proposals/${proposal.proposal_id}/preview`, {}) as { preview: { check_token: string; requires_reserve_acknowledgement: boolean } };
    if (preview.preview.requires_reserve_acknowledgement) throw new Error('Save demo stopped at the reserve warning; use the normal frontend acknowledgement flow after review.');
    console.log('EXPLICIT FRONTEND SAVE ACTION:', await request(`${prefix}/proposals/${proposal.proposal_id}/save`, {
      frontend_action: 'save_pending_plan', idempotency_key: randomUUID(), preview_token: preview.preview.check_token,
    }));
  }
  console.log('History:', JSON.stringify(await request(prefix + '/history?limit=10'), null, 2));
} catch (error) { console.error(error); process.exitCode = 1; }
