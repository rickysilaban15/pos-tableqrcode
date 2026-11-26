import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, requireAuth } from '../../middleware/auth.ts';
import { publishTenantEvent, publishTrackingEvent } from '../events/bus.ts';
import { expireAbandonedOrders } from '../orders/service.ts';

const input = z.object({ cashReceived: z.number().int().min(0).optional() });
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get('/', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);
    const method = typeof req.query.method === 'string' ? req.query.method : 'ALL';
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const params: unknown[] = [req.auth!.merchantId, req.auth!.outletId];
    const filters: string[] = [];
    if (method !== 'ALL') {
      params.push(method);
      filters.push(`p.method = $${params.length}`);
    }
    if (status !== 'ALL') {
      params.push(status);
      filters.push(`p.status = $${params.length}`);
    }
    if (source !== 'ALL') {
      params.push(source);
      filters.push(`o.order_source = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      filters.push(`(o.id::text ILIKE $${params.length} OR o.customer_name ILIKE $${params.length})`);
    }
    const whereExtra = filters.length ? ` AND ${filters.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT p.id, p.order_id "orderId", o.customer_name "customerName", o.order_source "orderSource", o.order_status "orderStatus", p.method, p.status, p.amount, p.cash_received "cashReceived", p.change_amount "changeAmount", p.created_at "createdAt", p.paid_at "paidAt", u.name "verifiedByName"
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       LEFT JOIN users u ON u.id = p.verified_by
       WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}
       ORDER BY p.created_at DESC
       LIMIT 200`,
      params,
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.get('/pending', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);
    const r = await pool.query(
      "SELECT o.id,o.customer_name \"customerName\",o.total_amount \"totalAmount\",o.created_at \"createdAt\",o.order_type \"orderType\",o.fulfillment_method \"fulfillmentMethod\",o.order_source \"orderSource\",t.name \"tableName\",p.method,p.status FROM orders o JOIN payments p ON p.order_id=o.id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.merchant_id=$1 AND o.outlet_id=$2 AND o.order_status='AWAITING_PAYMENT' ORDER BY o.created_at",
      [req.auth!.merchantId, req.auth!.outletId],
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/:orderId/confirm', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const v = input.parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const order = (
        await c.query(
          'SELECT o.id,o.total_amount,o.order_status,o.tracking_token_hash,p.id payment_id,p.method,p.status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND o.merchant_id=$2 AND o.outlet_id=$3 FOR UPDATE',
          [req.params.orderId, req.auth!.merchantId, req.auth!.outletId],
        )
      ).rows[0];
      if (!order) {
        await c.query('ROLLBACK');
        return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      }
      if (order.status === 'PAID') {
        await c.query('COMMIT');
        return res.status(409).json({ error: 'Pembayaran sudah dikonfirmasi' });
      }
      if (order.order_status === 'CANCELLED' || order.order_status === 'EXPIRED') {
        await c.query('ROLLBACK');
        return res.status(409).json({ error: 'Pesanan sudah dibatalkan atau kedaluwarsa' });
      }
      if (order.method === 'CASH' && (v.cashReceived === undefined || v.cashReceived < order.total_amount)) {
        await c.query('ROLLBACK');
        return res.status(400).json({ error: 'Nominal tunai kurang' });
      }
      const changeAmount = order.method === 'CASH' ? v.cashReceived! - order.total_amount : 0;
      await c.query(
        "UPDATE payments SET status='PAID',cash_received=$1,change_amount=$2,verified_by=$3,paid_at=now(),updated_at=now() WHERE id=$4",
        [order.method === 'CASH' ? v.cashReceived! : order.total_amount, changeAmount, req.auth!.sub, order.payment_id],
      );
      const updated = (
        await c.query(
          "UPDATE orders SET payment_status='PAID',order_status='NEW_ORDER',expires_at=NULL,updated_at=now() WHERE id=$1 RETURNING id,order_status \"orderStatus\",payment_status \"paymentStatus\"",
          [order.id],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO audit_logs(merchant_id,actor_user_id,action,entity_type,entity_id,payload)VALUES($1,$2,$3,$4,$5,$6)',
        [
          req.auth!.merchantId,
          req.auth!.sub,
          'PAYMENT_CONFIRMED',
          'order',
          order.id,
          JSON.stringify({ method: order.method, amount: order.total_amount }),
        ],
      );
      await c.query('COMMIT');

      publishTenantEvent({
        type: 'payment:confirmed',
        merchantId: req.auth!.merchantId,
        outletId: req.auth!.outletId,
        orderId: updated.id,
        orderStatus: updated.orderStatus,
        paymentStatus: updated.paymentStatus,
      });
      publishTrackingEvent(order.tracking_token_hash, {
        type: 'payment:confirmed',
        orderId: updated.id,
        orderStatus: updated.orderStatus,
        paymentStatus: updated.paymentStatus,
      });

      res.json({ ...updated, change: changeAmount });
    } catch (e) {
      await c.query('ROLLBACK');
      if ((e as { code?: string })?.code === '23505') {
        return res.status(409).json({ error: 'Pembayaran sudah dikonfirmasi' });
      }
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/:orderId/refund', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const order = (
        await c.query(
          'SELECT o.id,o.order_status,o.payment_status,o.tracking_token_hash,p.id payment_id FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND o.merchant_id=$2 AND o.outlet_id=$3 FOR UPDATE',
          [req.params.orderId, req.auth!.merchantId, req.auth!.outletId],
        )
      ).rows[0];
      if (!order) {
        await c.query('ROLLBACK');
        return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      }
      if (order.payment_status !== 'PAID') {
        await c.query('ROLLBACK');
        return res.status(409).json({ error: 'Hanya pembayaran lunas yang dapat di-refund' });
      }
      await c.query(
        "UPDATE payments SET status='REFUNDED', refunded_at=now(), updated_at=now() WHERE id=$1",
        [order.payment_id],
      );
      const nextOrderStatus = order.order_status === 'READY_TO_SERVE' ? 'READY_TO_SERVE' : 'CANCELLED';
      await c.query(
        `UPDATE orders SET payment_status='REFUNDED', order_status=$1, cancelled_at=CASE WHEN $1='CANCELLED' THEN now() ELSE cancelled_at END, cancel_reason=CASE WHEN $2<>'' THEN $2 ELSE cancel_reason END, updated_at=now() WHERE id=$3`,
        [nextOrderStatus, reason, order.id],
      );
      await c.query(
        'INSERT INTO audit_logs(merchant_id,actor_user_id,action,entity_type,entity_id,payload)VALUES($1,$2,$3,$4,$5,$6)',
        [req.auth!.merchantId, req.auth!.sub, 'PAYMENT_REFUNDED', 'order', order.id, JSON.stringify({ reason })],
      );
      await c.query('COMMIT');

      publishTenantEvent({
        type: 'order:refunded',
        merchantId: req.auth!.merchantId,
        outletId: req.auth!.outletId,
        orderId: order.id,
        orderStatus: nextOrderStatus,
        paymentStatus: 'REFUNDED',
      });
      publishTrackingEvent(order.tracking_token_hash, {
        type: 'order:refunded',
        orderId: order.id,
        orderStatus: nextOrderStatus,
        paymentStatus: 'REFUNDED',
      });
      res.json({ id: order.id, orderStatus: nextOrderStatus, paymentStatus: 'REFUNDED' });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    next(e);
  }
});
