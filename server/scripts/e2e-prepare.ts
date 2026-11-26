import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.e2e' });

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL wajib diatur (salin .env.e2e.example ke .env.e2e).');
const parsed = new URL(url);
const database = parsed.pathname.slice(1);
if (!database.endsWith('_e2e')) throw new Error('Menolak test database yang tidak berakhiran _e2e.');
parsed.pathname = '/postgres';
const admin = new Client({ connectionString: parsed.toString() });
await admin.connect();
const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
if (!exists.rowCount) await admin.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
await admin.end();
console.log(`E2E database siap: ${database}`);
