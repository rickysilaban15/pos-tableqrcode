import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../database/client.ts';

if (!pool) throw new Error('DATABASE_URL wajib diatur.');
await pool.query('CREATE TABLE IF NOT EXISTS _laris_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const directory = path.resolve(import.meta.dirname, '../database/migrations');
for (const name of (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
  if ((await pool.query('SELECT 1 FROM _laris_migrations WHERE name = $1', [name])).rowCount) continue;
  const sql = await fs.readFile(path.join(directory, name), 'utf8');
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query(sql); await client.query('INSERT INTO _laris_migrations(name) VALUES ($1)', [name]); await client.query('COMMIT'); console.log(`Applied ${name}`); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
await pool.end();
