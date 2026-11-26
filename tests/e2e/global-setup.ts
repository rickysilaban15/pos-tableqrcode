import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import dotenv from 'dotenv';

export default async function globalSetup() {
dotenv.config({ path: '.env.e2e' });
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_e2e')) throw new Error('TEST_DATABASE_URL harus database khusus berakhiran _e2e.');
const client = new Client({ connectionString });
await client.connect();
const migrations = await fs.readdir(path.resolve('server/database/migrations'));
for (const name of migrations.filter((file) => file.endsWith('.sql')).sort()) {
  const applied = await client.query('SELECT 1 FROM _laris_migrations WHERE name=$1', [name]).catch(() => ({ rowCount: 0 }));
  if (!applied.rowCount) {
    await client.query('BEGIN');
    try { await client.query(await fs.readFile(path.resolve('server/database/migrations', name), 'utf8')); await client.query('CREATE TABLE IF NOT EXISTS _laris_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'); await client.query('INSERT INTO _laris_migrations(name) VALUES($1)', [name]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
}
const tables = ['audit_logs','payments','order_item_addons','order_items','orders','table_sessions','table_qr_codes','dining_tables','product_addons','product_variants','products','categories','merchant_memberships','subscriptions','outlets','merchants','users','plan_features','subscription_plans'];
await client.query(`TRUNCATE ${tables.join(', ')} CASCADE`);
const plan = (await client.query("INSERT INTO subscription_plans(code,name,monthly_price,trial_days) VALUES('basic','Basic',50000,14) RETURNING id")).rows[0];
await client.query("INSERT INTO plan_features(plan_id,feature_key) VALUES($1,'ordering')", [plan.id]);
const suffix = crypto.randomUUID().slice(0, 8), password = crypto.randomBytes(18).toString('base64url');
async function merchant(label: string) {
  const user = (await client.query('INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING id,email', [`owner-${label.toLowerCase()}-${suffix}@e2e.test`, await bcrypt.hash(password, 10), `Owner ${label}`])).rows[0];
  const store = (await client.query('INSERT INTO merchants(name,slug) VALUES($1,$2) RETURNING id', [`E2E ${label}`, `e2e-${label.toLowerCase()}-${suffix}`])).rows[0];
  const outlet = (await client.query('INSERT INTO outlets(merchant_id,name,slug) VALUES($1,$2,$3) RETURNING id', [store.id, 'Outlet Uji', `outlet-${label.toLowerCase()}`])).rows[0];
  await client.query("INSERT INTO merchant_memberships(merchant_id,user_id,role) VALUES($1,$2,'MERCHANT_OWNER')", [store.id,user.id]);
  await client.query("INSERT INTO subscriptions(merchant_id,plan_id,status,trial_ends_at) VALUES($1,$2,'TRIAL',now()+interval '14 days')", [store.id,plan.id]);
  return { user, store, outlet };
}
const a = await merchant('A'), b = await merchant('B');
// Create a super admin user for E2E testing
const superAdminEmail = `superadmin-${suffix}@e2e.test`;
const superAdminPasswordHash = await bcrypt.hash(password, 10);
const superAdminUser = (await client.query(
  'INSERT INTO users(email, password_hash, name, is_super_admin, is_active) VALUES($1, $2, $3, true, true) RETURNING id',
  [superAdminEmail, superAdminPasswordHash, 'Super Admin E2E'],
)).rows[0];
const category = (await client.query('INSERT INTO categories(merchant_id,outlet_id,name) VALUES($1,$2,$3) RETURNING id',[a.store.id,a.outlet.id,'Kopi'])).rows[0];
const product = (await client.query('INSERT INTO products(merchant_id,outlet_id,category_id,name,description,price) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[a.store.id,a.outlet.id,category.id,'Kopi E2E','Kopi untuk alur browser',18000])).rows[0];
const variant = (await client.query("INSERT INTO product_variants(product_id,group_name,option_name,price_delta,required) VALUES($1,'Ukuran','Besar',5000,true) RETURNING id",[product.id])).rows[0];
const addon = (await client.query("INSERT INTO product_addons(product_id,name,price) VALUES($1,'Extra Shot',4000) RETURNING id",[product.id])).rows[0];
const table = (await client.query('INSERT INTO dining_tables(merchant_id,outlet_id,name) VALUES($1,$2,$3) RETURNING id',[a.store.id,a.outlet.id,'E2E-01'])).rows[0];
const qrToken = crypto.randomBytes(32).toString('base64url');
const qrHash = crypto.createHash('sha256').update(qrToken).digest('hex');
await client.query('INSERT INTO table_qr_codes(table_id,token_hash,public_token) VALUES($1,$2,$3)',[table.id,qrHash,qrToken]);
await fs.writeFile('.e2e-state.json', JSON.stringify({ password, superAdmin: { email: superAdminEmail }, merchantA: { email:a.user.email, merchantId:a.store.id, outletId:a.outlet.id, productId:product.id, variantId:variant.id, addonId:addon.id, qrToken }, merchantB:{email:b.user.email,merchantId:b.store.id,outletId:b.outlet.id} }));
await client.end();
}
