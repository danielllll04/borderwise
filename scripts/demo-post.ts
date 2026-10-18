/** LOCAL DEMO ONLY: records fictional completed activity; never executes financial transfers. */
import { db } from '../src/db.js';
import { DEMO_PROFILE_ID } from '../src/domain/accounts.js';
import { LedgerService } from '../src/services/ledger.js';
import { HomeService } from '../src/services/home.js';
import { seed, SEED_BADGE, DEMO_RECEIVABLE_ID } from './seed.js';

try {
  await seed(db);
  const ledger = new LedgerService(db);
  const badge = { ...SEED_BADGE, source: 'BorderWise local posting demo; fictional completed activity' };
  console.log('SIMULATED LOCAL DEMO ONLY. Fixed keys make repeated runs safe.');
  const withdrawal = await ledger.post({
    kind: 'atm_withdrawal', profile_id: DEMO_PROFILE_ID, idempotency_key: 'demo:v1:myr-atm',
    source_account: 'myr_funding', destination_account: 'krw_cash',
    principal: { amount_minor: 5000, currency: 'MYR' }, received: { amount_minor: 15000, currency: 'KRW' },
    fees: [{ label: 'Simulated MYR-funded ATM fee', account_id: 'myr_funding', Money: { amount_minor: 100, currency: 'MYR' }, badge }],
    rate_snapshot: { pair: 'MYR/KRW', rate: '300', badge }, badge,
  });
  console.log('Recorded/replayed MYR-funded ATM activity:', JSON.stringify(withdrawal, null, 2));
  const settlement = await ledger.post({
    kind: 'settlement', profile_id: DEMO_PROFILE_ID, idempotency_key: 'demo:v1:krw-repayment',
    receivable_id: DEMO_RECEIVABLE_ID, receiving_account: 'krw_card',
    amount_cleared: { amount_minor: 20000, currency: 'KRW' }, amount_received: { amount_minor: 20000, currency: 'KRW' },
    fees: [], badge,
  });
  console.log('Recorded/replayed partial repayment (never income):', JSON.stringify(settlement, null, 2));
  console.log('Current Home:', JSON.stringify(await new HomeService(db).summary(), null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
