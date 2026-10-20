import { validateComparison, type CompareAdapter } from '../agent/compare.js';
import type { Decision } from '../agent/inputs.js';

/** Shared Agent/manual boundary. Steve calculates/ranks; Node validates exact financial semantics. */
export async function readComparison(adapter: CompareAdapter, decision: Decision) {
  return validateComparison(await adapter.compare(decision), decision);
}
