import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { db } from '../src/db.js';
import { ACCOUNTS, DEMO_PROFILE_ID } from '../src/domain/accounts.js';
import type { Badge } from '../src/shared/models.js';
import { HomeService } from '../src/services/home.js';
import { LedgerService } from '../src/services/ledger.js';

// Fixed metadata is deliberate: reruns must have byte-for-byte equivalent inputs.
export const SEED_BADGE: Badge & { source: string } = {
  status: 'Simulated', source: 'BorderWise local demo seed; fictional balances and activity',
  timestamp: '2026-10-18T00:00:00.000Z',
};
export const DEMO_RECEIVABLE_ID = 'demo-receivable-krw';

export async function seed(client: PrismaClient): Promise<void> {
  const snapshot = { pair: 'MYR/KRW' as const, rate: '300', badge: SEED_BADGE };
  await client.$transaction(async tx => {
    await tx.profile.upsert({ where: { id: DEMO_PROFILE_ID }, update: {}, create: {
      id: DEMO_PROFILE_ID, displayName: 'Demo Malaysian Student', homeCurrency: 'MYR', destinationCurrency: 'KRW',
      fixedReserveMinor: 150000n, emergencyReserveMinor: 50000n,
      fixedReserveBadgeJson: JSON.stringify(SEED_BADGE), emergencyBadgeJson: JSON.stringify(SEED_BADGE),
    } });
    for (const account of Object.values(ACCOUNTS)) {
      await tx.account.upsert({ where: { id: account.id }, update: {}, create: {
        id: account.id, profileId: DEMO_PROFILE_ID, displayName: account.display_name,
        currency: account.currency, balanceMinor: 0n, balanceBadgeJson: JSON.stringify(SEED_BADGE),
        balanceProvenanceJson: JSON.stringify({ source: 'Empty account before ledger postings', input_badges: [SEED_BADGE] }),
      } });
    }
    await tx.receivable.upsert({ where: { id: DEMO_RECEIVABLE_ID }, update: {}, create: {
      id: DEMO_RECEIVABLE_ID, profileId: DEMO_PROFILE_ID, debtor: 'Demo roommate',
      originalAmountMinor: 60000n, currency: 'KRW', snapshotJson: JSON.stringify(snapshot),
      amountBadgeJson: JSON.stringify(SEED_BADGE), settledMinor: 0n,
    } });
  });

  const ledger = new LedgerService(client);
  await ledger.post({
    kind: 'income', profile_id: DEMO_PROFILE_ID, idempotency_key: 'seed:v1:funding',
    account_id: 'myr_funding', amount: { amount_minor: 500000, currency: 'MYR' }, badge: SEED_BADGE,
  });
  await ledger.post({
    kind: 'exchange', profile_id: DEMO_PROFILE_ID, idempotency_key: 'seed:v1:exchange',
    source_account: 'myr_funding', destination_account: 'krw_card',
    principal: { amount_minor: 100000, currency: 'MYR' }, received: { amount_minor: 300000, currency: 'KRW' },
    fees: [{ label: 'Simulated exchange fee', account_id: 'myr_funding', Money: { amount_minor: 1200, currency: 'MYR' }, badge: SEED_BADGE }],
    rate_snapshot: snapshot, badge: SEED_BADGE,
  });
  await ledger.post({
    kind: 'atm_withdrawal', profile_id: DEMO_PROFILE_ID, idempotency_key: 'seed:v1:card-atm',
    source_account: 'krw_card', destination_account: 'krw_cash',
    principal: { amount_minor: 80000, currency: 'KRW' }, received: { amount_minor: 80000, currency: 'KRW' },
    fees: [{ label: 'Simulated ATM fee', account_id: 'krw_card', Money: { amount_minor: 2000, currency: 'KRW' }, badge: SEED_BADGE }],
    badge: SEED_BADGE,
  });
  await ledger.post({
    kind: 'settlement', profile_id: DEMO_PROFILE_ID, idempotency_key: 'seed:v1:partial-repayment',
    receivable_id: DEMO_RECEIVABLE_ID, receiving_account: 'myr_funding',
    amount_cleared: { amount_minor: 10000, currency: 'KRW' }, amount_received: { amount_minor: 3333, currency: 'MYR' },
    fees: [], rate_snapshot: { pair: 'KRW/MYR', rate: '0.003333333333333333', badge: SEED_BADGE }, badge: SEED_BADGE,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await seed(db);
    console.log('SIMULATED LOCAL DEMO: seed complete. Existing profile changes and transactions are preserved.');
    console.log(JSON.stringify(await new HomeService(db).summary(), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
