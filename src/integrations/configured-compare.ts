import { AppError } from '../domain/errors.js';
import { FixtureCompareAdapter, type CompareAdapter } from '../agent/compare.js';
import { SteveCompareAdapter } from './steve-compare.js';

export function configuredCompare(): CompareAdapter {
  const provider = process.env.COMPARE_PROVIDER ?? 'steve';
  if (provider === 'steve') return new SteveCompareAdapter();
  if (provider === 'fixture') return new FixtureCompareAdapter();
  return { async compare() { throw new AppError(503, 'COMPARE_CONFIGURATION_REQUIRED', 'Set COMPARE_PROVIDER to steve or explicitly fixture. No fallback was used.'); } };
}
