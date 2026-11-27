import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, isUuid, requireAuth, requireMerchantContext } from '../../middleware/auth.ts';
import { getMerchantEntitlements } from '../../middleware/entitlement.ts';
import { sanitizeCsvCell } from '../../middleware/security.ts';
import { publishTenantEvent, publishTrackingEvent, subscribeTrackingEvents } from '../events/bus.ts';
import { isMerchantEligibleForDynamicQris } from '../payments/midtrans.ts';
import { reconcileOrderDynamicPayment } from '../payments/reconcile.ts';
import { createCheckoutOrder, expireAbandonedOrders } from './service.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  paymentMethod: z.enum(['CASH', 'QRIS', 'QRIS_DYNAMIC']),
  items: z.array(item).min(1).max(50),
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']).default('DINE_IN'),
  fulfillmentMethod: z.enum(['TABLE_SERVICE', 'PICKUP_COUNTER']).default('TABLE_SERVICE'),
});

type OutletPolicy = {
  merchant_id?: string;
  merchant_slug?: string;
  is_open: boolean;
  enable_dine_in: boolean;
  enable_takeaway: boolean;
  enable_table_service: boolean;
  enable_pickup_counter: boolean;
  enable_dynamic_qris?: boolean;
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
  if (input.paymentMethod === 'QRIS_DYNAMIC') {
    const check = isMerchantEligibleForDynamicQris(
      policy.merchant_id ?? '',
      policy.merchant_slug ?? '',
      policy.enable_dynamic_qris ?? true,
    );
    if (!check.eligible) {
      return { status: 400, error: check.reason || 'QRIS Otomatis belum tersedia untuk outlet ini' };
    }
  }
  return null;
}

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

function buildHistoryWhere(
  merchantId: string,
  outletId: string,
  query: Record<string, unknown>,
): { params: unknown[]; whereExtra: string } {
  const status = typeof query.status === 'string' ? query.status : 'READY_TO_SERVE';
  const source = typeof query.source === 'string' ? query.source : 'ALL';
  const method = typeof query.method === 'string' ? query.method : 'ALL';
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
  if (environment !== 'ALL') {
    params.push(environment);
    filters.push(`COALESCE(p.environment, 'PRODUCTION') = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    filters.push(
      `(o.id::text ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR COALESCE(t.name,'') ILIKE $${params.length} OR COALESCE(p.provider_order_id,'') ILIKE $${params.length})`,
    );
  }
  if (dateFrom) {
    params.push(dateFrom);
    filters.push(`o.created_at >= ($${params.length}::timestamp AT TIME ZONE 'Asia/Jakarta')`);
  }
  if (dateTo) {
    params.push(dateTo);
    filters.push(`o.created_at < (($${params.length}::timestamp + interval '1 day') AT TIME ZONE 'Asia/Jakarta')`);
  }
  return {
    params,
    whereExtra: filters.length ? ` AND ${filters.join(' AND ')}` : '',
  };
}

export const publicOrdersRouter = Router();

publicOrdersRouter.post('/qr/:token/orders', async (req, res, next) => {
  try {
    const db = pool;
    if (!db) throw Error('Database tidak tersedia');
    const input = body.parse(req.body);
    const qrContext = (
      await db.query(
        "SELECT t.id,t.merchant_id,m.slug merchant_slug,t.outlet_id,COALESCE(s.is_open,true) is_open,COALESCE(s.enable_dine_in,true) enable_dine_in,COALESCE(s.enable_takeaway,true) enable_takeaway,COALESCE(s.enable_table_service,true) enable_table_service,COALESCE(s.enable_pickup_counter,true) enable_pickup_counter,COALESCE(s.enable_dynamic_qris,true) enable_dynamic_qris,COALESCE(s.qris_image_url,'') qris_image_url FROM table_qr_codes q JOIN dining_tables t ON t.id=q.table_id JOIN merchants m ON m.id=t.merchant_id LEFT JOIN outlet_settings s ON s.outlet_id=t.outlet_id WHERE q.token_hash=$1 AND q.revoked_at IS NULL AND t.is_active=true",
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
        'SELECT o.id,o.outlet_id "outletId" FROM orders o WHERE o.tracking_token_hash=$1',
        [tokenHash],
      )
    ).rows[0];
    if (!o) return res.status(404).json({ error: 'Tracking tidak ditemukan' });
    await expireAbandonedOrders(o.outletId).catch(() => 0);
    const refreshed = (
      await pool.query(
        'SELECT o.id,o.customer_name "customerName",o.total_amount "totalAmount",o.order_status "orderStatus",o.payment_status "paymentStatus",o.order_type "orderType",o.fulfillment_method "fulfillmentMethod",o.order_source "orderSource",o.created_at "createdAt",o.updated_at "updatedAt",o.completed_at "completedAt",t.name "tableName",q.public_token "tableQrToken",p.method "paymentMethod",p.provider "paymentProvider",p.environment "paymentEnvironment",p.provider_order_id "providerOrderId",p.provider_status "providerStatus",p.qr_string "qrString",p.qr_image_url "qrImageUrl",p.expires_at "paymentExpiresAt",p.reconciliation_status "reconciliationStatus",p.cash_received "cashReceived",p.change_amount "changeAmount",p.paid_at "paidAt",m.name "merchantName",out.name "outletName",COALESCE(s.address,\'\') address,COALESCE(s.whatsapp,\'\') whatsapp,COALESCE(s.logo_url,\'\') "logoUrl" FROM orders o JOIN payments p ON p.order_id=o.id JOIN merchants m ON m.id=o.merchant_id JOIN outlets out ON out.id=o.outlet_id LEFT JOIN outlet_settings s ON s.outlet_id=o.outlet_id LEFT JOIN dining_tables t ON t.id=o.table_id LEFT JOIN LATERAL (SELECT public_token FROM table_qr_codes WHERE table_id = t.id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1) q ON true WHERE o.id=$1',
        [o.id],
      )
    ).rows[0];
    const items = (
      await pool.query(
        'SELECT product_name "productName",unit_price "unitPrice",quantity,selections FROM order_items WHERE order_id=$1 ORDER BY created_at, id',
        [o.id],
      )
    ).rows;
    res.json({ ...refreshed, items });
  } catch (e) {
    next(e);
  }
});

publicOrdersRouter.post('/tracking/:token/reconcile', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const tokenHash = hash(req.params.token);
    const reconciled = await reconcileOrderDynamicPayment({ trackingTokenHash: tokenHash });
    res.json(reconciled);
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
merchantOrdersRouter.use(requireAuth, requireMerchantContext);

merchantOrdersRouter.get('/entitlements', async (req, res, next) => {
  try {
    const entitlement = await getMerchantEntitlements(req.auth!.merchantId);
    res.json(entitlement);
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.post('/manual', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    const input = body
      .extend({
        tableId: z.string().uuid().optional(),
        cashReceived: z.number().int().min(0).max(200_000_000).optional(),
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
        "SELECT o.merchant_id,m.slug merchant_slug,COALESCE(s.is_open,true) is_open,COALESCE(s.enable_dine_in,true) enable_dine_in,COALESCE(s.enable_takeaway,true) enable_takeaway,COALESCE(s.enable_table_service,true) enable_table_service,COALESCE(s.enable_pickup_counter,true) enable_pickup_counter,COALESCE(s.enable_dynamic_qris,true) enable_dynamic_qris,COALESCE(s.qris_image_url,'') qris_image_url FROM outlets o JOIN merchants m ON m.id=o.merchant_id LEFT JOIN outlet_settings s ON s.outlet_id=o.id WHERE o.id=$1 AND o.merchant_id=$2",
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
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);
    const params = [req.auth!.merchantId, req.auth!.outletId];
    const [metrics, recent, tables, onboarding] = await Promise.all([
      pool.query(
        `WITH jkt AS (
           SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta') AS start_of_day
         )
         SELECT
           count(*) FILTER (WHERE o.created_at >= jkt.start_of_day)::int "totalOrders",
           count(*) FILTER (WHERE o.order_status = 'AWAITING_PAYMENT')::int "awaitingPaymentOrders",
           count(*) FILTER (WHERE o.order_status = 'NEW_ORDER' AND o.payment_status = 'PAID')::int "newOrders",
           count(*) FILTER (WHERE o.order_status = 'IN_PROGRESS' AND o.payment_status = 'PAID')::int "inProgressOrders",
           count(*) FILTER (WHERE o.order_status = 'READY_TO_SERVE' AND o.completed_at >= jkt.start_of_day)::int "readyOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND o.created_at >= jkt.start_of_day), 0)::int revenue,
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND p.environment = 'SANDBOX' AND o.created_at >= jkt.start_of_day), 0)::int "sandboxGrossToday",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND p.environment = 'SANDBOX' AND o.created_at >= jkt.start_of_day)::int "sandboxOrdersToday",
           count(*) FILTER (WHERE o.payment_status = 'PAID')::int "allTimePaidOrders"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         CROSS JOIN jkt
         WHERE o.merchant_id = $1 AND o.outlet_id = $2`,
        params,
      ),
      pool.query(
        `SELECT o.id, o.customer_name "customerName", o.total_amount "totalAmount",
                o.order_status "orderStatus", o.payment_status "paymentStatus",
                o.created_at "createdAt", o.order_type "orderType",
                o.fulfillment_method "fulfillmentMethod", o.order_source "orderSource",
                t.name "tableName", p.method, p.environment,
                (SELECT coalesce(sum(quantity),0)::int FROM order_items WHERE order_id = o.id) "itemCount"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2
           AND o.order_status NOT IN ('CANCELLED', 'EXPIRED')
         ORDER BY o.created_at DESC
         LIMIT 6`,
        params,
      ),
      pool.query(
        'SELECT count(*)::int total, count(*) FILTER (WHERE is_active)::int active FROM dining_tables WHERE merchant_id = $1 AND outlet_id = $2',
        params,
      ),
      pool.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM outlet_settings s
             WHERE s.outlet_id = $2 AND s.merchant_id = $1
               AND (trim(s.description) <> '' OR trim(s.address) <> '' OR trim(s.logo_url) <> '' OR trim(s.qris_image_url) <> '')
           ) "profileConfigured",
           EXISTS (SELECT 1 FROM categories c WHERE c.merchant_id = $1 AND c.outlet_id = $2 AND c.is_active = true) "hasCategory",
           EXISTS (SELECT 1 FROM products p WHERE p.merchant_id = $1 AND p.outlet_id = $2 AND p.is_active = true) "hasProduct",
           EXISTS (
             SELECT 1 FROM dining_tables t
             JOIN table_qr_codes q ON q.table_id = t.id AND q.revoked_at IS NULL
             WHERE t.merchant_id = $1 AND t.outlet_id = $2 AND t.is_active = true
           ) "hasTableWithQr",
           (
             SELECT q.public_token FROM dining_tables t
             JOIN table_qr_codes q ON q.table_id = t.id AND q.revoked_at IS NULL
             WHERE t.merchant_id = $1 AND t.outlet_id = $2 AND t.is_active = true AND q.public_token IS NOT NULL
             ORDER BY t.created_at ASC, q.created_at DESC
             LIMIT 1
           ) "firstQrToken"`,
        params,
      ),
    ]);

    const mRow = metrics.rows[0];
    const obRow = onboarding.rows[0];

    res.json({
      metrics: mRow,
      recentOrders: recent.rows,
      tables: tables.rows[0] ?? { total: 0, active: 0 },
      onboarding: {
        profileConfigured: Boolean(obRow?.profileConfigured),
        hasCategory: Boolean(obRow?.hasCategory),
        hasProduct: Boolean(obRow?.hasProduct),
        hasTableWithQr: Boolean(obRow?.hasTableWithQr),
        hasPaidOrder: Number(mRow?.allTimePaidOrders ?? 0) > 0,
        firstQrToken: obRow?.firstQrToken ?? null,
      },
    });
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.get('/', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const r = await pool.query(
      `SELECT o.id, o.customer_name "customerName", o.total_amount "totalAmount",
              o.order_status "orderStatus", o.payment_status "paymentStatus",
              o.created_at "createdAt", o.order_type "orderType",
              o.fulfillment_method "fulfillmentMethod", o.order_source "orderSource",
              t.name "tableName", p.method, p.provider, p.environment,
              p.provider_order_id "providerOrderId", p.reconciliation_status "reconciliationStatus",
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
         AND o.payment_status = 'PAID'
         AND o.order_status IN ('NEW_ORDER', 'IN_PROGRESS')
       ORDER BY o.created_at DESC`,
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

    const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '50', 10) || 50));
    const offset = (page - 1) * pageSize;

    const { params, whereExtra } = buildHistoryWhere(req.auth!.merchantId, req.auth!.outletId, req.query as Record<string, unknown>);
    const pagedParams = [...params, pageSize, offset];

    const [ordersResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT o.id, o.customer_name "customerName", o.total_amount "totalAmount",
                o.order_status "orderStatus", o.payment_status "paymentStatus",
                o.order_type "orderType", o.fulfillment_method "fulfillmentMethod",
                o.order_source "orderSource", t.name "tableName", p.method,
                p.provider, p.environment, p.provider_order_id "providerOrderId",
                p.reconciliation_status "reconciliationStatus",
                p.cash_received "cashReceived", p.change_amount "changeAmount",
                p.paid_at "paidAt", o.created_at "createdAt", o.completed_at "completedAt",
                (SELECT coalesce(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) "itemCount"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}
         ORDER BY COALESCE(o.completed_at, o.created_at) DESC, o.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams,
      ),
      pool.query(
        `SELECT
           count(*)::int "totalMatching",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX')::int "paidOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX'), 0)::int "paidRevenue",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND o.order_source = 'QR')::int "qrOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND o.order_source = 'QR'), 0)::int "qrRevenue",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND o.order_source = 'POS')::int "posOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND o.order_source = 'POS'), 0)::int "posRevenue",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND p.method = 'CASH'), 0)::int "cashRevenue",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND p.method = 'QRIS'), 0)::int "qrisRevenue",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND COALESCE(p.environment, 'PRODUCTION') <> 'SANDBOX' AND p.method = 'QRIS_DYNAMIC'), 0)::int "qrisDynamicGross",
           count(*) FILTER (WHERE o.payment_status = 'PAID' AND p.environment = 'SANDBOX')::int "sandboxPaidOrders",
           coalesce(sum(o.total_amount) FILTER (WHERE o.payment_status = 'PAID' AND p.environment = 'SANDBOX'), 0)::int "sandboxGrossVolume"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}`,
        params,
      ),
    ]);

    const { totalMatching = 0, ...summary } = summaryResult.rows[0] ?? {};
    const totalPages = Math.max(1, Math.ceil(totalMatching / pageSize));

    res.json({
      orders: ordersResult.rows,
      summary,
      pagination: {
        page,
        pageSize,
        total: totalMatching,
        totalPages,
      },
    });
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.get('/history/export.csv', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    await expireAbandonedOrders(req.auth!.outletId).catch(() => 0);

    const { params, whereExtra } = buildHistoryWhere(req.auth!.merchantId, req.auth!.outletId, req.query as Record<string, unknown>);
    const rows = (
      await pool.query(
        `SELECT o.id, o.created_at "createdAt", o.completed_at "completedAt",
                o.customer_name "customerName", o.order_type "orderType",
                o.order_source "orderSource", t.name "tableName",
                o.order_status "orderStatus", o.payment_status "paymentStatus",
                p.method, p.provider, p.environment, p.provider_order_id "providerOrderId",
                o.total_amount "totalAmount",
                p.cash_received "cashReceived", p.change_amount "changeAmount",
                p.paid_at "paidAt"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.merchant_id = $1 AND o.outlet_id = $2${whereExtra}
         ORDER BY COALESCE(o.completed_at, o.created_at) DESC, o.id DESC
         LIMIT 50000`,
        params,
      )
    ).rows;

    const statusLabel: Record<string, string> = {
      AWAITING_PAYMENT: 'Menunggu Bayar',
      NEW_ORDER: 'Pesanan Masuk',
      IN_PROGRESS: 'Diproses',
      READY_TO_SERVE: 'Pesanan Siap',
      CANCELLED: 'Dibatalkan',
      EXPIRED: 'Kedaluwarsa',
    };
    const payLabel: Record<string, string> = {
      PAID: 'Lunas',
      PENDING_VERIFICATION: 'Menunggu Verifikasi',
      UNPAID: 'Belum Dibayar',
      REFUNDED: 'Dikembalikan',
      FAILED: 'Gagal',
      EXPIRED: 'Kedaluwarsa',
    };
    const methodLabel: Record<string, string> = {
      CASH: 'Tunai',
      QRIS: 'QRIS Statis',
      QRIS_DYNAMIC: 'QRIS Otomatis (Bruto)',
    };

    const header = [
      'ID Pesanan',
      'Waktu Dibuat (WIB)',
      'Pelanggan',
      'Jenis',
      'Sumber',
      'Meja',
      'Status Pesanan',
      'Status Bayar',
      'Metode',
      'Penyedia',
      'Lingkungan',
      'ID Transaksi Penyedia',
      'Total Bruto (Rp)',
      'Tunai Diterima (Rp)',
      'Kembalian (Rp)',
      'Waktu Lunas (WIB)',
    ].map(sanitizeCsvCell);

    const dataLines = rows.map((o) =>
      [
        o.id,
        formatWibCsv(o.createdAt),
        o.customerName,
        o.orderType === 'DINE_IN' ? 'Dine In' : 'Takeaway',
        o.orderSource,
        o.tableName ?? '',
        statusLabel[o.orderStatus] ?? o.orderStatus,
        payLabel[o.paymentStatus] ?? o.paymentStatus,
        methodLabel[o.method] ?? o.method,
        o.provider ?? 'INTERNAL',
        o.environment === 'SANDBOX' ? 'SANDBOX (Simulasi)' : 'PRODUKSI',
        o.providerOrderId ?? '',
        o.totalAmount,
        o.cashReceived ?? '',
        o.changeAmount ?? '',
        formatWibCsv(o.paidAt),
      ]
        .map(sanitizeCsvCell)
        .join(','),
    );

    const csv = '\uFEFF' + [header.join(','), ...dataLines].join('\n');
    const todayWib = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="warkopos-orders-${todayWib}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.get('/:id/receipt', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (!pool) throw Error('Database tidak tersedia');
    const order = (
      await pool.query(
        'SELECT o.id,o.customer_name "customerName",o.total_amount "totalAmount",o.order_status "orderStatus",o.payment_status "paymentStatus",o.created_at "createdAt",o.completed_at "completedAt",o.order_type "orderType",o.fulfillment_method "fulfillmentMethod",o.order_source "orderSource",t.name "tableName",p.method,p.provider "paymentProvider",p.environment "paymentEnvironment",p.provider_order_id "providerOrderId",p.provider_transaction_id "providerTransactionId",p.reconciliation_status "reconciliationStatus",p.cash_received "cashReceived",p.change_amount "changeAmount",p.paid_at "paidAt",m.name "merchantName",out.name "outletName",COALESCE(s.address,\'\') address,COALESCE(s.whatsapp,\'\') whatsapp,COALESCE(s.logo_url,\'\') "logoUrl" FROM orders o JOIN payments p ON p.order_id=o.id JOIN merchants m ON m.id=o.merchant_id JOIN outlets out ON out.id=o.outlet_id LEFT JOIN outlet_settings s ON s.outlet_id=o.outlet_id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.id=$1 AND o.merchant_id=$2 AND o.outlet_id=$3',
        [req.params.id, req.auth!.merchantId, req.auth!.outletId],
      )
    ).rows[0];
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const items = (
      await pool.query(
        'SELECT product_name "productName",unit_price "unitPrice",quantity,selections FROM order_items WHERE order_id=$1 ORDER BY created_at, id',
        [order.id],
      )
    ).rows;
    res.json({ ...order, items });
  } catch (e) {
    next(e);
  }
});

merchantOrdersRouter.patch('/:id/status', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (!pool) throw Error('Database tidak tersedia');
    const nextStatus = z.enum(['IN_PROGRESS', 'READY_TO_SERVE']).parse(req.body?.status);
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
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
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
