import { readFile, writeFile, mkdir } from 'node:fs/promises';

// One model definition: PostgreSQL changes persistence placement, not the shared contracts.
const sqlite = await readFile('prisma/schema.prisma', 'utf8');
const postgres = sqlite
  .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "../../node_modules/.prisma/borderwise-supabase"')
  .replace('provider = "sqlite"', 'provider = "postgresql"\n  schemas = ["borderwise"]')
  .replace('env("DATABASE_URL")', 'env("SUPABASE_DATABASE_URL")')
  .replace(/(model \w+ \{[\s\S]*?)\r?\n\}/g, '$1\n\n  @@schema("borderwise")\n}');
await mkdir('prisma/supabase', { recursive: true });
await writeFile('prisma/supabase/schema.prisma', '// Generated from prisma/schema.prisma by npm run db:supabase:generate.\n' + postgres);
