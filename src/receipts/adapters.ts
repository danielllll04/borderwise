import { AppError } from '../domain/errors.js';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { payloadHash } from '../domain/idempotency.js';
import type { ReceiptAdapters, ReceiptData, ReceiptExtraction, AllocationResult } from './contracts.js';

export const DEMO_PARTICIPANTS = [
  { participant_id: DEMO_PROFILE_ID, display_name: 'Payer (current demo user)' },
  { participant_id: 'demo-daniel', display_name: 'Daniel' },
  { participant_id: 'demo-tze-loon', display_name: 'Tze Loon' },
];
export const DEMO_RECEIPT: ReceiptData = {
  merchant: 'Fictional shared meal fixture', date: '2026-10-19',
  items: [
    { item_id: 'food', label: 'Shared food (fixture)', quantity: '1', amount: { amount_minor: 42000, currency: 'KRW' } },
    { item_id: 'beverages', label: 'Beverages (fixture)', quantity: '1', amount: { amount_minor: 7000, currency: 'KRW' } },
    { item_id: 'additional', label: 'Additional item (fixture)', quantity: '1', amount: { amount_minor: 1000, currency: 'KRW' } },
  ],
  tax: { amount_minor: 0, currency: 'KRW' }, discount: { amount_minor: 0, currency: 'KRW' }, total: { amount_minor: 50000, currency: 'KRW' },
};
export const DEMO_ASSIGNMENTS = [
  { item_id: 'food', participant_ids: ['demo-profile', 'demo-daniel', 'demo-tze-loon'] },
  { item_id: 'beverages', participant_ids: ['demo-daniel'] },
  { item_id: 'additional', participant_ids: ['demo-profile'] },
];
export function assignmentFingerprint(assignments: typeof DEMO_ASSIGNMENTS) {
  return payloadHash(assignments.map(item => ({ item_id: item.item_id, participant_ids: [...item.participant_ids].sort() })).sort((a, b) => a.item_id.localeCompare(b.item_id)));
}
const badge = { status: 'Simulated' as const, source: 'Explicit receipt/split fixture; no uploaded image OCR or live Steve service', timestamp: '2026-10-19T00:00:00.000Z' };

export function fixtureReceiptAdapters(): ReceiptAdapters {
  return {
    directory: { async list() { return structuredClone(DEMO_PARTICIPANTS); } },
    ocr: { async extract(input): Promise<ReceiptExtraction> {
      return { receipt_id: `demo-receipt-${input.attachment_id}`, receipt: structuredClone(DEMO_RECEIPT), badge,
        fixture_notice: 'Demo OCR returned a fixed simulated receipt. It did not read or interpret the uploaded image content.' };
    } },
    allocation: { async allocate(input): Promise<AllocationResult> {
      if (payloadHash(input.receipt) !== payloadHash(DEMO_RECEIPT)
        || assignmentFingerprint(input.request.assignments) !== assignmentFingerprint(DEMO_ASSIGNMENTS)
        || [...input.request.participant_ids].sort().join('|') !== DEMO_PARTICIPANTS.map(item => item.participant_id).sort().join('|')
        || input.request.payer_id !== DEMO_PROFILE_ID) {
        throw new AppError(422, 'DEMO_ALLOCATION_UNSUPPORTED', 'The demo supports only its unchanged receipt and exact selected assignments: food shared by all three, beverages Daniel only, additional item payer only. It cannot recalculate edited receipts or other assignments.');
      }
      return { split_id: `demo-split-${input.receipt_id}`, receipt_id: input.receipt_id, receipt_version: input.receipt_version,
        assignments_hash: assignmentFingerprint(input.request.assignments), total: { amount_minor: 50000, currency: 'KRW' },
        payer_share: { amount_minor: 15000, currency: 'KRW' },
        debtor_shares: [
          { participant_id: 'demo-daniel', share: { amount_minor: 21000, currency: 'KRW' } },
          { participant_id: 'demo-tze-loon', share: { amount_minor: 14000, currency: 'KRW' } },
        ], badge };
    } },
  };
}

export function configuredReceiptAdapters(): ReceiptAdapters {
  if (process.env.RECEIPT_PROVIDER === 'demo') return fixtureReceiptAdapters();
  const unavailable = () => { throw new AppError(503, 'RECEIPT_INTEGRATION_UNAVAILABLE', 'Steve OCR/allocation/directory contracts are not connected. Set RECEIPT_PROVIDER=demo explicitly for labelled local fixtures. Live integration is unverified.'); };
  return { ocr: { async extract() { return unavailable(); } }, allocation: { async allocate() { return unavailable(); } }, directory: { async list() { return unavailable(); } } };
}
