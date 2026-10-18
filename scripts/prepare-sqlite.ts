import 'dotenv/config';
import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prisma 6's Windows engine can fail without diagnostics when the SQLite file
// is absent. Create an empty file without truncating any existing database.
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:')) throw new Error('Set a SQLite DATABASE_URL first (copy .env.example to .env).');
const filename = url.slice('file:'.length).split('?')[0];
if (!filename) throw new Error('DATABASE_URL must name a persistent SQLite file.');
const schemaDirectory = fileURLToPath(new URL('../prisma/', import.meta.url));
const databasePath = resolve(schemaDirectory, filename);
await mkdir(dirname(databasePath), { recursive: true });
const handle = await open(databasePath, 'a');
await handle.close();
