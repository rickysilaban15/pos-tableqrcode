import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, requireAuth } from '../../middleware/auth.ts';

export const superAdminRouter = Router();
superAdminRouter.use(requireAuth, allowRoles('SUPER_ADMIN'));

superAdminRouter.get('/overview', async (_req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const [metrics, merchants, plans, audits] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT count(*)::int FROM merchants) "totalMerchants",
          (SELECT count(*)::int FROM subscriptions WHERE status = 'ACTIVE') "activeSubscriptions",
          (SELECT count(*)::int FROM subscriptions WHERE status = 'TRIAL') "trialSubscriptions",
          (SELECT count(*)::int FROM subscriptions WHERE status IN ('EXPIRED','SUSPENDED','CANCELLED')) "inactiveSubscriptions",
          (SELECT count(*)::int FROM orders WHERE payment_status = 'PAID') "totalPaidOrders",
          (SELECT coalesce(sum(total_amount),0)::bigint FROM orders WHERE payment_status = 'PAID')::text "totalGmv",
          (SELECT coalesce(sum(p.monthly_price),0)::int FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE') "mrr"
      `),
      pool.query(`
        SELECT
          m.id, m.name, m.slug, m.created_at "createdAt",
          u.email "ownerEmail", u.name "ownerName",
          s.id "subscriptionId", s.status "subscriptionStatus",
          s.trial_ends_at "trialEndsAt", s.current_period_ends_at "currentPeriodEndsAt",
          s.qr_ordering_enabled "qrOrderingEnabled", s.pos_enabled "posEnabled",
          p.code "planCode", p.name "planName", p.monthly_price "monthlyPrice",
          (SELECT count(*)::int FROM orders o WHERE o.merchant_id = m.id AND o.payment_status = 'PAID') "paidOrders",
          (SELECT coalesce(sum(o.total_amount),0)::int FROM orders o WHERE o.merchant_id = m.id AND o.payment_status = 'PAID') "paidRevenue"
        FROM merchants m
        LEFT JOIN LATERAL (
          SELECT u.email, u.name
          FROM merchant_memberships mm
          JOIN users u ON u.id = mm.user_id
          WHERE mm.merchant_id = m.id AND mm.role = 'MERCHANT_OWNER'
          ORDER BY mm.created_at ASC
          LIMIT 1
        ) u ON true
        LEFT JOIN LATERAL (
          SELECT * FROM subscriptions WHERE merchant_id = m.id ORDER BY created_at DESC LIMIT 1
        ) s ON true
        LEFT JOIN subscription_plans p ON p.id = s.plan_id
        ORDER BY m.created_at DESC
      `),
      pool.query(
        'SELECT id, code, name, monthly_price "monthlyPrice", trial_days "trialDays", is_active "isActive" FROM subscription_plans ORDER BY monthly_price ASC',
      ),
      pool.query(`
        SELECT a.id, a.action, a.entity_type "entityType", a.entity_id "entityId", a.payload, a.created_at "createdAt",
               m.name "merchantName", u.email "actorEmail"
        FROM audit_logs a
        LEFT JOIN merchants m ON m.id = a.merchant_id
        LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC
        LIMIT 100
      `),
    ]);

    res.json({
      metrics: {
        ...metrics.rows[0],
        totalGmv: Number(metrics.rows[0]?.totalGmv ?? 0),
      },
      merchants: merchants.rows,
      plans: plans.rows,
      audits: audits.rows,
    });
  } catch (e) {
    next(e);
  }
});

const merchantSubUpdate = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']),
  planCode: z.enum(['basic', 'pro', 'business']).optional(),
  qrOrderingEnabled: z.boolean(),
  posEnabled: z.boolean(),
  extendDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(300).optional(),
});

superAdminRouter.patch('/merchants/:merchantId/subscription', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const v = merchantSubUpdate.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const merchant = (
        await client.query('SELECT id, name FROM merchants WHERE id = $1', [req.params.merchantId])
      ).rows[0];
      if (!merchant) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Merchant tidak ditemukan' });
      }
      const currentSub = (
        await client.query(
          'SELECT id, plan_id FROM subscriptions WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
          [merchant.id],
        )
      ).rows[0];

      let planId = currentSub?.plan_id;
      if (v.planCode) {
        const plan = (
          await client.query('SELECT id FROM subscription_plans WHERE code = $1', [v.planCode])
        ).rows[0];
        if (!plan) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Paket langganan tidak ditemukan' });
        }
        planId = plan.id;
      }
      if (!planId) {
        const fallback = (await client.query("SELECT id FROM subscription_plans WHERE code = 'basic' LIMIT 1")).rows[0];
        planId = fallback?.id;
      }
      if (!planId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Paket langganan belum tersedia' });
      }

      const extendDays = v.extendDays ?? (v.status === 'ACTIVE' ? 30 : v.status === 'TRIAL' ? 14 : 0);
      if (currentSub) {
        await client.query(
          `UPDATE subscriptions
           SET plan_id = $1,
               status = $2,
               qr_ordering_enabled = $3,
               pos_enabled = $4,
               notes = COALESCE($5, notes),
               trial_ends_at = CASE WHEN $2 = 'TRIAL' AND $6 > 0 THEN now() + ($6 || ' days')::interval ELSE trial_ends_at END,
               current_period_ends_at = CASE WHEN $2 = 'ACTIVE' AND $6 > 0 THEN now() + ($6 || ' days')::interval ELSE current_period_ends_at END,
               updated_at = now()
           WHERE id = $7`,
          [planId, v.status, v.qrOrderingEnabled, v.posEnabled, v.notes ?? null, extendDays, currentSub.id],
        );
      } else {
        await client.query(
          `INSERT INTO subscriptions(merchant_id, plan_id, status, qr_ordering_enabled, pos_enabled, trial_ends_at, current_period_ends_at, notes)
           VALUES($1, $2, $3, $4, $5,
             CASE WHEN $3 = 'TRIAL' THEN now() + ($6 || ' days')::interval ELSE NULL END,
             CASE WHEN $3 = 'ACTIVE' THEN now() + ($6 || ' days')::interval ELSE NULL END,
             $7)`,
          [merchant.id, planId, v.status, v.qrOrderingEnabled, v.posEnabled, extendDays || 14, v.notes ?? ''],
        );
      }

      await client.query(
        'INSERT INTO audit_logs(merchant_id, actor_user_id, action, entity_type, entity_id, payload) VALUES($1, $2, $3, $4, $5, $6)',
        [
          merchant.id,
          req.auth!.sub,
          'SUPER_ADMIN_SUBSCRIPTION_UPDATED',
          'merchant',
          merchant.id,
          JSON.stringify(v),
        ],
      );
      await client.query('COMMIT');
      res.json({ ok: true, merchantId: merchant.id, ...v });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

const planUpdate = z.object({
  name: z.string().trim().min(2).max(60),
  monthlyPrice: z.number().int().min(1000).max(50_000_000),
  trialDays: z.number().int().min(1).max(90),
  isActive: z.boolean(),
});

superAdminRouter.patch('/plans/:id', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const v = planUpdate.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = (
        await client.query(
          'UPDATE subscription_plans SET name=$1, monthly_price=$2, trial_days=$3, is_active=$4, updated_at=now() WHERE id=$5 RETURNING id, code, name, monthly_price "monthlyPrice", trial_days "trialDays", is_active "isActive"',
          [v.name, v.monthlyPrice, v.trialDays, v.isActive, req.params.id],
        )
      ).rows[0];
      if (!updated) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Paket tidak ditemukan' });
      }
      await client.query(
        'INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, payload) VALUES($1, $2, $3, $4, $5)',
        [req.auth!.sub, 'SUPER_ADMIN_PLAN_UPDATED', 'subscription_plan', updated.id, JSON.stringify(v)],
      );
      await client.query('COMMIT');
      res.json(updated);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});
