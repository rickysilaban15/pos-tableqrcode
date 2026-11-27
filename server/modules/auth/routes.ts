import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { env, requireAuthConfig } from '../../config/env.ts';
import { requireAuth } from '../../middleware/auth.ts';

const credentials = z.object({
  email: z.string().trim().email().max(255).transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
});

const registration = credentials.extend({
  name: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(100),
  outletName: z.string().trim().min(2).max(100),
  planCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .default('basic')
    .transform((v) => v.toLowerCase()),
});

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 7,
  path: '/',
};

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registration.parse(req.body);
    const { jwtSecret } = requireAuthConfig();
    if (!pool) throw new Error('Database belum tersedia');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Email sudah terdaftar' });
      }

      let plan = (
        await client.query(
          'SELECT id, code, name, trial_days FROM subscription_plans WHERE code = $1 AND is_active = true LIMIT 1',
          [input.planCode],
        )
      ).rows[0];
      if (!plan) {
        plan = (
          await client.query(
            'SELECT id, code, name, trial_days FROM subscription_plans WHERE is_active = true ORDER BY monthly_price ASC LIMIT 1',
          )
        ).rows[0];
      }
      if (!plan) {
        await client.query('ROLLBACK');
        return res.status(503).json({ error: 'Paket langganan belum tersedia. Hubungi administrator.' });
      }

      const user = (
        await client.query(
          'INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING id,email,name',
          [input.email, await bcrypt.hash(input.password, 12), input.name],
        )
      ).rows[0];
      const merchant = (
        await client.query(
          'INSERT INTO merchants(name,slug) VALUES($1,$2) RETURNING id,name,slug',
          [input.businessName, `${slug(input.businessName) || 'outlet'}-${crypto.randomUUID().slice(0, 8)}`],
        )
      ).rows[0];
      const outlet = (
        await client.query(
          'INSERT INTO outlets(merchant_id,name,slug) VALUES($1,$2,$3) RETURNING id,name,slug',
          [merchant.id, input.outletName, slug(input.outletName) || 'utama'],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO merchant_memberships(merchant_id,user_id,role) VALUES($1,$2,'MERCHANT_OWNER')",
        [merchant.id, user.id],
      );
      await client.query(
        'INSERT INTO outlet_settings(outlet_id,merchant_id,operating_hours) VALUES($1,$2,$3) ON CONFLICT(outlet_id) DO NOTHING',
        [outlet.id, merchant.id, '08:00 - 22:00 WIB'],
      );
      await client.query(
        "INSERT INTO subscriptions(merchant_id,plan_id,status,trial_ends_at,qr_ordering_enabled,pos_enabled) VALUES($1,$2,'TRIAL',now() + ($3 || ' days')::interval,true,true)",
        [merchant.id, plan.id, plan.trial_days],
      );
      await client.query(
        'INSERT INTO audit_logs(merchant_id,actor_user_id,action,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5,$6)',
        [
          merchant.id,
          user.id,
          'MERCHANT_REGISTERED',
          'merchant',
          merchant.id,
          JSON.stringify({ businessName: merchant.name, outletName: outlet.name, planCode: plan.code }),
        ],
      );
      await client.query('COMMIT');
      const token = jwt.sign(
        { sub: user.id, merchantId: merchant.id, outletId: outlet.id, role: 'MERCHANT_OWNER' },
        jwtSecret,
        { expiresIn: '7d' },
      );
      res.cookie('laris_session', token, cookieOptions).status(201).json({
        user,
        merchant,
        outlet,
        role: 'MERCHANT_OWNER',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string })?.code === '23505') {
        return res.status(409).json({ error: 'Email sudah terdaftar' });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = credentials.parse(req.body);
    const { jwtSecret } = requireAuthConfig();
    if (!pool) throw new Error('Database belum tersedia');
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.password_hash, u.is_super_admin,
              m.merchant_id, m.role, o.id outlet_id
       FROM users u
       LEFT JOIN merchant_memberships m ON m.user_id = u.id
       LEFT JOIN outlets o ON o.merchant_id = m.merchant_id
       WHERE u.email = $1 AND u.is_active = true
       ORDER BY m.created_at ASC NULLS LAST, o.created_at ASC NULLS LAST
       LIMIT 1`,
      [input.email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ error: 'Email atau kata sandi salah' });
    }
    const role = user.is_super_admin ? 'SUPER_ADMIN' : user.role;
    if (!role) {
      return res.status(403).json({ error: 'Akun tidak memiliki akses merchant atau admin' });
    }
    if (role !== 'SUPER_ADMIN' && (!user.merchant_id || !user.outlet_id)) {
      return res.status(403).json({ error: 'Akun belum terhubung ke outlet merchant' });
    }
    const token = jwt.sign(
      {
        sub: user.id,
        merchantId: role === 'SUPER_ADMIN' ? '' : (user.merchant_id ?? ''),
        outletId: role === 'SUPER_ADMIN' ? '' : (user.outlet_id ?? ''),
        role,
      },
      jwtSecret,
      { expiresIn: '7d' },
    );
    return res.cookie('laris_session', token, cookieOptions).json({
      user: { id: user.id, email: user.email, name: user.name },
      merchantId: role === 'SUPER_ADMIN' ? '' : (user.merchant_id ?? ''),
      outletId: role === 'SUPER_ADMIN' ? '' : (user.outlet_id ?? ''),
      role,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (_req, res) =>
  res.clearCookie('laris_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' }).status(204).end(),
);

authRouter.get('/me', requireAuth, (req, res) => res.json(req.auth));
