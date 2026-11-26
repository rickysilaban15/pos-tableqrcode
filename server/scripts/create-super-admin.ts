/**
 * Create or update the platform Super Admin account.
 *
 * Usage:
 *   SUPER_ADMIN_EMAIL=admin@platform.com SUPER_ADMIN_PASSWORD=<min10chars> tsx server/scripts/create-super-admin.ts
 *
 * This is idempotent: running it again updates the password if the email already exists.
 * Never commit credentials — pass them via environment variables.
 */
import bcrypt from 'bcryptjs';
import { pool } from '../database/client.ts';

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD?.trim();
const name = (process.env.SUPER_ADMIN_NAME?.trim()) || 'Super Admin';

if (!email || !password) {
  console.error('Usage: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... tsx server/scripts/create-super-admin.ts');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Invalid email address.');
  process.exit(1);
}

if (!pool) throw new Error('DATABASE_URL wajib diatur.');

const hash = await bcrypt.hash(password, 12);

const existing = (await pool.query('SELECT id, email FROM users WHERE email = $1', [email])).rows[0];
if (existing) {
  await pool.query(
    'UPDATE users SET password_hash = $1, name = $2, is_super_admin = true, is_active = true, updated_at = now() WHERE id = $3',
    [hash, name, existing.id],
  );
  console.log(`✅ Super Admin updated: ${email} (id: ${existing.id})`);
} else {
  const user = (
    await pool.query(
      'INSERT INTO users(email, password_hash, name, is_super_admin, is_active) VALUES($1, $2, $3, true, true) RETURNING id',
      [email, hash, name],
    )
  ).rows[0];
  console.log(`✅ Super Admin created: ${email} (id: ${user.id})`);
}

console.log('Login at: /super-admin/login');
await pool.end();
