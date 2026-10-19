import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Prisma } from '@prisma/client';
import { createSupabaseClient } from '../src/db.js';
import { supabaseDatabaseUrl } from '../src/database-config.js';

type Value = string | number | bigint | boolean | Date | null;
type Row = Record<string, Value>;
type Snapshot = Record<string, Row[]>;
class SafeFailure extends Error {}
const models = Prisma.dmmf.datamodel.models;
const fields = (name: string) => models.find(model => model.name === name)!.fields.filter(field => field.kind !== 'object');
// Insert parents before children, retaining every original ID and workflow replay record.
const order = ['Profile', 'Account', 'Activity', 'LedgerEntry', 'LedgerLine', 'Receivable', 'Settlement', 'SharedExpense', 'SharedExpenseAllocation', 'PlanRecord', 'WorkflowRequest', 'AgentSession', 'AgentTurn', 'AgentMessage', 'AgentQuoteSnapshot', 'AgentProposal', 'AgentProposalPreview', 'AgentToolExecution', 'ReceiptAttachment', 'ReceiptDraft', 'ReceiptDraftVersion', 'ReceiptSplitProposal', 'ReceiptConfirmationRequest'];
const table = (name: string) => `"borderwise"."${name}"`;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
function hash(snapshot: Snapshot) {
  return digest(json(order.map(name => [name, snapshot[name]!.map(row => json(row)).sort()])));
}
function convert(type: string, value: unknown): Value {
  if (value === null) return null;
  if (type === 'DateTime') {
    // SQLite CURRENT_TIMESTAMP text is UTC even without an explicit timezone suffix.
    const input = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? value.replace(' ', 'T') + 'Z' : value;
    const date = input instanceof Date ? input : new Date(typeof input === 'bigint' ? Number(input) : input as string | number);
    if (!Number.isFinite(date.getTime())) throw new SafeFailure('Source timestamp could not be preserved. Import stopped.');
    return date;
  }
  if (type === 'Boolean') {
    if ([true, 1, 1n].includes(value as boolean | number | bigint)) return true;
    if ([false, 0, 0n].includes(value as boolean | number | bigint)) return false;
    throw new SafeFailure('Source boolean could not be preserved. Import stopped.');
  }
  if (type === 'BigInt') {
    if (typeof value !== 'bigint' && (typeof value !== 'number' || !Number.isSafeInteger(value))) throw new SafeFailure('Source money must remain an exact integer.');
    return BigInt(value);
  }
  if (type === 'Int') {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < -2147483648 || number > 2147483647) throw new SafeFailure('Source integer is outside the supported range.');
    return number;
  }
  if (type === 'String' && typeof value === 'string') return value;
  throw new SafeFailure('Unsupported source field type. No values were logged.');
}
function normalize(name: string, rows: Record<string, unknown>[]): Row[] {
  return rows.map(row => Object.fromEntries(fields(name).map(field => [field.name, convert(field.type, row[field.name])])));
}
function sourcePath() {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (!url.startsWith('file:')) throw new SafeFailure('Keep DATABASE_URL pointing to the original SQLite file; use SUPABASE_DATABASE_URL for the destination.');
  const path = resolve('prisma', url.slice(5).split('?')[0]!);
  if (!existsSync(path)) throw new SafeFailure('Existing SQLite source is missing. No empty source or seed was created.');
  return path;
}
function readSource(): Snapshot {
  const db = new DatabaseSync(sourcePath(), { readOnly: true });
  try {
    db.exec('BEGIN');
    if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new SafeFailure('SQLite integrity/foreign-key check failed.');
    const snapshot: Snapshot = {};
    for (const name of order) {
      const statement = db.prepare(`SELECT * FROM "${name}"`);
      statement.setReadBigInts(true);
      snapshot[name] = normalize(name, statement.all());
    }
    db.exec('COMMIT');
    return snapshot;
  } finally { db.close(); }
}
function backupSource() {
  const path = sourcePath();
  const disk = () => Object.fromEntries(['', '-wal', '-shm', '-journal'].map(suffix => [suffix, existsSync(path + suffix) ? digest(readFileSync(path + suffix)) : null]));
  const before = json(disk());
  mkdirSync('.local', { recursive: true });
  const directory = mkdtempSync(resolve('.local', 'supabase-source-backup-'));
  for (const suffix of ['', '-wal', '-shm', '-journal']) if (existsSync(path + suffix)) copyFileSync(path + suffix, join(directory, 'financial.db' + suffix));
  if (before !== json(disk())) throw new SafeFailure('SQLite changed during backup. Stop the local backend before copying.');
  return directory;
}

const command = process.argv[2];
let client: ReturnType<typeof createSupabaseClient> | undefined;
try {
  if (!['migrate', 'copy', 'check'].includes(command ?? '')) throw new SafeFailure('Choose migrate, copy or check.');
  if (order.length !== models.length || models.some(model => !order.includes(model.name))) throw new SafeFailure('Migration model inventory needs review before copying.');
  const url = supabaseDatabaseUrl();
  client = createSupabaseClient();
  if (command === 'migrate') {
    const tables = await client.$queryRawUnsafe<{ table_name: string }[]>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'borderwise' AND table_type = 'BASE TABLE'");
    if (tables.some(item => !order.includes(item.table_name) && item.table_name !== '_prisma_migrations') || tables.length && !tables.some(item => item.table_name === '_prisma_migrations')) throw new SafeFailure('Destination schema already contains unmanaged tables. Nothing was overwritten.');
    await client.$disconnect();
    // Capture CLI output: even failure diagnostics must never echo a password-bearing URL.
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/supabase/schema.prisma'], {
      env: { ...process.env, SUPABASE_DATABASE_URL: url }, stdio: 'pipe', timeout: 120000,
    });
    console.log('Supabase PostgreSQL migration deploy completed; no reset or seed was run.');
  } else {
    const source = readSource();
    if (command === 'copy') {
      if (process.env.BORDERWISE_DATABASE_PROVIDER === 'supabase') throw new SafeFailure('Keep the application in SQLite mode and stop its server until the copy is verified.');
      const backup = backupSource();
      await client.$transaction(async tx => {
        await tx.$executeRawUnsafe(`LOCK TABLE ${order.map(table).join(', ')} IN ACCESS EXCLUSIVE MODE`);
        for (const name of order) {
          const counts = await tx.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM ${table(name)}`);
          if (counts[0]!.count !== 0n) throw new SafeFailure('Destination contains data. Copy refused; no rows were overwritten or duplicated.');
        }
        for (const name of order) {
          const columns = fields(name).map(field => field.name);
          const rows = source[name]!;
          for (let offset = 0; offset < rows.length; offset += 100) {
            const batch = rows.slice(offset, offset + 100);
            const values = batch.flatMap(row => columns.map(column => row[column]!));
            let parameter = 0;
            const tuples = batch.map(() => `(${columns.map(() => `$${++parameter}`).join(', ')})`).join(', ');
            await tx.$executeRawUnsafe(`INSERT INTO ${table(name)} (${columns.map(column => `"${column}"`).join(', ')}) VALUES ${tuples}`, ...values);
          }
        }
        // Keep future message IDs above imported IDs without changing any existing record.
        await tx.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('"borderwise"."AgentMessage"', 'id'), COALESCE(MAX("id"), 1), COUNT(*) > 0) FROM "borderwise"."AgentMessage"`);
        const online: Snapshot = {};
        for (const name of order) online[name] = normalize(name, await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${table(name)}`));
        if (hash(source) !== hash(online)) throw new SafeFailure('Imported counts/content failed exact verification. The transaction was rolled back.');
        if (hash(source) !== hash(readSource())) throw new SafeFailure('Local data changed during import. The online transaction was rolled back; stop the local backend and retry.');
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 120000 });
      writeFileSync(join(backup, 'verified-import.json'), json({ source_hash: hash(source), tables: Object.fromEntries(order.map(name => [name, source[name]!.length])), copied_at: new Date().toISOString() }), { mode: 0o600 });
      console.log(JSON.stringify({ copied: true, exact_content_verified: true, source_opened_read_only: true, tables: order.length, records: order.reduce((sum, name) => sum + source[name]!.length, 0), local_backup_retained: true, application_switched: false }));
    } else {
      const online = await client.$transaction(async tx => {
        const snapshot: Snapshot = {};
        for (const name of order) snapshot[name] = normalize(name, await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${table(name)}`));
        return snapshot;
      });
      const access = await client.$queryRawUnsafe<{ exposed: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated') AND has_schema_privilege(oid, 'borderwise', 'USAGE')) AS exposed`);
      const security = await client.$queryRawUnsafe<{ insecure: bigint }[]>(`SELECT COUNT(*) AS insecure FROM pg_tables WHERE schemaname = 'borderwise' AND NOT rowsecurity`);
      const same = hash(source) === hash(online);
      console.log(JSON.stringify({ connected: true, model_tables: order.length, local_copy_matches_online: same, anon_authenticated_schema_access: access[0]!.exposed, tables_without_rls: Number(security[0]!.insecure) }));
      if (!same || access[0]!.exposed || security[0]!.insecure !== 0n) throw new SafeFailure('Online data or private-schema checks need review before switching.');
    }
  }
} catch (error) {
  // No raw CLI/provider/Prisma error bodies, SQL values, URLs or credentials in logs.
  const code = typeof error === 'object' && error && 'code' in error && /^P\d{4}$/.test(String(error.code)) ? String(error.code) : null;
  const reason = error instanceof SafeFailure ? error.message : error instanceof Error && /^(Configure SUPABASE_|SUPABASE_DATABASE_URL|Use the |Supabase connections|BORDERWISE_DATABASE_PROVIDER)/.test(error.message) ? error.message : 'Supabase operation failed. Check private connection configuration and migration state; credentials and record contents were withheld.';
  console.error(JSON.stringify({ success: false, code, reason }));
  process.exitCode = 1;
} finally { await client?.$disconnect(); }
