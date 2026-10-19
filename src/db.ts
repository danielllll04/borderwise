import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as SupabaseClient } from '../node_modules/.prisma/borderwise-supabase/index.js';
import { databaseProvider, supabaseDatabaseUrl } from './database-config.js';

process.env.DATABASE_URL ??= 'file:./dev.db';

/** Both clients are generated from the same models; the services use their common API. */
export function createSupabaseClient(): PrismaClient {
  return new SupabaseClient({
    datasources: { db: { url: supabaseDatabaseUrl() } },
    // Preserve one-snapshot reads and existing financial concurrency semantics on PostgreSQL.
    transactionOptions: { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
  }) as unknown as PrismaClient;
}

export const db = databaseProvider() === 'supabase' ? createSupabaseClient() : new PrismaClient();
