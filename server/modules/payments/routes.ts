import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, isUuid, requireAuth, requireMerchantContext } from '../../middleware/auth.ts';
import { sanitizeCsvCell } from '../../middleware/security.ts';
import { publishTenantEvent, publishTrackingEvent } from '../events/bus.ts';
import { expireAbandonedOrders } from '../orders/service.ts';
import { reconcileOrderDynamicPayment } from './reconcile.ts';

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
const input = z.object({ cashReceived: z.number().int().min(0).max(200_000_000).optional() });

function formatWibCsv(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return (
    d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' WIB'
  );
}

function buildPaymentWhere(
  merchantId: string,
  outletId: string,
  query: Record<string, unknown>,
): { params: unknown[]; whereExtra: string } {
  const method = typeof query.method === 'string' ? query.method : 'ALL';
  const status = typeof query.status === 'string' ? query.status : 'ALL';
  const source = typeof query.source === 'string' ? query.source : 'ALL';
  const environment = typeof query.environment === 'string' ? query.environment : 'ALL';
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const dateFrom = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  const dateTo = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';

  if (dateFrom && !DATE_PARAM_RE.test(dateFrom)) {
    throw Object.assign(Error('Format tanggal awal tidak valid (gunakan YYYY-MM-DD)'), { status: 400 });
  }
  if (dateTo && !DATE_PARAM_RE.test(dateTo)) {
    throw Object.assign(Error('Format tanggal akhir tidak valid (gunakan YYYY-MM-DD)'), { status: 400 });
  }

  const params: unknown[] = [merchantId, outletId];
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
  if (environment !== 'ALL') {
    params.push(environment);
    filters.push(`COALESCE(p.environment, 'PRODUCTION') = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    filters.push(
      `(o.id::text ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR COALESCE(p.provider_order_id,'') ILIKE $${params.length})`,
    );
  }
  if (dateFrom) {
    params.push(dateFrom);
    filters.push(`COALESCE(p.paid_at, p.created_at) >= ($${params.length}::timestamp AT TIME ZONE 'Asia/Jakarta')`);
  }
  if (dateTo) {
    params.push(dateTo);
    filters.push(
      `COALESCE(p.paid_at, p.created_at) < (($${params.length}::timestamp + interval '1 day') AT TIME ZONE 'Asia/Jakarta')`,
    );
  }
  return {
    params,
    whereExtra: filters.length ? ` AND ${filters.join(' AND ')}` : '',
  };
}

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireMerchantContext);

paymentsRouter.get('/', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);

    const paginated = req.query.paginated === '1';
    const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : paginated ? '50' : '200', 10) || 50),
    );
    const offset = (page - 1) * pageSize;

    const { params, whereExtra } = buildPaymentWhere(req.auth!.merchantId, req.auth!.outletId, req.query as Record<string, unknown>);
    const pagedParams = [...params, pageSize, offset];

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT p.id, p.order_id "orderId", o.customer_name "customerName", o.order_source "orderSource",
                o.order_status "orderStatus", p.method, p.provider, p.environment,
                p.provider_order_id "providerOrderId", p.provider_transaction_id "providerTransactionId",
                p.provider_status "providerStatus", p.reconciliation_status "reconciliationStatus",
                p.status, p.amount, p.expected_gross_amount "expectedGrossAmount", p.currency,
                p.cash_received "cashReceived", p.change_amount "changeAmount",
                p.created_at "createdAt", p.paid_at "paidAt", p.expires_at "expiresAt",
                u.name "verifiedByName"
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN users u ON u.id = p.verified_by
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}
         ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams,
      ),
      pool.query(
        `SELECT count(*)::int total
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}`,
        params,
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    res.setHeader('X-Total-Count', String(total));

    if (paginated) {
      return res.json({
        payments: rowsResult.rows,
        pagination: { page, pageSize, total, totalPages },
      });
    }
    res.json(rowsResult.rows);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.get('/export.csv', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);
    const { params, whereExtra } = buildPaymentWhere(req.auth!.merchantId, req.auth!.outletId, req.query as Record<string, unknown>);
    const rows = (
      await pool.query(
        `SELECT p.id, p.order_id "orderId", p.created_at "createdAt", p.paid_at "paidAt",
                o.customer_name "customerName", o.order_source "orderSource",
                o.order_status "orderStatus", p.method, p.provider, p.environment,
                p.provider_order_id "providerOrderId", p.provider_transaction_id "providerTransactionId",
                p.reconciliation_status "reconciliationStatus",
                p.status, p.amount, p.cash_received "cashReceived", p.change_amount "changeAmount",
                u.name "verifiedByName"
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN users u ON u.id = p.verified_by
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}
         ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
         LIMIT 50000`,
        params,
      )
    ).rows;

    const methodLabel: Record<string, string> = {
      CASH: 'Tunai',
      QRIS: 'QRIS Statis',
      QRIS_DYNAMIC: 'QRIS Otomatis (Bruto)',
    };

    const header = [
      'ID Pembayaran',
      'ID Pesanan',
      'Waktu Dibuat (WIB)',
      'Pelanggan',
      'Sumber',
      'Status Pesanan',
      'Metode',
      'Penyedia',
      'Lingkungan',
      'ID Order Penyedia',
      'Status Rekonsiliasi',
      'Status Pembayaran',
      'Nominal Bruto (Rp)',
      'Tunai Diterima (Rp)',
      'Kembalian (Rp)',
      'Waktu Lunas (WIB)',
      'Diverifikasi Oleh',
    ].map(sanitizeCsvCell);

    const dataLines = rows.map((p) =>
      [
        p.id,
        p.orderId,
        formatWibCsv(p.createdAt),
        p.customerName,
        p.orderSource,
        p.orderStatus,
        methodLabel[p.method] ?? p.method,
        p.provider ?? 'INTERNAL',
        p.environment === 'SANDBOX' ? 'SANDBOX (Simulasi)' : 'PRODUKSI',
        p.providerOrderId ?? '',
        p.reconciliationStatus ?? '',
        p.status,
        p.amount,
        p.cashReceived ?? '',
        p.changeAmount ?? '',
        formatWibCsv(p.paidAt),
        p.verifiedByName ?? (p.provider === 'MIDTRANS' ? 'Midtrans Status API' : ''),
      ]
        .map(sanitizeCsvCell)
        .join(','),
    );

    const csv = '\uFEFF' + [header.join(','), ...dataLines].join('\n');
    const todayWib = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="warkopos-payments-${todayWib}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.get('/pending', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);
    const r = await pool.query(
      `SELECT o.id, o.customer_name "customerName", o.total_amount "totalAmount",
              o.created_at "createdAt", o.order_type "orderType",
              o.fulfillment_method "fulfillmentMethod", o.order_source "orderSource",
              t.name "tableName", p.method, p.provider, p.environment,
              p.provider_order_id "providerOrderId", p.provider_status "providerStatus",
              p.reconciliation_status "reconciliationStatus",
              p.qr_string "qrString", p.qr_image_url "qrImageUrl", p.expires_at "expiresAt",
              p.status,
              COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'productName', oi.product_name,
                    'unitPrice', oi.unit_price,
                    'quantity', oi.quantity,
                    'selections', oi.selections
                  ) ORDER BY oi.created_at, oi.id
                )
                FROM order_items oi WHERE oi.order_id = o.id
              ), '[]'::json) items
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       LEFT JOIN dining_tables t ON t.id = o.table_id
       WHERE o.merchant_id = $1 AND o.outlet_id = $2
         AND o.order_status = 'AWAITING_PAYMENT'
       ORDER BY o.created_at ASC`,
      [req.auth!.merchantId, req.auth!.outletId],
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/:orderId/reconcile', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.orderId)) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const reconciled = await reconcileOrderDynamicPayment({
      orderId: req.params.orderId,
      merchantId: req.auth!.merchantId,
      outletId: req.auth!.outletId,
    });
    res.json(reconciled);
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post('/:orderId/confirm', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.orderId)) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (!pool) throw Error('Database tidak tersedia');
    const v = input.parse(req.body ?? {});
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const order = (
        await c.query(
          'SELECT o.id,o.total_amount,o.order_status,o.tracking_token_hash,p.id payment_id,p.method,p.provider,p.status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND o.merchant_id=$2 AND o.outlet_id=$3 FOR UPDATE',
          [req.params.orderId, req.auth!.merchantId, req.auth!.outletId],
        )
      ).rows[0];
      if (!order) {
        await c.query('ROLLBACK');
        return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      }
      if (order.method === 'QRIS_DYNAMIC' || order.provider === 'MIDTRANS') {
        await c.query('ROLLBACK');
        return res.status(409).json({
          error:
            'Pembayaran QRIS Otomatis hanya dapat diverifikasi secara otoritatif melalui Midtrans, bukan konfirmasi manual.',
        });
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
    if (!isUuid(req.params.orderId)) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
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
