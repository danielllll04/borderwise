import type { Money } from '@/api/types'

export function readWorkflow<T>(key: string, initial: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') as T ?? initial } catch { return initial }
}
// Persist exact attempts before posting. Storage failure blocks a new write.
export function writeWorkflow<T>(key: string, value: T) { sessionStorage.setItem(key, JSON.stringify(value)) }
export function units(m: Money) {
  const n = BigInt(m.amount_minor)
  return m.currency === 'MYR' ? `${n / 100n}.${String(n % 100n).padStart(2, '0')}` : String(n)
}
// Input representation only: no allocation, FX, fees or reserve calculations.
export function enteredMoney(value: string, currency: Money['currency'], zero = false): Money {
  if (value.length > 30 || !(currency === 'MYR' ? /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d*)$/).test(value)) throw new Error(`Enter ${currency} ${currency === 'MYR' ? 'with at most two decimal places' : 'as whole won'}; amounts are not rounded.`)
  const [whole, fraction = ''] = value.split('.')
  const n = currency === 'MYR' ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole)
  if (n < (zero ? 0n : 1n) || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is outside the supported range.')
  return {amount_minor: Number(n), currency}
}
export function actualTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Enter the actual timestamp in ISO format with a timezone.')
  return value
}
