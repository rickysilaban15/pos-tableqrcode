import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.ts';

export const pool = env.DATABASE_URL
  ? new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 })
  : null;

export const db = pool ? drizzle(pool) : null;

export async function databaseHealth(): Promise<boolean> {
  if (!pool) return false;
  await pool.query('select 1');
  return true;
}
