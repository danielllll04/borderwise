import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { AppError } from './errors.js';

export const currencySchema = z.enum(['MYR', 'KRW']);
export const accountIdSchema = z.enum(['myr_funding', 'krw_card', 'krw_cash']);
export const minorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const moneySchema = z.object({ amount_minor: minorSchema, currency: currencySchema }).strict();
export const positiveMoneySchema = moneySchema.extend({ amount_minor: minorSchema.positive() });
export const badgeSchema = z.object({
  status: z.enum(['User-Entered', 'User-Confirmed', 'Simulated', 'Indicative', 'Live']),
  source: z.string().trim().min(1).max(1000),
  timestamp: z.string().datetime({ offset: true }),
}).strict();

// Rates are retained exactly, validated with Decimal, and never applied to actual money.
export const rateSchema = z.string().max(100).regex(/^\d+(?:\.\d+)?$/)
  .pipe(z.string().refine(value => new Decimal(value).greaterThan(0), 'Rate must be a positive decimal string'));
export const snapshotSchema = z.object({
  pair: z.enum(['MYR/KRW', 'KRW/MYR', 'MYR/MYR', 'KRW/KRW']),
  rate: rateSchema,
  badge: badgeSchema,
}).strict();

export function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new AppError(422, 'AMOUNT_OUT_OF_RANGE', 'The resulting amount is outside the safe integer range');
  }
  return Number(value);
}

export function assertReserveTotal(fixed: bigint, emergency: bigint): void {
  safeNumber(fixed + emergency);
}

/** Parse user-entered major-unit text at the backend boundary; no model arithmetic. */
export function parseMajorMoney(text: string, currency: 'MYR' | 'KRW') {
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Enter a positive amount using plain decimal digits');
  const [whole = '0', fraction = ''] = text.split('.');
  if (currency === 'KRW' && fraction.length) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'KRW amounts must use whole won');
  const minor = currency === 'MYR' ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole);
  if (minor <= 0n) throw new AppError(400, 'INVALID_AMOUNT_TEXT', 'Amount must be positive');
  return { amount_minor: safeNumber(minor), currency };
}
