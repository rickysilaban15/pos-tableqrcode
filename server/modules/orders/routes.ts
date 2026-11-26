import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, requireAuth } from '../../middleware/auth.ts';
import { getMerchantEntitlements } from '../../middleware/entitlement.ts';
import { publishTenantEvent, publishTrackingEvent, subscribeTrackingEvents } from '../events/bus.ts';
import { createCheckoutOrder, expireAbandonedOrders } from './service.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const item = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  variantIds: z.array(z.string().uuid()).default([]),
  addonIds: z.array(z.string().uuid()).default([]),
  notes: z.string().trim().max(300).optional(),
});
const body = z.object({
  customerName: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(['CASH', 'QRIS']),
  items: z.array(item).min(1).max(50),
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']).default('DINE_IN'),
  fulfillmentMethod: z.enum(['TABLE_SERVICE', 'PICKUP_COUNTER']).default('TABLE_SERVICE'),
});

type OutletPolicy = {
  is_open: boolean;
  enable_dine_in: boolean;
  enable_takeaway: boolean;
  enable_table_service: boolean;
  enable_pickup_counter: boolean;
  qris_image_url: string;
};

function validateOutletPolicy(
  input: z.infer<typeof body>,
  policy: OutletPolicy,
): { status: number; error: string } | null {
  if (!policy.is_open) return { status: 409, error: 'Outlet sedang tutup' };
  if (input.orderType === 'DINE_IN' && !policy.enable_dine_in) {
    return { status: 400, error: 'Dine in tidak tersedia' };
  }
  if (input.orderType === 'TAKEAWAY' && !policy.enable_takeaway) {
    return { status: 400, error: 'Takeaway tidak tersedia' };
  }
  if (input.orderType === 'TAKEAWAY' && input.fulfillmentMethod !== 'PICKUP_COUNTER') {
    return { status: 400, error: 'Takeaway harus menggunakan pickup counter' };
  }
  if (input.fulfillmentMethod === 'TABLE_SERVICE' && !policy.enable_table_service) {
    return { status: 400, error: 'Layanan antar meja tidak tersedia' };
  }
  if (input.fulfillmentMethod === 'PICKUP_COUNTER' && !policy.enable_pickup_counter) {
    return { status: 400, error: 'Pickup counter tidak tersedia' };
  }
  if (input.paymentMethod === 'QRIS' && !policy.qris_image_url.trim()) {
    return { status: 400, error: 'QRIS belum dikonfigurasi outlet' };
  }
  return null;
}

export const publicOrdersRouter = Router();
publicOrdersRouter.post('/qr/:token/orders', async (req, res, next) => {
  try {
    const db = pool;
    if (!db) throw Error('Database tidak tersedia');
    const input = body.parse(req.body);
    const qrContext = (
      await db.query(
        "SELECT t.id,t.merchant_id,t.outlet_id,COALESCE(s.is_open,true) is_open,COALESCE(s.enable_dine_in,true) enable_dine_in,COALESCE(s.enable_takeaway,true) enable_takeaway,COALESCE(s.enable_table_service,true) enable_table_service,COALESCE(s.enable_pickup_counter,true) enable_pickup_counter,COALESCE(s.qris_image_url,'') qris_image_url FROM table_qr_codes q JOIN dining_tables t ON t.id=q.table_id LEFT JOIN outlet_settings s ON s.outlet_id=t.outlet_id WHERE q.token_hash=$1 AND q.revoked_at IS NULL AND t.is_active=true",
        [hash(req.params.token)],
      )
    ).rows[0];
    if (!qrContext) return res.status(404).json({ error: 'QR meja tidak valid' });

    const entitlement = await getMerchantEntitlements(qrContext.merchant_id);
    if (!entitlement.effectiveActive) {
      return res.status(403).json({ error: 'Langganan outlet tidak aktif atau telah kedaluwarsa' });
    }
    if (!entitlement.qrOrderingEnabled) {
      return res.status(403).json({ error: 'Layanan QR Ordering tidak diaktifkan untuk outlet ini' });
    }

    const policyViolation = validateOutletPolicy(input, qrContext);
    if (policyViolation) return res.status(policyViolation.status).json({ error: policyViolation.error });
    const order = await createCheckoutOrder(input, {
      merchantId: qrContext.merchant_id,
      outletId: qrContext.outlet_id,
      tableId: qrContext.id,
      orderSource: 'QR',
    });
    res.status(order.idempotent ? 200 : 201).json(order);
  } catch (error) {
    next(error);
  }
});

publicOrdersRouter.get('/tracking/:token', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const tokenHash = hash(req.params.token);
    const o = (
      await pool.query(
        'SELECT o.id,o.outlet_id "outletId",o.customer_name "customerName",o.total_amount "totalAmount",o.order_status "orderStatus",o.payment_status "paymentStatus",o.order_type "orderType",o.fulfillment_method "fulfillmentMethod",o.order_source "orderSource",o.created_at "createdAt",o.updated_at "updatedAt",o.completed_at "completedAt",t.name "tableName",p.method "paymentMethod",p.cash_received "cashReceived",p.change_amount "changeAmount",p.paid_at "paidAt",m.name "merchantName",out.name "outletName",COALESCE(s.address,\'\') address,COALESCE(s.whatsapp,\'\') whatsapp,COALESCE(s.logo_url,\'\') "logoUrl" FROM orders o JOIN payments p ON p.order_id=o.id JOIN merchants m ON m.id=o.merchant_id JOIN outlets out ON out.id=o.outlet_id LEFT JOIN outlet_settings s ON s.outlet_id=o.outlet_id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.tracking_token_hash=$1',
        [tokenHash],
      )
    ).rows[0];
    if (!o) return res.status(404).json({ error: 'Tracking tidak ditemukan' });
    await expireAbandonedOrders(o.outletId).catch(() => 0);
    const refreshed = (
      await pool.query(
        'SELECT o.id,o.customer_name "customerName",o.total_amount "totalAmount",o.order_status "orderStatus",o.payment_status "paymentStatus",o.order_type "orderType",o.fulfillment_method "fulfillmentMethod",o.order_source "orderSource",o.created_at "createdAt",o.updated_at "updatedAt",o.completed_at "completedAt",t.name "tableName",p.method "paymentMethod",p.cash_received "cashReceived",p.change_amount "changeAmount",p.paid_at "paidAt",m.name "merchantName",out.name "outletName",COALESCE(s.address,\'\') address,COALESCE(s.whatsapp,\'\') whatsapp,COALESCE(s.logo_url,\'\') "logoUrl" FROM orders o JOIN payments p ON p.order_id=o.id JOIN merchants m ON m.id=o.merchant_id JOIN outlets out ON out.id=o.outlet_id LEFT JOIN outlet_settings s ON s.outlet_id=o.outlet_id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.id=$1',
        [o.id],
      )
    ).rows[0];
    const items = (
      await pool.query(
        'SELECT product_name "productName",unit_price "unitPrice",quantity,selections FROM order_items WHERE order_id=$1',
        [o.id],
      )
    ).rows;
    res.json({ ...refreshed, items });
  } catch (e) {
    next(e);
  }
});

publicOrdersRouter.get('/tracking/:token/events', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const tokenHash = hash(req.params.token);
    const exists = await pool.query('SELECT id FROM orders WHERE tracking_token_hash=$1', [tokenHash]);
    if (!exists.rowCount) return res.status(404).json({ error: 'Tracking tidak ditemukan' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const unsubscribe = subscribeTrackingEvents(tokenHash, res);
    req.on('close', unsubscribe);
  } catch (e) {
    next(e);
  }
});

export const merchantOrdersRouter = Router();
merchantOrdersRouter.use(requireAuth);

merchantOrdersRouter.get('/entitlements', async (req, res, next) => {
  try {
    const entitlement = await getMerchantEntitlements(req.auth!.merchantId);
    res.json(entitlement);
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.post('/manual', async (req, res, next) => {
  try {
    const input = body
      .extend({
        tableId: z.string().uuid().optional(),
        cashReceived: z.number().int().min(0).optional(),
      })
      .parse(req.body);
    if (input.orderType === 'DINE_IN' && input.fulfillmentMethod === 'TABLE_SERVICE' && !input.tableId) {
      return res.status(400).json({ error: 'Meja wajib dipilih untuk layanan antar ke meja' });
    }
    if (input.orderType === 'TAKEAWAY' && input.tableId) {
      return res.status(400).json({ error: 'Takeaway tidak dapat menggunakan meja' });
    }
    if (input.paymentMethod === 'CASH' && input.cashReceived === undefined) {
      return res.status(400).json({ error: 'Nominal tunai wajib diisi' });
    }
    const db = pool;
    if (!db) throw Error('Database tidak tersedia');

    const entitlement = await getMerchantEntitlements(req.auth!.merchantId);
    if (!entitlement.effectiveActive) {
      return res.status(403).json({ error: 'Langganan merchant tidak aktif atau telah kedaluwarsa' });
    }
    if (!entitlement.posEnabled) {
      return res.status(403).json({ error: 'Akses Kasir POS tidak aktif pada paket langganan Anda' });
    }

    const policy = (
      await db.query(
        "SELECT COALESCE(s.is_open,true) is_open,COALESCE(s.enable_dine_in,true) enable_dine_in,COALESCE(s.enable_takeaway,true) enable_takeaway,COALESCE(s.enable_table_service,true) enable_table_service,COALESCE(s.enable_pickup_counter,true) enable_pickup_counter,COALESCE(s.qris_image_url,'') qris_image_url FROM outlets o LEFT JOIN outlet_settings s ON s.outlet_id=o.id WHERE o.id=$1 AND o.merchant_id=$2",
        [req.auth!.outletId, req.auth!.merchantId],
      )
    ).rows[0];
    if (!policy) return res.status(404).json({ error: 'Outlet tidak ditemukan' });
    const policyViolation = validateOutletPolicy(input, policy);
    if (policyViolation) return res.status(policyViolation.status).json({ error: policyViolation.error });

    if (input.tableId) {
      const table = await db.query(
        'SELECT id FROM dining_tables WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3 AND is_active=true',
        [input.tableId, req.auth!.merchantId, req.auth!.outletId],
      );
      if (!table.rowCount) return res.status(400).json({ error: 'Meja tidak valid' });
    }
    const order = await createCheckoutOrder(
      input,
      {
        merchantId: req.auth!.merchantId,
        outletId: req.auth!.outletId,
        tableId: input.tableId,
        orderSource: 'POS',
      },
      {
        confirmCash: input.paymentMethod === 'CASH' ? input.cashReceived : undefined,
        verifiedBy: req.auth!.sub,
      },
    );
    res.status(order.idempotent ? 200 : 201).json(order);
  } catch (error) {
    next(error);
  }
});

merchantOrdersRouter.get('/dashboard', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const params = [req.auth!.merchantId, req.auth!.outletId];
    const [metrics, recent, tables] = await Promise.all([
      pool.query(
        "SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int \"totalOrders\",count(*) FILTER (WHERE order_status='NEW_ORDER')::int \"newOrders\",count(*) FILTER (WHERE order_status='IN_PROGRESS')::int \"inProgressOrders\",count(*) FILTER (WHERE order_status='READY_TO_SERVE' AND completed_at >= date_trunc('day', now()))::int \"readyOrders\",coalesce(sum(total_amount) FILTER (WHERE payment_status='PAID' AND created_at >= date_trunc('day', now())),0)::int revenue FROM orders WHERE merchant_id=$1 AND outlet_id=$2",
        params,
      ),
      pool.query(
        "SELECT o.id,o.customer_name \"customerName\",o.total_amount \"totalAmount\",o.order_status \"orderStatus\",o.payment_status \"paymentStatus\",o.created_at \"createdAt\",o.order_type \"orderType\",o.fulfillment_method \"fulfillmentMethod\",o.order_source \"orderSource\",t.name \"tableName\",p.method,(SELECT coalesce(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) \"itemCount\" FROM orders o JOIN payments p ON p.order_id=o.id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.merchant_id=$1 AND o.outlet_id=$2 ORDER BY o.created_at DESC LIMIT 6",
        params,
      ),
      pool.query(
        'SELECT count(*)::int total,count(*) FILTER (WHERE is_active)::int active FROM dining_tables WHERE merchant_id=$1 AND outlet_id=$2',
        params,
      ),
    ]);
    res.json({
      metrics: metrics.rows[0],
      recentOrders: recent.rows,
      tables: tables.rows[0] ?? { total: 0, active: 0 },
    });
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.get('/', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const r = await pool.query(
      "SELECT o.id,o.customer_name \"customerName\",o.total_amount \"totalAmount\",o.order_status \"orderStatus\",o.payment_status \"paymentStatus\",o.created_at \"createdAt\",o.order_type \"orderType\",o.fulfillment_method \"fulfillmentMethod\",o.order_source \"orderSource\",t.name \"tableName\",p.method FROM orders o JOIN payments p ON p.order_id=o.id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.merchant_id=$1 AND o.outlet_id=$2 AND o.payment_status='PAID' AND o.order_status IN ('NEW_ORDER','IN_PROGRESS') ORDER BY o.created_at DESC",
      [req.auth!.merchantId, req.auth!.outletId],
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.get('/history', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);
    const status = typeof req.query.status === 'string' ? req.query.status : 'READY_TO_SERVE';
    const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
    const method = typeof req.query.method === 'string' ? req.query.method : 'ALL';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';

    const params: unknown[] = [req.auth!.merchantId, req.auth!.outletId];
    const filters: string[] = [];
    if (status !== 'ALL') {
      params.push(status);
      filters.push(`o.order_status = $${params.length}`);
    }
    if (source !== 'ALL') {
      params.push(source);
      filters.push(`o.order_source = $${params.length}`);
    }
    if (method !== 'ALL') {
      params.push(method);
      filters.push(`p.method = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      filters.push(`(o.id::text ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR COALESCE(t.name,'') ILIKE $${params.length})`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      filters.push(`o.created_at >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      filters.push(`o.created_at < ($${params.length}::date + interval '1 day')`);
    }
    const whereExtra = filters.length ? ` AND ${filters.join(' AND ')}` : '';
    const [ordersResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT o.id, o.customer_name "customerName", o.total_amount "totalAmount", o.order_status "orderStatus", o.payment_status "paymentStatus", o.order_type "orderType", o.fulfillment_method "fulfillmentMethod", o.order_source "orderSource", t.name "tableName", p.method, p.cash_received "cashReceived", p.change_amount "changeAmount", p.paid_at "paidAt", o.created_at "createdAt", o.completed_at "completedAt", (SELECT coalesce(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) "itemCount"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}
         ORDER BY COALESCE(o.completed_at, o.created_at) DESC
         LIMIT 200`,
        params,
      ),
      pool.query(
        `SELECT
           count(*) FILTER (WHERE o.payment_status = 'PAID')::int "paidOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID'), 0)::int "paidRevenue",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND o.order_source = 'QR')::int "qrOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND o.order_source = 'QR'), 0)::int "qrRevenue",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND o.order_source = 'POS')::int "posOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND o.order_source = 'POS'), 0)::int "posRevenue",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND p.method = 'CASH'), 0)::int "cashRevenue",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND p.method = 'QRIS'), 0)::int "qrisRevenue"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}`,
        params,
      ),
    ]);
    res.json({
      orders: ordersResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.get('/:id/receipt', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const order = (
      await pool.query(
        'SELECT o.id,o.customer_name "customerName",o.total_amount "totalAmount",o.order_status "orderStatus",o.payment_status "paymentStatus",o.created_at "createdAt",o.completed_at "completedAt",o.order_type "orderType",o.fulfillment_method "fulfillmentMethod",o.order_source "orderSource",t.name "tableName",p.method,p.cash_received "cashReceived",p.change_amount "changeAmount",p.paid_at "paidAt",m.name "merchantName",out.name "outletName",COALESCE(s.address,\'\') address,COALESCE(s.whatsapp,\'\') whatsapp,COALESCE(s.logo_url,\'\') "logoUrl" FROM orders o JOIN payments p ON p.order_id=o.id JOIN merchants m ON m.id=o.merchant_id JOIN outlets out ON out.id=o.outlet_id LEFT JOIN outlet_settings s ON s.outlet_id=o.outlet_id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.id=$1 AND o.merchant_id=$2 AND o.outlet_id=$3',
        [req.params.id, req.auth!.merchantId, req.auth!.outletId],
      )
    ).rows[0];
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const items = (
      await pool.query(
        'SELECT product_name "productName",unit_price "unitPrice",quantity,selections FROM order_items WHERE order_id=$1',
        [order.id],
      )
    ).rows;
    res.json({ ...order, items });
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const nextStatus = z.enum(['IN_PROGRESS', 'READY_TO_SERVE']).parse(req.body.status);
    const r = await pool.query(
      "UPDATE orders SET order_status=$1,completed_at=CASE WHEN $1='READY_TO_SERVE' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$2 AND merchant_id=$3 AND outlet_id=$4 AND payment_status='PAID' AND (($1='IN_PROGRESS' AND order_status='NEW_ORDER') OR ($1='READY_TO_SERVE' AND order_status='IN_PROGRESS')) RETURNING id,order_status \"orderStatus\",payment_status \"paymentStatus\",completed_at \"completedAt\",tracking_token_hash \"trackingTokenHash\"",
      [nextStatus, req.params.id, req.auth!.merchantId, req.auth!.outletId],
    );
    if (!r.rowCount) return res.status(400).json({ error: 'Transisi status tidak valid' });
    const updated = r.rows[0];
    publishTenantEvent({
      type: 'order:updated',
      merchantId: req.auth!.merchantId,
      outletId: req.auth!.outletId,
      orderId: updated.id,
      orderStatus: updated.orderStatus,
      paymentStatus: updated.paymentStatus,
    });
    publishTrackingEvent(updated.trackingTokenHash, {
      type: 'order:updated',
      orderId: updated.id,
      orderStatus: updated.orderStatus,
      paymentStatus: updated.paymentStatus,
    });
    res.json({
      id: updated.id,
      orderStatus: updated.orderStatus,
      completedAt: updated.completedAt,
    });
  } catch (e) {
    next(e);
  }
});

const cancelInput = z.object({ reason: z.string().trim().max(200).optional() });
merchantOrdersRouter.post('/:id/cancel', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const v = cancelInput.parse(req.body ?? {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = (
        await client.query(
          'SELECT o.id,o.order_status,o.payment_status,o.tracking_token_hash,p.id payment_id FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND o.merchant_id=$2 AND o.outlet_id=$3 FOR UPDATE',
          [req.params.id, req.auth!.merchantId, req.auth!.outletId],
        )
      ).rows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      }
      if (existing.order_status === 'READY_TO_SERVE' || existing.order_status === 'CANCELLED' || existing.order_status === 'EXPIRED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Pesanan sudah selesai atau dibatalkan' });
      }
      const isPaid = existing.payment_status === 'PAID';
      if (isPaid && req.auth!.role !== 'MERCHANT_OWNER') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Hanya pemilik merchant yang dapat membatalkan pesanan lunas (refund)' });
      }
      const nextPaymentStatus = isPaid ? 'REFUNDED' : 'FAILED';
      await client.query(
        `UPDATE orders SET order_status='CANCELLED', payment_status=$1, cancelled_at=now(), cancel_reason=$2, updated_at=now() WHERE id=$3`,
        [nextPaymentStatus, v.reason ?? '', existing.id],
      );
      await client.query(
        `UPDATE payments SET status=$1, refunded_at=CASE WHEN $1='REFUNDED' THEN now() ELSE refunded_at END, updated_at=now() WHERE id=$2`,
        [nextPaymentStatus, existing.payment_id],
      );
      await client.query(
        'INSERT INTO audit_logs(merchant_id,actor_user_id,action,entity_type,entity_id,payload)VALUES($1,$2,$3,$4,$5,$6)',
        [
          req.auth!.merchantId,
          req.auth!.sub,
          isPaid ? 'ORDER_CANCEL_REFUND' : 'ORDER_CANCEL_UNPAID',
          'order',
          existing.id,
          JSON.stringify({ reason: v.reason ?? '', previousStatus: existing.order_status }),
        ],
      );
      await client.query('COMMIT');

      const eventType = isPaid ? 'order:refunded' : 'order:cancelled';
      publishTenantEvent({
        type: eventType,
        merchantId: req.auth!.merchantId,
        outletId: req.auth!.outletId,
        orderId: existing.id,
        orderStatus: 'CANCELLED',
        paymentStatus: nextPaymentStatus,
      });
      publishTrackingEvent(existing.tracking_token_hash, {
        type: eventType,
        orderId: existing.id,
        orderStatus: 'CANCELLED',
        paymentStatus: nextPaymentStatus,
      });
      res.json({ id: existing.id, orderStatus: 'CANCELLED', paymentStatus: nextPaymentStatus });
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
