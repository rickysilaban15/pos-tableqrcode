import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../server.ts';
import { pool } from '../database/client.ts';
import { env } from '../config/env.ts';
import { importLegacyStateToPostgres } from '../scripts/migrate-legacy-json.ts';
import { publishTenantEvent, publishTrackingEvent, subscribeTenantEvents, subscribeTrackingEvents } from '../modules/events/bus.ts';
import { createSeedData } from '../../src/data/seedData.ts';

let app: Express;

type SeedTenant = {
  userId: string;
  email: string;
  merchantId: string;
  outletId: string;
  cookie: string;
  cashierCookie?: string;
  categoryId?: string;
  productId?: string;
  variantAId?: string;
  variantBId?: string;
  addonId?: string;
  tableId?: string;
  qrToken?: string;
};

let superAdminCookie = '';
let tenantA: SeedTenant;
let tenantB: SeedTenant;

function signSessionCookie(claims: {
  sub: string;
  merchantId: string;
  outletId: string;
  role: 'SUPER_ADMIN' | 'MERCHANT_OWNER' | 'CASHIER';
}): string {
  const token = jwt.sign(claims, env.JWT_SECRET!, { expiresIn: '1h' });
  return `laris_session=${token}`;
}

beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL!;
  const parsed = new URL(dbUrl);
  const dbName = parsed.pathname.slice(1);
  if (!dbName.endsWith('_e2e')) {
    throw new Error(`Refusing non-e2e database: ${dbName}`);
  }

  // Ensure isolated Vitest DB exists
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = '/postgres';
  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();
  const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) {
    await adminClient.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  }
  await adminClient.end();

  if (!pool) throw new Error('Pool unavailable');

  // Apply all migrations idempotently
  await pool.query(
    'CREATE TABLE IF NOT EXISTS _laris_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const migDir = path.resolve('server/database/migrations');
  const files = (await fs.readdir(migDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files) {
    const applied = await pool.query('SELECT 1 FROM _laris_migrations WHERE name = $1', [name]);
    if (!applied.rowCount) {
      const sql = await fs.readFile(path.join(migDir, name), 'utf8');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(sql);
        await c.query('INSERT INTO _laris_migrations(name) VALUES($1)', [name]);
        await c.query('COMMIT');
      } catch (err) {
        await c.query('ROLLBACK');
        throw err;
      } finally {
        c.release();
      }
    }
  }

  // Clean isolated database tables
  await pool.query(`
    TRUNCATE
      payment_webhook_events,
      subscription_invoices,
      legacy_qr_mappings,
      audit_logs,
      payments,
      order_item_addons,
      order_items,
      orders,
      table_sessions,
      table_qr_codes,
      dining_tables,
      product_addons,
      product_variants,
      products,
      categories,
      outlet_settings,
      merchant_memberships,
      subscriptions,
      outlets,
      merchants,
      users,
      plan_features,
      subscription_plans
    CASCADE
  `);

  // Seed centralized plans
  for (const [code, name, price, days] of [
    ['basic', 'Basic', 50000, 14],
    ['pro', 'Pro', 120000, 14],
    ['business', 'Business', 250000, 14],
  ] as const) {
    await pool.query(
      'INSERT INTO subscription_plans(code, name, monthly_price, trial_days, is_active) VALUES($1,$2,$3,$4,true)',
      [code, name, price, days],
    );
  }

  const basicPlanId = (await pool.query("SELECT id FROM subscription_plans WHERE code = 'basic'")).rows[0].id;
  const pwHash = await bcrypt.hash('password-test-1234', 10);

  // Super Admin
  const saUser = (
    await pool.query(
      "INSERT INTO users(email, password_hash, name, is_super_admin, is_active) VALUES('sa@vitest.local', $1, 'Super Admin', true, true) RETURNING id",
      [pwHash],
    )
  ).rows[0];
  superAdminCookie = signSessionCookie({ sub: saUser.id, merchantId: '', outletId: '', role: 'SUPER_ADMIN' });

  // Helper to seed a tenant
  async function createTenant(tag: string): Promise<SeedTenant> {
    const u = (
      await pool!.query('INSERT INTO users(email, password_hash, name) VALUES($1, $2, $3) RETURNING id, email', [
        `owner-${tag}@vitest.local`,
        pwHash,
        `Owner ${tag}`,
      ])
    ).rows[0];
    const m = (
      await pool!.query('INSERT INTO merchants(name, slug) VALUES($1, $2) RETURNING id', [
        `Merchant ${tag}`,
        `merchant-${tag}`,
      ])
    ).rows[0];
    const o = (
      await pool!.query('INSERT INTO outlets(merchant_id, name, slug) VALUES($1, $2, $3) RETURNING id', [
        m.id,
        `Outlet ${tag}`,
        `outlet-${tag}`,
      ])
    ).rows[0];
    await pool!.query("INSERT INTO merchant_memberships(merchant_id, user_id, role) VALUES($1, $2, 'MERCHANT_OWNER')", [
      m.id,
      u.id,
    ]);
    await pool!.query(
      "INSERT INTO outlet_settings(outlet_id, merchant_id, qris_image_url) VALUES($1, $2, 'data:image/png;base64,iVBORw0KGgo=')",
      [o.id, m.id],
    );
    await pool!.query(
      "INSERT INTO subscriptions(merchant_id, plan_id, status, trial_ends_at, qr_ordering_enabled, pos_enabled) VALUES($1, $2, 'TRIAL', now() + interval '14 days', true, true)",
      [m.id, basicPlanId],
    );
    return {
      userId: u.id,
      email: u.email,
      merchantId: m.id,
      outletId: o.id,
      cookie: signSessionCookie({ sub: u.id, merchantId: m.id, outletId: o.id, role: 'MERCHANT_OWNER' }),
    };
  }

  tenantA = await createTenant('a');
  tenantB = await createTenant('b');

  // Add a CASHIER user for Tenant A
  const cashierA = (
    await pool.query("INSERT INTO users(email, password_hash, name) VALUES('cashier-a@vitest.local', $1, 'Kasir A') RETURNING id", [
      pwHash,
    ])
  ).rows[0];
  await pool.query("INSERT INTO merchant_memberships(merchant_id, user_id, role) VALUES($1, $2, 'CASHIER')", [
    tenantA.merchantId,
    cashierA.id,
  ]);
  tenantA.cashierCookie = signSessionCookie({
    sub: cashierA.id,
    merchantId: tenantA.merchantId,
    outletId: tenantA.outletId,
    role: 'CASHIER',
  });

  // Seed catalog & QR table for Tenant A
  const cat = (
    await pool.query('INSERT INTO categories(merchant_id, outlet_id, name, sort_order) VALUES($1,$2,$3,1) RETURNING id', [
      tenantA.merchantId,
      tenantA.outletId,
      'Signature Coffee',
    ])
  ).rows[0];
  const prod = (
    await pool.query(
      'INSERT INTO products(merchant_id, outlet_id, category_id, name, description, price) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [tenantA.merchantId, tenantA.outletId, cat.id, 'Kopi Aren Vitest', 'Kopi susu gula aren', 20000],
    )
  ).rows[0];
  const varReg = (
    await pool.query(
      "INSERT INTO product_variants(product_id, group_name, option_name, price_delta, required) VALUES($1,'Ukuran','Regular',0,true) RETURNING id",
      [prod.id],
    )
  ).rows[0];
  const varLrg = (
    await pool.query(
      "INSERT INTO product_variants(product_id, group_name, option_name, price_delta, required) VALUES($1,'Ukuran','Large',5000,true) RETURNING id",
      [prod.id],
    )
  ).rows[0];
  const addon = (
    await pool.query("INSERT INTO product_addons(product_id, name, price) VALUES($1,'Extra Shot',4000) RETURNING id", [
      prod.id,
    ])
  ).rows[0];
  const tbl = (
    await pool.query("INSERT INTO dining_tables(merchant_id, outlet_id, name, area) VALUES($1,$2,'A01','Indoor') RETURNING id", [
      tenantA.merchantId,
      tenantA.outletId,
    ])
  ).rows[0];
  const qrToken = crypto.randomBytes(32).toString('base64url');
  const qrHash = crypto.createHash('sha256').update(qrToken).digest('hex');
  await pool.query('INSERT INTO table_qr_codes(table_id, token_hash, public_token) VALUES($1,$2,$3)', [
    tbl.id,
    qrHash,
    qrToken,
  ]);

  tenantA.categoryId = cat.id;
  tenantA.productId = prod.id;
  tenantA.variantAId = varReg.id;
  tenantA.variantBId = varLrg.id;
  tenantA.addonId = addon.id;
  tenantA.tableId = tbl.id;
  tenantA.qrToken = qrToken;

  app = await createApp();
});

afterAll(async () => {
  await pool?.end();
});

describe('Phase 4 — Order & Payment Financial Integrity', () => {
  it('enforces server-authoritative pricing, variant group exclusivity, concurrent idempotency, and Pay-First lifecycle', async () => {
    // 1. Rejects selecting 2 options from the same variant group
    const multiOptionRes = await request(app)
      .post(`/api/public/qr/${tenantA.qrToken}/orders`)
      .send({
        customerName: 'Multi Variant Tamper',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'CASH',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [
          {
            productId: tenantA.productId,
            quantity: 1,
            variantIds: [tenantA.variantAId, tenantA.variantBId],
            addonIds: [],
          },
        ],
      });
    expect(multiOptionRes.status).toBe(400);
    expect(multiOptionRes.body.error).toMatch(/satu opsi/i);

    // 2. Concurrent duplicate order submissions with same idempotencyKey create exactly 1 order and ignore client price tampering
    const idemKey = crypto.randomUUID();
    const orderPayload = {
      customerName: 'Pelanggan Idempoten',
      idempotencyKey: idemKey,
      paymentMethod: 'CASH',
      orderType: 'DINE_IN',
      fulfillmentMethod: 'TABLE_SERVICE',
      totalAmount: 1, // Tampered client total
      items: [
        {
          productId: tenantA.productId,
          quantity: 2,
          variantIds: [tenantA.variantBId], // +5000
          addonIds: [tenantA.addonId], // +4000 -> unit = 29000, subtotal = 58000
          price: 100, // Tampered client price
        },
      ],
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post(`/api/public/qr/${tenantA.qrToken}/orders`).send(orderPayload)),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 201]);
    const created = responses.find((r) => r.status === 201)!.body;
    expect(created.totalAmount).toBe(58000);
    expect(created.orderStatus).toBe('AWAITING_PAYMENT');
    expect(created.paymentStatus).toBe('UNPAID');
    expect(created.trackingToken).toBeTruthy();

    // 3. Pay-First enforcement: unpaid order CANNOT enter IN_PROGRESS or READY_TO_SERVE
    const prematureAdvance = await request(app)
      .patch(`/api/v1/orders/${created.id}/status`)
      .set('Cookie', tenantA.cookie)
      .send({ status: 'IN_PROGRESS' });
    expect(prematureAdvance.status).toBe(400);

    // 4. Insufficient cash is rejected
    const shortCash = await request(app)
      .post(`/api/v1/payments/${created.id}/confirm`)
      .set('Cookie', tenantA.cookie)
      .send({ cashReceived: 50000 });
    expect(shortCash.status).toBe(400);

    // 5. Concurrent payment confirmation is atomic: only 1 succeeds (200), repeats get 409, accurate change computed
    const confirmResponses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app).post(`/api/v1/payments/${created.id}/confirm`).set('Cookie', tenantA.cookie).send({ cashReceived: 60000 }),
      ),
    );
    const confirmStatuses = confirmResponses.map((r) => r.status).sort();
    expect(confirmStatuses).toEqual([200, 409, 409]);
    const confirmed = confirmResponses.find((r) => r.status === 200)!.body;
    expect(confirmed.change).toBe(2000);
    expect(confirmed.orderStatus).toBe('NEW_ORDER');
    expect(confirmed.paymentStatus).toBe('PAID');

    // 6. Valid lifecycle transitions: NEW_ORDER -> IN_PROGRESS -> READY_TO_SERVE (terminal)
    const toProgress = await request(app)
      .patch(`/api/v1/orders/${created.id}/status`)
      .set('Cookie', tenantA.cookie)
      .send({ status: 'IN_PROGRESS' });
    expect(toProgress.status).toBe(200);

    const toReady = await request(app)
      .patch(`/api/v1/orders/${created.id}/status`)
      .set('Cookie', tenantA.cookie)
      .send({ status: 'READY_TO_SERVE' });
    expect(toReady.status).toBe(200);
    expect(toReady.body.completedAt).toBeTruthy();

    // Cannot regress from READY_TO_SERVE
    const regress = await request(app)
      .patch(`/api/v1/orders/${created.id}/status`)
      .set('Cookie', tenantA.cookie)
      .send({ status: 'IN_PROGRESS' });
    expect(regress.status).toBe(400);
  });

  it('preserves historical pricing snapshot when product catalog price changes later', async () => {
    const posKey = crypto.randomUUID();
    const posPayload = {
      customerName: 'Snapshot Test',
      idempotencyKey: posKey,
      paymentMethod: 'CASH',
      cashReceived: 30000,
      orderType: 'TAKEAWAY',
      fulfillmentMethod: 'PICKUP_COUNTER',
      items: [{ productId: tenantA.productId, quantity: 1, variantIds: [tenantA.variantAId], addonIds: [] }],
    };

    const posRes = await request(app).post('/api/v1/orders/manual').set('Cookie', tenantA.cookie).send(posPayload);
    expect(posRes.status).toBe(201);
    expect(posRes.body.totalAmount).toBe(20000);
    expect(posRes.body.change).toBe(10000);

    // Idempotent POS cash replay preserves `change`
    const replayRes = await request(app).post('/api/v1/orders/manual').set('Cookie', tenantA.cookie).send(posPayload);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.idempotent).toBe(true);
    expect(replayRes.body.change).toBe(10000);

    // Update catalog price from 20000 -> 35000
    const pricePatch = await request(app)
      .patch(`/api/v1/products/${tenantA.productId}`)
      .set('Cookie', tenantA.cookie)
      .send({ price: 35000 });
    expect(pricePatch.status).toBe(200);

    // Receipt still reflects historical snapshot (20000)
    const receiptRes = await request(app)
      .get(`/api/v1/orders/${posRes.body.id}/receipt`)
      .set('Cookie', tenantA.cookie);
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.totalAmount).toBe(20000);
    expect(receiptRes.body.items[0].unitPrice).toBe(20000);

    // Restore price back to 20000
    await request(app)
      .patch(`/api/v1/products/${tenantA.productId}`)
      .set('Cookie', tenantA.cookie)
      .send({ price: 20000 });
  });
});

describe('Phase 5 — Multi-Tenant Security, RBAC, XSS & CSRF Boundaries', () => {
  it('prevents cross-tenant access, enforces role boundaries, blocks Super Admin on /api/v1, and blocks cross-site CSRF', async () => {
    // Create QRIS order on Tenant A
    const qrisOrder = await request(app)
      .post(`/api/public/qr/${tenantA.qrToken}/orders`)
      .send({
        customerName: 'Tenant Isolation Order',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'QRIS',
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        items: [{ productId: tenantA.productId, quantity: 1, variantIds: [tenantA.variantAId], addonIds: [] }],
      });
    expect(qrisOrder.status).toBe(201);
    const orderId = qrisOrder.body.id;

    // Unauthenticated customer cannot confirm own static QRIS payment
    const unauthConfirm = await request(app).post(`/api/v1/payments/${orderId}/confirm`).send({});
    expect(unauthConfirm.status).toBe(401);

    // Tenant B cannot see Tenant A's pending payments, receipt, products, or confirm Tenant A's payment
    const tenantBPending = await request(app).get('/api/v1/payments/pending').set('Cookie', tenantB.cookie);
    expect(tenantBPending.status).toBe(200);
    expect(tenantBPending.body.find((o: { id: string }) => o.id === orderId)).toBeUndefined();

    const tenantBConfirm = await request(app)
      .post(`/api/v1/payments/${orderId}/confirm`)
      .set('Cookie', tenantB.cookie)
      .send({});
    expect(tenantBConfirm.status).toBe(404);

    const tenantBReceipt = await request(app).get(`/api/v1/orders/${orderId}/receipt`).set('Cookie', tenantB.cookie);
    expect(tenantBReceipt.status).toBe(404);

    const tenantBEditProd = await request(app)
      .patch(`/api/v1/products/${tenantA.productId}`)
      .set('Cookie', tenantB.cookie)
      .send({ price: 1000 });
    expect(tenantBEditProd.status).toBe(404);

    // Cross-site CSRF attempt with valid session cookie is rejected (403)
    const csrfOrigin = await request(app)
      .post(`/api/v1/payments/${orderId}/confirm`)
      .set('Cookie', tenantA.cookie)
      .set('Origin', 'https://attacker.evil.example')
      .send({});
    expect(csrfOrigin.status).toBe(403);

    const csrfFetchSite = await request(app)
      .post(`/api/v1/payments/${orderId}/confirm`)
      .set('Cookie', tenantA.cookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({});
    expect(csrfFetchSite.status).toBe(403);

    // Cashier can confirm QRIS payment, but CANNOT delete products, update settings, or refund paid orders
    const cashierConfirm = await request(app)
      .post(`/api/v1/payments/${orderId}/confirm`)
      .set('Cookie', tenantA.cashierCookie!)
      .send({});
    expect(cashierConfirm.status).toBe(200);

    const cashierDeleteProduct = await request(app)
      .delete(`/api/v1/products/${tenantA.productId}`)
      .set('Cookie', tenantA.cashierCookie!);
    expect(cashierDeleteProduct.status).toBe(403);

    const cashierCancelPaid = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Cookie', tenantA.cashierCookie!)
      .send({ reason: 'Cashier refund attempt' });
    expect(cashierCancelPaid.status).toBe(403);

    // Owner CAN cancel & refund paid order
    const ownerCancelPaid = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Cookie', tenantA.cookie)
      .send({ reason: 'Stok habis' });
    expect(ownerCancelPaid.status).toBe(200);
    expect(ownerCancelPaid.body.paymentStatus).toBe('REFUNDED');

    // Super Admin calling /api/v1/* gets clean 403 (never 500 UUID syntax error!)
    for (const path of ['/api/v1/orders', '/api/v1/orders/dashboard', '/api/v1/products', '/api/v1/settings', '/api/v1/events']) {
      const saTryMerchant = await request(app).get(path).set('Cookie', superAdminCookie);
      expect(saTryMerchant.status).toBe(403);
    }

    // Invalid UUID params return 404 (never 500!)
    const badUuidRes = await request(app).get('/api/v1/orders/not-a-valid-uuid/receipt').set('Cookie', tenantA.cookie);
    expect(badUuidRes.status).toBe(404);

    // XSS scheme in product imageUrl is rejected
    const xssProd = await request(app)
      .post('/api/v1/products')
      .set('Cookie', tenantA.cookie)
      .send({ name: 'XSS Coffee', price: 15000, imageUrl: 'javascript:alert(document.cookie)' });
    expect(xssProd.status).toBe(400);

    // Public tracking exposes only intended order fields (no merchantId, no user secrets)
    const trackRes = await request(app).get(`/api/public/tracking/${qrisOrder.body.trackingToken}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.merchantId).toBeUndefined();
    expect(trackRes.body.trackingTokenHash).toBeUndefined();
  });
});

describe('Phase 6 — SaaS Subscription Lifecycle & Independent QR / POS Entitlements', () => {
  it('enforces all 4 QR/POS entitlement combinations, expiry, suspension, plan changes, and paid-order continuity', async () => {
    const createQr = () =>
      request(app)
        .post(`/api/public/qr/${tenantA.qrToken}/orders`)
        .send({
          customerName: 'Sub Matrix QR',
          idempotencyKey: crypto.randomUUID(),
          paymentMethod: 'CASH',
          orderType: 'TAKEAWAY',
          fulfillmentMethod: 'PICKUP_COUNTER',
          items: [{ productId: tenantA.productId, quantity: 1, variantIds: [tenantA.variantAId], addonIds: [] }],
        });

    const createPos = () =>
      request(app)
        .post('/api/v1/orders/manual')
        .set('Cookie', tenantA.cookie)
        .send({
          customerName: 'Sub Matrix POS',
          idempotencyKey: crypto.randomUUID(),
          paymentMethod: 'CASH',
          cashReceived: 25000,
          orderType: 'TAKEAWAY',
          fulfillmentMethod: 'PICKUP_COUNTER',
          items: [{ productId: tenantA.productId, quantity: 1, variantIds: [tenantA.variantAId], addonIds: [] }],
        });

    const updateSub = (data: Record<string, unknown>) =>
      request(app)
        .patch(`/api/super-admin/merchants/${tenantA.merchantId}/subscription`)
        .set('Cookie', superAdminCookie)
        .send(data);

    // Create a PAID order BEFORE suspension/expiry to verify operational continuity
    const prePaidRes = await createPos();
    expect(prePaidRes.status).toBe(201);
    const paidOrderId = prePaidRes.body.id;

    // 1. QR enabled, POS disabled (plan upgrade to 'pro')
    expect((await updateSub({ status: 'ACTIVE', planCode: 'pro', qrOrderingEnabled: true, posEnabled: false, extendDays: 30 })).status).toBe(200);
    expect((await createQr()).status).toBe(201);
    expect((await createPos()).status).toBe(403);

    // 2. POS enabled, QR disabled (plan upgrade to 'business')
    expect((await updateSub({ status: 'ACTIVE', planCode: 'business', qrOrderingEnabled: false, posEnabled: true, extendDays: 30 })).status).toBe(200);
    expect((await createQr()).status).toBe(403);
    expect((await createPos()).status).toBe(201);

    // 3. Both disabled while ACTIVE
    expect((await updateSub({ status: 'ACTIVE', planCode: 'basic', qrOrderingEnabled: false, posEnabled: false })).status).toBe(200);
    expect((await createQr()).status).toBe(403);
    expect((await createPos()).status).toBe(403);

    // 4. SUSPENDED blocks new orders, but existing PAID order remains processable and history remains accessible
    expect((await updateSub({ status: 'SUSPENDED', qrOrderingEnabled: true, posEnabled: true })).status).toBe(200);
    expect((await createQr()).status).toBe(403);
    expect((await createPos()).status).toBe(403);

    const processWhileSuspended = await request(app)
      .patch(`/api/v1/orders/${paidOrderId}/status`)
      .set('Cookie', tenantA.cookie)
      .send({ status: 'IN_PROGRESS' });
    expect(processWhileSuspended.status).toBe(200);

    // 5. Past trial_ends_at dynamically evaluates as EXPIRED in both merchant entitlements and Super Admin overview
    await pool!.query(
      "UPDATE subscriptions SET status = 'TRIAL', trial_ends_at = now() - interval '2 days' WHERE merchant_id = $1",
      [tenantA.merchantId],
    );
    const entExpired = await request(app).get('/api/v1/orders/entitlements').set('Cookie', tenantA.cookie);
    expect(entExpired.body.status).toBe('EXPIRED');
    expect(entExpired.body.effectiveActive).toBe(false);
    expect((await createQr()).status).toBe(403);

    const saOverview = await request(app).get('/api/super-admin/overview').set('Cookie', superAdminCookie);
    const merchantARow = saOverview.body.merchants.find((m: { id: string }) => m.id === tenantA.merchantId);
    expect(merchantARow.subscriptionStatus).toBe('EXPIRED');

    // Finish processing the paid order even while expired
    const finishWhileExpired = await request(app)
      .patch(`/api/v1/orders/${paidOrderId}/status`)
      .set('Cookie', tenantA.cookie)
      .send({ status: 'READY_TO_SERVE' });
    expect(finishWhileExpired.status).toBe(200);

    // 6. Reactivate both QR and POS
    expect(
      (await updateSub({ status: 'ACTIVE', planCode: 'pro', qrOrderingEnabled: true, posEnabled: true, extendDays: 30 })).status,
    ).toBe(200);
    expect((await createQr()).status).toBe(201);
    expect((await createPos()).status).toBe(201);
  });
});

describe('Phase 7 — Legacy JSON Migration: Dry-Run, Validation, Idempotency & Reconciliation', () => {
  it('rolls back dry-run cleanly, migrates idempotently, maps legacy QR tokens, and reports unsupported records', async () => {
    const legacy = createSeedData();
    legacy.cafeSettings.slug = 'laris-migration-test';

    // 1. Dry-run executes validation + reconciliation and rolls back completely
    const dryReport = await importLegacyStateToPostgres(legacy, { dryRun: true, dbPool: pool });
    expect(dryReport.dryRun).toBe(true);
    expect(dryReport.reconciliation.totalsReconciled).toBe(true);
    expect(dryReport.categoriesCreated).toBe(5);
    expect(dryReport.productsCreated).toBe(8);
    expect(dryReport.tablesCreated).toBe(6);
    expect(dryReport.historicalOrdersMigrated).toBe(1);
    expect(dryReport.unsupportedRecords.length).toBe(3);

    const checkRolledBack = await pool!.query("SELECT 1 FROM merchants WHERE slug = 'laris-migration-test'");
    expect(checkRolledBack.rowCount).toBe(0);

    // 2. Real migration commits cleanly
    const commitReport = await importLegacyStateToPostgres(legacy, {
      dryRun: false,
      ownerEmail: 'legacy-owner@vitest.local',
      ownerPassword: 'legacy-password-1234',
      dbPool: pool,
    });
    expect(commitReport.reconciliation.totalsReconciled).toBe(true);
    expect(commitReport.historicalOrdersMigrated).toBe(1);

    // 3. Re-running migration is 100% idempotent (0 duplicates created)
    const rerunReport = await importLegacyStateToPostgres(legacy, { dryRun: false, dbPool: pool });
    expect(rerunReport.categoriesCreated).toBe(0);
    expect(rerunReport.productsCreated).toBe(0);
    expect(rerunReport.tablesCreated).toBe(0);
    expect(rerunReport.legacyQrMapped).toBe(0);
    expect(rerunReport.historicalOrdersMigrated).toBe(0);
    expect(rerunReport.reconciliation.totalsReconciled).toBe(true);

    // 4. Legacy QR token mapping resolves to active table public_token
    const legacyQrRes = await request(app).get(
      '/api/public/legacy-qr?slug=laris-migration-test&table=A01&token=LRS-A01-8K4M2P',
    );
    expect(legacyQrRes.status).toBe(200);
    expect(legacyQrRes.body.qrToken).toBeTruthy();
    expect(legacyQrRes.body.tableName).toBe('A01');
  });
});

describe('Phase 8 — Large History (>200 rows), Asia/Jakarta Timezone, CSV Export & SSE Scoping', () => {
  it('paginates >200 records without truncation, filters Asia/Jakarta midnight accurately, sanitizes CSV formulas, and isolates SSE', async () => {
    // Insert 220 historical orders on 2026-11-20 23:30 WIB (which is 2026-11-20 16:30 UTC)
    // and 5 orders on 2026-11-21 00:30 WIB (which is 2026-11-20 17:30 UTC — SAME UTC DATE, DIFFERENT WIB DATE!)
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < 225; i += 1) {
        const isNextWibDay = i >= 220;
        const ts = isNextWibDay ? '2026-11-20T17:30:00Z' : '2026-11-20T16:30:00Z';
        const customerName = i === 224 ? '=CMD|\' /C calc\'!A0' : `Bulk Customer ${i + 1}`;
        const ord = (
          await client.query(
            `INSERT INTO orders(
               merchant_id, outlet_id, idempotency_key, request_hash, order_status, payment_status,
               total_amount, customer_name, order_type, fulfillment_method, order_source, completed_at, created_at, updated_at
             ) VALUES($1,$2,$3,'hash','READY_TO_SERVE','PAID',15000,$4,'TAKEAWAY','PICKUP_COUNTER','POS',$5,$5,$5)
             RETURNING id`,
            [tenantB.merchantId, tenantB.outletId, `bulk-${i}`, customerName, ts],
          )
        ).rows[0];
        await client.query(
          `INSERT INTO payments(order_id, method, status, amount, cash_received, change_amount, paid_at, created_at, updated_at)
           VALUES($1,'CASH','PAID',15000,15000,0,$2,$2,$2)`,
          [ord.id, ts],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 1. Asia/Jakarta boundary check: 2026-11-20 WIB must have exactly 220 orders, and 2026-11-21 WIB must have exactly 5 orders!
    const day1Res = await request(app)
      .get('/api/v1/orders/history?status=READY_TO_SERVE&dateFrom=2026-11-20&dateTo=2026-11-20&page=1&pageSize=100')
      .set('Cookie', tenantB.cookie);
    expect(day1Res.status).toBe(200);
    expect(day1Res.body.orders.length).toBe(100);
    expect(day1Res.body.pagination.total).toBe(220);
    expect(day1Res.body.pagination.totalPages).toBe(3);
    expect(day1Res.body.summary.paidRevenue).toBe(220 * 15000);

    const day2Res = await request(app)
      .get('/api/v1/orders/history?status=READY_TO_SERVE&dateFrom=2026-11-21&dateTo=2026-11-21')
      .set('Cookie', tenantB.cookie);
    expect(day2Res.status).toBe(200);
    expect(day2Res.body.pagination.total).toBe(5);
    expect(day2Res.body.summary.paidRevenue).toBe(5 * 15000);

    // 2. CSV export includes ALL 225 records (not capped at 200) and escapes formula injection!
    const csvRes = await request(app)
      .get('/api/v1/orders/history/export.csv?status=READY_TO_SERVE&dateFrom=2026-11-20&dateTo=2026-11-21')
      .set('Cookie', tenantB.cookie);
    expect(csvRes.status).toBe(200);
    const lines = csvRes.text.trim().split('\n');
    expect(lines.length).toBe(226); // 1 header + 225 data rows
    expect(csvRes.text).toContain('"\'=CMD|\' /C calc\'!A0"');
    expect(csvRes.text).not.toContain(',"=CMD');

    // 3. SSE event bus enforces strict tenant and tracking-token isolation
    const chunksA: string[] = [];
    const chunksB: string[] = [];
    const chunksTrack1: string[] = [];
    const chunksTrack2: string[] = [];

    const mockRes = (sink: string[]) =>
      ({
        write: (chunk: string) => {
          sink.push(chunk);
          return true;
        },
      }) as unknown as import('express').Response;

    const unsubA = subscribeTenantEvents(tenantA.merchantId, tenantA.outletId, mockRes(chunksA));
    const unsubB = subscribeTenantEvents(tenantB.merchantId, tenantB.outletId, mockRes(chunksB));
    const unsubT1 = subscribeTrackingEvents('hash-order-1', mockRes(chunksTrack1));
    const unsubT2 = subscribeTrackingEvents('hash-order-2', mockRes(chunksTrack2));

    publishTenantEvent({
      type: 'order:created',
      merchantId: tenantA.merchantId,
      outletId: tenantA.outletId,
      orderId: 'secret-order-a',
    });
    publishTrackingEvent('hash-order-1', {
      type: 'order:updated',
      orderId: 'order-1',
      orderStatus: 'IN_PROGRESS',
      paymentStatus: 'PAID',
    });

    unsubA();
    unsubB();
    unsubT1();
    unsubT2();

    expect(chunksA.some((c) => c.includes('secret-order-a'))).toBe(true);
    expect(chunksB.some((c) => c.includes('secret-order-a'))).toBe(false);
    expect(chunksTrack1.some((c) => c.includes('order-1'))).toBe(true);
    expect(chunksTrack2.some((c) => c.includes('order-1'))).toBe(false);
  });
});
