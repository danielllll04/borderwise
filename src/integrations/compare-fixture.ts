import type { Selection } from '../services/plan-inputs.js';

/** Fictional quote fixture for local handoff/demo only; no Compare calculations. */
export const DEMO_EXCHANGE_SELECTION: Selection = {
  quote: {
    quote_id: 'fictional-exchange-v1', objective: 'exchange', mode: 'local-demo',
    funding_source: 'myr_funding', provider: 'Fictional Compare fixture', rate: '298',
    principal: { amount_minor: 10000, currency: 'MYR' },
    fees: [{ label: 'Fictional fixed fee', Money: { amount_minor: 100, currency: 'MYR' } }],
    total_debit: { amount_minor: 10100, currency: 'MYR' },
    net_received: { amount_minor: 29800, currency: 'KRW' },
    badge: { status: 'Simulated', source: 'BorderWise Compare fixture; not a live quote', timestamp: '2026-10-18T00:00:00.000Z' },
  },
  context: { destination_account: 'krw_card', fee_accounts: ['myr_funding'], fee_behavior: 'fixed' },
};
