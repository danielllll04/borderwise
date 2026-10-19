/** Server-only configuration. Never put a password-bearing URL in logs or frontend config. */
export function supabaseDatabaseUrl() {
  const raw = process.env.SUPABASE_DATABASE_URL?.trim();
  if (!raw) throw new Error('Configure SUPABASE_DATABASE_URL privately in ignored .env first.');
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('SUPABASE_DATABASE_URL is not a valid PostgreSQL connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) {
    throw new Error('Use the server-side PostgreSQL database connection, including its privately configured password.');
  }
  if (url.port === '6543' || url.searchParams.get('pgbouncer') === 'true') {
    throw new Error('Use the Supabase Session pooler on port 5432 or a direct connection; transaction pooling is not supported by this setup.');
  }
  const ssl = url.searchParams.get('sslmode');
  if (ssl && !['require', 'verify-ca', 'verify-full'].includes(ssl)) throw new Error('Supabase connections require TLS.');
  const schema = url.searchParams.get('schema');
  if (schema && schema !== 'borderwise') throw new Error('Use the dedicated borderwise database schema.');
  url.searchParams.set('schema', 'borderwise');
  if (!ssl) url.searchParams.set('sslmode', 'require');
  return url.toString();
}

export function databaseProvider() {
  const provider = process.env.BORDERWISE_DATABASE_PROVIDER?.trim() || 'sqlite';
  if (!['sqlite', 'supabase'].includes(provider)) throw new Error('BORDERWISE_DATABASE_PROVIDER must be sqlite or supabase.');
  return provider as 'sqlite' | 'supabase';
}
