import { createHash } from 'node:crypto';

/** Canonicalize validated payloads; preserve array order and normalize object key order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(key => object[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function payloadHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
