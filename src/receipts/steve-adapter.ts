import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SteveHttpClient } from '../integrations/steve-http.js';
import { AppError } from '../domain/errors.js';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { payloadHash } from '../domain/idempotency.js';
import { badgeSchema, minorSchema, positiveMoneySchema } from '../domain/validation.js';
import { assignmentFingerprint } from './adapters.js';
import { receiptDataSchema, type ReceiptAdapters, type ReceiptExtraction, type AllocationResult } from './contracts.js';

const id = z.string().trim().min(1).max(100);
const label = z.string().trim().min(1).max(200);
const sourceBadge = badgeSchema.extend({ source: z.string().max(800).nullish() });
const ocrReceipt = z.object({
  receipt_id: id, merchant: label, date: z.string().date(),
  items: z.array(z.object({ item_id: id, name: label, quantity: z.number().int().positive().max(999999),
    unit_price_krw: minorSchema, total_price_krw: minorSchema.positive(), assigned_to: z.array(id).max(20) }).strict()).min(1).max(20),
  tax_krw: minorSchema, discount_krw: minorSchema, total_krw: minorSchema.positive(), badge: sourceBadge,
}).strict();
const imageResponse = z.object({
  receipt: ocrReceipt, image_sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes_received: z.number().int().positive().max(4194304),
  reads_image_content: z.literal(false), mode: z.literal('sample'), fixture_notice: z.string().min(1).max(500),
}).strict();
const share = z.object({ participant_id: id, amount_minor: minorSchema }).strict();
const adjustment = share.extend({ amount_minor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER) });
const previewSchema = z.object({
  preview_only: z.literal(true), financial_mutation: z.literal(false), preview_id: z.string().regex(/^split_preview_[a-f0-9]{64}$/),
  receipt_id: id, receipt_version: z.number().int().positive(), payer_id: id,
  item_assignments: z.record(z.array(id).min(1).max(20)), total_bill: positiveMoneySchema,
  participant_shares: z.array(share).min(1).max(20),
  item_shares: z.array(z.object({ item_id: id, shares: z.array(share).min(1).max(20) }).strict()).min(1).max(20),
  adjustments: z.array(adjustment).min(1).max(20), badge: badgeSchema,
}).strict();
const invalid = () => new AppError(502, 'RECEIPT_INVALID_RESPONSE', 'Steve receipt response did not match the image or reviewed receipt/assignments. No allocation was trusted or posted.');
const sameIds = (actual: string[], expected: string[]) => new Set(actual).size === actual.length
  && actual.length === expected.length && [...actual].sort().every((value, i) => value === [...expected].sort()[i]);

/** Server-configured ID directory. Names are presentation only; no debtor-name matching. */
export function steveReceiptAdapters(): ReceiptAdapters {
  const http = new SteveHttpClient(process.env.STEVE_RECEIPT_BASE_URL?.trim() || process.env.STEVE_BASE_URL?.trim() || process.env.STEVE_COMPARE_BASE_URL?.trim(),
    process.env.STEVE_RECEIPT_TIMEOUT_MS ?? '5000', 'RECEIPT', 7000);
  const directory: ReceiptAdapters['directory'] = { async list(profileId) {
    try {
      const raw = process.env.RECEIPT_PARTICIPANTS_JSON ?? '';
      if (Buffer.byteLength(raw) > 16384 || profileId !== DEMO_PROFILE_ID) throw new Error();
      const people = z.array(z.object({ participant_id: id, display_name: label }).strict()).min(1).max(20).parse(JSON.parse(raw) as unknown);
      if (!sameIds(people.map(p => p.participant_id), [...new Set(people.map(p => p.participant_id))]) || !people.some(p => p.participant_id === profileId)) throw new Error();
      return people;
    } catch { throw new AppError(503, 'RECEIPT_DIRECTORY_CONFIGURATION_REQUIRED', 'Configure server-only RECEIPT_PARTICIPANTS_JSON with unique stable IDs including the current payer. No display-name or demo-directory fallback was used.'); }
  } };
  return {
    directory,
    ocr: { async extract(input): Promise<ReceiptExtraction> {
      const parsed = imageResponse.safeParse(await http.request('/api/split/ocr/image', input.bytes, input.content_type));
      if (!parsed.success) throw invalid();
      const result = parsed.data;
      if (result.image_sha256 !== createHash('sha256').update(input.bytes).digest('hex') || result.bytes_received !== input.bytes.length
        || result.receipt.badge.status !== 'Simulated') throw invalid();
      const original = result.receipt;
      return {
        // A fixed upstream sample receipt ID must not merge separate uploaded bills.
        receipt_id: `steve-receipt-${input.attachment_id}`,
        receipt: receiptDataSchema.parse({ merchant: original.merchant, date: original.date,
          items: original.items.map(item => ({ item_id: item.item_id, label: item.name, quantity: String(item.quantity), amount: { amount_minor: item.total_price_krw, currency: 'KRW' } })),
          tax: { amount_minor: original.tax_krw, currency: 'KRW' }, discount: { amount_minor: original.discount_krw, currency: 'KRW' }, total: { amount_minor: original.total_krw, currency: 'KRW' } }),
        badge: { ...original.badge, status: 'Simulated', source: `Steve sample OCR fallback; ${original.badge.source ?? 'source unspecified'}` },
        fixture_notice: result.fixture_notice,
        integration: { service: 'steve_receipt', upstream_receipt: original, image_sha256: result.image_sha256,
          bytes_received: result.bytes_received, reads_image_content: false, mode: 'sample' },
      };
    } },
    allocation: { async allocate(input): Promise<AllocationResult> {
      const { receipt, request } = input;
      if ([receipt.total, receipt.tax, receipt.discount, ...receipt.items.map(i => i.amount)].some(m => m.currency !== 'KRW')) throw new AppError(422, 'RECEIPT_CURRENCY_UNSUPPORTED', 'Steve review allocation currently supports KRW receipts only; no currency conversion was invented.');
      const people = await directory.list(DEMO_PROFILE_ID);
      if (request.payer_id !== DEMO_PROFILE_ID || request.participant_ids.some(p => !people.some(person => person.participant_id === p))) throw new AppError(422, 'RECEIPT_PARTICIPANTS_UNSUPPORTED', 'Select stable participant IDs from the configured directory, with the current user as payer.');
      const assignments = Object.fromEntries(request.assignments.map(item => [item.item_id, item.participant_ids]));
      const payload = {
        receipt: { receipt_id: input.receipt_id, ...(receipt.merchant ? { merchant: receipt.merchant } : {}), ...(receipt.date ? { date: receipt.date } : {}),
          items: receipt.items.map(item => ({ item_id: item.item_id, name: item.label, quantity: item.quantity, total_price_krw: item.amount.amount_minor })),
          tax_krw: receipt.tax.amount_minor, discount_krw: receipt.discount.amount_minor, total_krw: receipt.total.amount_minor },
        receipt_version: input.receipt_version, payer_id: request.payer_id, participant_ids: request.participant_ids, item_assignments: assignments,
      };
      const parsed = previewSchema.safeParse(await http.request('/api/split/allocate/preview', payload));
      if (!parsed.success) throw invalid();
      const result = parsed.data;
      if (result.receipt_id !== input.receipt_id || result.receipt_version !== input.receipt_version || result.payer_id !== request.payer_id
        || payloadHash(result.item_assignments) !== payloadHash(assignments) || payloadHash(result.total_bill) !== payloadHash(receipt.total)
        || !['Indicative', 'Simulated'].includes(result.badge.status)
        || !sameIds(result.participant_shares.map(s => s.participant_id), request.participant_ids)
        || !sameIds(result.adjustments.map(s => s.participant_id), request.participant_ids)
        || !sameIds(result.item_shares.map(s => s.item_id), receipt.items.map(i => i.item_id))) throw invalid();
      const contributions = new Map(request.participant_ids.map(p => [p, 0n]));
      for (const item of receipt.items) {
        const row = result.item_shares.find(s => s.item_id === item.item_id)!;
        if (!sameIds(row.shares.map(s => s.participant_id), assignments[item.item_id]!)
          || row.shares.reduce((sum, s) => sum + BigInt(s.amount_minor), 0n) !== BigInt(item.amount.amount_minor)
          || Math.max(...row.shares.map(s => s.amount_minor)) - Math.min(...row.shares.map(s => s.amount_minor)) > 1) throw invalid();
        for (const part of row.shares) contributions.set(part.participant_id, contributions.get(part.participant_id)! + BigInt(part.amount_minor));
      }
      if (result.adjustments.reduce((sum, s) => sum + BigInt(s.amount_minor), 0n) !== BigInt(receipt.tax.amount_minor) - BigInt(receipt.discount.amount_minor)) throw invalid();
      for (const part of result.participant_shares) {
        const adjusted = contributions.get(part.participant_id)! + BigInt(result.adjustments.find(a => a.participant_id === part.participant_id)!.amount_minor);
        if (adjusted !== BigInt(part.amount_minor)) throw invalid();
      }
      if (result.participant_shares.reduce((sum, s) => sum + BigInt(s.amount_minor), 0n) !== BigInt(receipt.total.amount_minor)) throw invalid();
      const debtors = result.participant_shares.filter(s => s.participant_id !== request.payer_id);
      if (debtors.some(s => s.amount_minor === 0)) throw new AppError(422, 'RECEIPT_ZERO_SHARE_UNSUPPORTED', 'Selected debtors must have positive shares in the current Node contract. Remove zero-share participants and review again.');
      return {
        split_id: result.preview_id, receipt_id: result.receipt_id, receipt_version: result.receipt_version,
        assignments_hash: assignmentFingerprint(request.assignments), total: result.total_bill,
        payer_share: { amount_minor: result.participant_shares.find(s => s.participant_id === request.payer_id)!.amount_minor, currency: 'KRW' },
        debtor_shares: debtors.map(s => ({ participant_id: s.participant_id, share: { amount_minor: s.amount_minor, currency: 'KRW' } })),
        badge: result.badge, integration: { service: 'steve_receipt', preview_only: true, financial_mutation: false, upstream_preview: result },
      };
    } },
  };
}
