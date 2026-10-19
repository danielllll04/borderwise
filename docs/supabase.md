# Supabase database setup and SQLite copy

Supabase hosts PostgreSQL. The backend can retain SQLite for local work and use a separate PostgreSQL client when explicitly selected. Shared models, routes, integer money, explicit confirmation and the Agent's financial authority are unchanged. This does not deploy the backend, add authentication, connect Steve's adapters or move receipt images into cloud storage.

## Current readiness

On 19 October 2026 the PostgreSQL migration was deployed to the configured Supabase project, all **34 existing records across 23 model tables** were copied and verified by canonical content hashes, and the local provider selection was switched to `supabase`. The original SQLite file/sidecars and private receipt directory were preserved, with a local backup retained under ignored `.local/supabase-source-backup-*`. Credentials are kept only in ignored local configuration; they are not part of this document or source control.

Observed online checks: exact local/online contents matched; anon/authenticated roles lacked schema access; every table had RLS enabled. Health, profile, balances, Home, ledger, plan list, pending-plan assessment and Agent availability routes returned HTTP 200 with matching SQLite/Supabase response data (generated read timestamps excluded). The authoritative reserve-preview token matched SQLite. Negative balances, unsafe-size money, negative reserves, Agent snapshot edits and plan snapshot edits were rejected in rollback-only transactions; all online model rows were unchanged afterward. No test plan/session, financial posting or seed remained committed. No new real-Groq inference or live Steve/receipt integration was tested during this database cutover.

An initial connection retained the template's square brackets around the actual password and failed authentication. A read-only check succeeded after removing those wrappers; only then was the corrected value saved locally. The first API comparison also included newly generated badge timestamps; comparison was corrected to exclude read-time timestamps, while persisted timestamps remained covered by exact row verification. Build/type-check/lint and the existing isolated SQLite shared-expense demo have passed. Neither successful client generation nor compilation alone is counted as an online verification.

## Create and configure the project

1. Sign in at the [Supabase dashboard](https://supabase.com/dashboard). Create a project named BorderWise in your chosen organization. Use the Free plan if appropriate and choose a suitable region (Singapore is close to Malaysia). Save the database password privately.
2. In **Connect**, copy the **Session pooler** database connection on port **5432**. A direct connection is also supported if your environment can reach it. The transaction pooler on port 6543 is deliberately rejected by this setup. See [Supabase's Prisma connection guide](https://supabase.com/docs/guides/database/prisma).
3. Enter that password-bearing URL only in the ignored local `.env`:

```dotenv
# Preserve the existing local database and all other configuration.
DATABASE_URL="file:./dev.db"
BORDERWISE_DATABASE_PROVIDER="sqlite"
SUPABASE_DATABASE_URL="postgresql://USER:URL_ENCODED_PASSWORD@HOST:5432/postgres?schema=borderwise&sslmode=require"
```

Replace the placeholders locally with the actual connection information. Percent-encode reserved characters in the password. Do not paste the URL/password into chat, commit them, or put them in browser/frontend environment variables. A project URL/anon key is not a PostgreSQL connection. `schema=borderwise` and TLS are enforced/added by the server configuration helper. The migration connection must have rights to create and own its dedicated schema/tables; use a trusted server-only database role.

Do not add `borderwise` to the Data API's exposed schemas. The migration revokes PUBLIC/anon/authenticated access to the private schema and enables RLS without public policies. This is backend-only access, not per-user app authentication. A table owner/admin can bypass RLS, so its credentials must remain server-side. Supabase recommends disabling its Data API when only Prisma is used; see the same connection guide. No anonymous frontend access is needed for this backend.

PowerShell values override `.env`. Clear stale provider/connection overrides in the session launching these commands if using `.env`:

```powershell
Remove-Item Env:BORDERWISE_DATABASE_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_DATABASE_URL -ErrorAction SilentlyContinue
```

Leave the SQLite `DATABASE_URL` intact. The Supabase helper uses `SUPABASE_DATABASE_URL`, so the current SQLite migration-deploy command will not accidentally apply SQLite SQL to PostgreSQL.

## Deploy, copy and verify

For a new empty destination only: stop the local backend before copying so it cannot accept new SQLite writes during cutover. **This project's copy has already completed: do not repeat the copy command against the populated online database.** Do not run seed or reset commands. The original setup sequence was:

```powershell
npm ci
npm run db:supabase:generate
npm run db:supabase:migrate
npm run db:supabase:copy
npm run db:supabase:check
```

- Generation derives `prisma/supabase/schema.prisma` from the existing SQLite model definitions, adds only PostgreSQL schema placement and emits a separate client under ignored node_modules. Existing SQLite schema/migrations/client remain available.
- Deploy uses **`prisma migrate deploy --schema prisma/supabase/schema.prisma`**, with separate PostgreSQL history. It refuses unmanaged tables in the destination schema and never resets/seeds anything. PostgreSQL SQL includes the existing safe-money/currency constraints, snapshot/terminal-status/receipt guards and session-scoped proposal check. See [Prisma 6's provider-switch limitations](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues): SQLite SQL cannot simply be reused on PostgreSQL.
- Copy opens the configured SQLite file read-only, checks integrity/foreign keys, retains a stable backup and sidecars under ignored `.local/supabase-source-backup-*`, and imports all 23 model tables in parent-before-child order. IDs, amounts, timestamps, JSON/audit snapshots and replay metadata are retained. No financial posting service or seed is called.
- The destination must be empty. The import locks its tables, runs in one serializable transaction, resets the message-ID sequence and verifies canonical row-content hashes before commit. A mismatch, existing destination record or changed SQLite source aborts the import. It never overwrites/merges online financial data. A repeat copy into populated tables is refused.
- Check compares the current local/online contents and verifies that anon/authenticated roles lack schema access and that tables have RLS. It prints only status/counts; errors withhold credentials, SQL values, prompts and raw database/CLI bodies. Exact local/online equality is a cutover check; after using the online app, normal new online records will make the old local snapshot differ.

Once online verification and a read-only API smoke pass, change only this selection in ignored `.env`:

```dotenv
BORDERWISE_DATABASE_PROVIDER="supabase"
```

Restart the backend. Its PostgreSQL transactions default to serializable isolation so multi-read financial assessments retain a consistent snapshot. Existing conflict/idempotency behavior remains in the services. Verify Home, pending plans, ledger and read/preview Agent routes against the imported data before allowing explicit financial actions. Do not use demo posting/plan scripts to validate the imported financial database.

## Rollback and storage

Set `BORDERWISE_DATABASE_PROVIDER=sqlite` and restart to use the preserved local file. This is safe as a simple rollback before new online financial writes. Once online writes have occurred, the old SQLite copy is stale: reconcile/export online changes before switching back, so transactions are not lost or recorded twice. No branch or migration history needs to be deleted.

Receipt images stay in their existing private local upload directory; only their metadata lives in PostgreSQL. The current backend can still read them on this computer. Hosting the backend elsewhere will require a separate private storage migration and retention/access controls. No public image bucket or public financial table is created by this change.

When models change later, regenerate both clients, create an appropriate new PostgreSQL migration, and preserve/review custom SQL guards. Do not overwrite an already applied baseline migration or replace agreed shared contracts with Supabase/Prisma persistence fields. No dependency upgrade is required by this setup.
