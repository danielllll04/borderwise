import type { ConfirmedSplitInput } from '../../src/services/shared-expense-inputs.js';

/** SIMULATED handover proposal only; not Steve's live Split output. */
export const CONFIRMED_SPLIT_FIXTURE: ConfirmedSplitInput = {
  frontend_action: 'confirm_shared_expense',
  idempotency_key: 'simulated-split:v1:krw50000',
  split_id: 'simulated-split-krw50000-v1',
  receipt_id: 'simulated-receipt-krw50000-v1',
  payer: { participant_id: 'demo-profile' },
  paid_from_account: 'krw_card',
  bill_total: { amount_minor: 50000, currency: 'KRW' },
  payer_share: { amount_minor: 15000, currency: 'KRW' },
  participants: [
    { participant_id: 'demo-daniel', display_name: 'Daniel (simulated)', share: { amount_minor: 21000, currency: 'KRW' } },
    { participant_id: 'demo-tze-loon', display_name: 'Tze Loon (simulated)', share: { amount_minor: 14000, currency: 'KRW' } },
  ],
  badge: { status: 'Simulated', source: 'Fictional confirmed receipt; local Split handover fixture, not a live Steve integration', timestamp: '2026-10-19T00:00:00.000Z' },
  paid_at: '2026-10-19T00:00:00.000Z',
  payment_mode: 'new_payment',
};
