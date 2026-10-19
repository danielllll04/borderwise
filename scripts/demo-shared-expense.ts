/** SIMULATED isolated handover demo. Never opens or mutates the configured financial database. */
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { LedgerService } from '../src/services/ledger.js';
import { seed, SEED_BADGE } from './seed.js';
import { CONFIRMED_SPLIT_FIXTURE } from './fixtures/confirmed-split.js';

const directory = await mkdtemp(join(tmpdir(), 'borderwise-split-demo-'));
const path = join(directory, 'demo.db');
const url = `file:${path.replaceAll('\\', '/')}`;
let client: PrismaClient | undefined;
let app: ReturnType<typeof buildApp> | undefined;
try {
  await writeFile(path, '');
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe',
  });
  client = new PrismaClient({ datasources: { db: { url } } });
  await seed(client);
  app = buildApp(client, false);
  console.log('SIMULATED ISOLATED DEMO: temporary database; no live Split or Groq call.');
  const before = await client.account.findUniqueOrThrow({ where: { id: 'krw_card' } });
  const result = await app.inject({ method: 'POST', url: '/api/shared-expenses/confirm', payload: CONFIRMED_SPLIT_FIXTURE });
  if (result.statusCode !== 200) throw new Error(`Handover failed: ${result.body}`);
  console.log('Confirmed shared expense:', result.body);
  const details = result.json<{ receivables: { receivable: { receivable_id: string } }[] }>();
  const settlement = await new LedgerService(client).post({
    kind: 'settlement', profile_id: 'demo-profile', idempotency_key: 'simulated-split:v1:partial-settlement',
    receivable_id: details.receivables[0]!.receivable.receivable_id, receiving_account: 'krw_card',
    amount_cleared: { amount_minor: 10000, currency: 'KRW' }, amount_received: { amount_minor: 10000, currency: 'KRW' },
    fees: [], badge: SEED_BADGE,
  });
  console.log('Partial settlement (never income):', JSON.stringify(settlement));
  const after = await client.account.findUniqueOrThrow({ where: { id: 'krw_card' } });
  console.log(`SIMULATED card balance: ${before.balanceMinor} -> ${after.balanceMinor} KRW (bill -50000; repayment +10000).`);
} catch (error) {
  // Only local demo errors; never print the inherited environment.
  console.error(error instanceof Error ? error.message : 'Isolated demo failed');
  process.exitCode = 1;
} finally {
  await app?.close();
  await client?.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm']) await rm(`${path}${suffix}`, { force: true });
  await rmdir(directory);
}
