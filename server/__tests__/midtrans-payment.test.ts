import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../server.ts';
import { pool } from '../database/client.ts';
import { env, getMidtransReadiness } from '../config/env.ts';
import {
  chargeMidtransDynamicQris,
  isMerchantEligibleForDynamicQris,
  mapMidtransTransactionState,
  parseMidtransTimestamp,
  verifyMidtransWebhookSignature,
} from '../modules/payments/midtrans.ts';

type MockTxRecord = {
  orderId: string;
  transactionId: string;
  grossAmount: string;
  paymentType: string;
  currency: string;
  statusCode: string;
  transactionStatus: string;
  fraudStatus: string;
  qrString: string;
  qrImageUrl: string;
  expiryTime: string;
  settlementTime?: string;
  lastHeaders: http.IncomingHttpHeaders;
  requestBody: Record<string, any>;
};

const TEST_SERVER_KEY = 'SB-Mid-server-vitest-sandbox-key-998877';

function signMidtransNotification(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  secret = TEST_SERVER_KEY,
): string {
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${secret}`)
    .digest('hex');
}

describe('Phase 2 — Midtrans Sandbox Dynamic QRIS, Webhooks, Reconciliation & Financial Integrity [MOCKED PROVIDER]', () => {
  let app: Express;
  let mockServer: http.Server;
  let mockBaseUrl = '';

  const mockStore = new Map<string, MockTxRecord>();
  let chargeCallCount = 0;
  let statusCallCount = 0;
  let nextChargeMode: 'ok' | 'http_500' | 'status_406' | 'hang_timeout' = 'ok';
  const statusTamperGrossByOrder = new Map<string, string>();

  let superAdminCookie = '';
  let merchantA: {
    merchantId: string;
    slug: string;
    outletId: string;
    ownerCookie: string;
    cashierCookie: string;
    productId: string;
    variantId: string;
    addonId: string;
    tableId: string;
    qrToken: string;
    proPlanId: string;
  };
  let merchantB: {
    merchantId: string;
    slug: string;
    outletId: string;
    ownerCookie: string;
    productId: string;
    qrToken: string;
  };

  const savedEnv: Record<string, string | undefined> = {};

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
    for (const k of [
      'MIDTRANS_ENABLED',
      'MIDTRANS_ENVIRONMENT',
      'MIDTRANS_SERVER_KEY',
      'MIDTRANS_SIGNATURE_KEY',
      'MIDTRANS_SANDBOX_MERCHANT_ID',
      'MIDTRANS_API_BASE_URL',
      'PAYMENT_WEBHOOK_BASE_URL',
    ]) {
      savedEnv[k] = process.env[k];
    }

    mockServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (req.method === 'POST' && url.pathname === '/v2/charge') {
        chargeCallCount += 1;
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw || '{}');

        if (nextChargeMode === 'hang_timeout') {
          nextChargeMode = 'ok';
          req.socket.destroy();
          return;
        }
        if (nextChargeMode === 'http_500') {
          nextChargeMode = 'ok';
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status_code: '500', status_message: 'Internal Midtrans Sandbox Error' }));
          return;
        }
        if (nextChargeMode === 'status_406') {
          nextChargeMode = 'ok';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status_code: '406', status_message: 'Duplicate order ID' }));
          return;
        }

        const orderId = String(body.transaction_details?.order_id || '');
        const grossAmount = `${Number(body.transaction_details?.gross_amount || 0)}.00`;
        const txId = crypto.randomUUID();
        const qrString = `00020101021226670016COM.MIDTRANS.WWW011893600914${orderId.slice(-10)}5204581253033605408${body.transaction_details?.gross_amount}5802ID5912LARIS COFFEE6007JAKARTA6304ABCD`;
        const qrImageUrl = `${mockBaseUrl}/v2/qris/${txId}/qr-code`;
        const expiryDate = new Date(Date.now() + 15 * 60_000);
        const wibMs = expiryDate.getTime() + 7 * 3600_000;
        const expiryWib = new Date(wibMs).toISOString().slice(0, 19).replace('T', ' ');

        const record: MockTxRecord = {
          orderId,
          transactionId: txId,
          grossAmount,
          paymentType: String(body.payment_type || 'qris'),
          currency: 'IDR',
          statusCode: '201',
          transactionStatus: 'pending',
          fraudStatus: 'accept',
          qrString,
          qrImageUrl,
          expiryTime: expiryWib,
          lastHeaders: req.headers,
          requestBody: body,
        };
        mockStore.set(orderId, record);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status_code: '201',
            status_message: 'QRIS transaction is created',
            transaction_id: txId,
            order_id: orderId,
            merchant_id: 'G998877665',
            gross_amount: grossAmount,
            currency: 'IDR',
            payment_type: 'qris',
            transaction_time: expiryWib,
            transaction_status: 'pending',
            fraud_status: 'accept',
            acquirer: 'gopay',
            qr_string: qrString,
            expiry_time: expiryWib,
            actions: [
              { name: 'generate-qr-code', method: 'GET', url: qrImageUrl },
              { name: 'generate-qr-code-v2', method: 'GET', url: `${qrImageUrl}-v2` },
            ],
          }),
        );
        return;
      }

      const statusMatch = url.pathname.match(/^\/v2\/([^/]+)\/status$/);
      if (req.method === 'GET' && statusMatch) {
        statusCallCount += 1;
        const orderId = decodeURIComponent(statusMatch[1]);
        const record = mockStore.get(orderId);
        if (!record) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status_code: '404', status_message: 'Transaction does not exist' }));
          return;
        }
        const grossOverride = statusTamperGrossByOrder.get(orderId) ?? record.grossAmount;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status_code: record.statusCode,
            status_message: 'Success, transaction is found',
            transaction_id: record.transactionId,
            order_id: record.orderId,
            merchant_id: 'G998877665',
            gross_amount: grossOverride,
            currency: record.currency,
            payment_type: record.paymentType,
            transaction_status: record.transactionStatus,
            fraud_status: record.fraudStatus,
            acquirer: 'gopay',
            expiry_time: record.expiryTime,
            settlement_time: record.settlementTime ?? undefined,
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = mockServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Mock server address unavailable');
    mockBaseUrl = `http://127.0.0.1:${addr.port}`;

    const dbUrl = process.env.DATABASE_URL!;
    const parsed = new URL(dbUrl);
    const dbName = parsed.pathname.slice(1);
    if (!dbName.endsWith('_e2e')) {
      throw new Error(`Refusing non-e2e database: ${dbName}`);
    }

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

    const basicPlan = (
      await pool.query(
        "INSERT INTO subscription_plans(code, name, monthly_price, trial_days) VALUES('basic', 'Basic', 50000, 14) RETURNING id",
      )
    ).rows[0];
    const proPlan = (
      await pool.query(
        "INSERT INTO subscription_plans(code, name, monthly_price, trial_days) VALUES('pro', 'Pro', 120000, 14) RETURNING id",
      )
    ).rows[0];
    await pool.query("INSERT INTO plan_features(plan_id, feature_key) VALUES($1, 'ordering'), ($2, 'ordering')", [
      basicPlan.id,
      proPlan.id,
    ]);

    const hash = await bcrypt.hash('TestPass123!', 10);

    const saUser = (
      await pool.query(
        "INSERT INTO users(email, password_hash, name, is_super_admin) VALUES('sa-p2@warkopos.test', $1, 'SA Phase2', true) RETURNING id",
        [hash],
      )
    ).rows[0];

    // Merchant A (Designated Sandbox Test Merchant)
    const ownerA = (
      await pool.query(
        "INSERT INTO users(email, password_hash, name) VALUES('owner-a@p2.test', $1, 'Owner A') RETURNING id",
        [hash],
      )
    ).rows[0];
    const cashierA = (
      await pool.query(
        "INSERT INTO users(email, password_hash, name) VALUES('cashier-a@p2.test', $1, 'Cashier A') RETURNING id",
        [hash],
      )
    ).rows[0];
    const storeA = (
      await pool.query(
        "INSERT INTO merchants(name, slug) VALUES('LARIS Sandbox Cafe', 'laris-sandbox-cafe') RETURNING id, slug",
      )
    ).rows[0];
    const outletA = (
      await pool.query("INSERT INTO outlets(merchant_id, name, slug) VALUES($1, 'Cabang Utama', 'utama') RETURNING id", [
        storeA.id,
      ])
    ).rows[0];
    await pool.query(
      "INSERT INTO merchant_memberships(merchant_id, user_id, role) VALUES($1, $2, 'MERCHANT_OWNER'), ($1, $3, 'CASHIER')",
      [storeA.id, ownerA.id, cashierA.id],
    );
    await pool.query(
      "INSERT INTO subscriptions(merchant_id, plan_id, status, trial_ends_at) VALUES($1, $2, 'TRIAL', now() + interval '14 days')",
      [storeA.id, basicPlan.id],
    );
    await pool.query(
      `INSERT INTO outlet_settings(outlet_id, merchant_id, is_open, enable_dine_in, enable_takeaway, enable_table_service, enable_pickup_counter, enable_dynamic_qris)
       VALUES($1, $2, true, true, true, true, true, true)`,
      [outletA.id, storeA.id],
    );

    const catA = (
      await pool.query("INSERT INTO categories(merchant_id, outlet_id, name) VALUES($1, $2, 'Signature Coffee') RETURNING id", [
        storeA.id,
        outletA.id,
      ])
    ).rows[0];
    const prodA = (
      await pool.query(
        "INSERT INTO products(merchant_id, outlet_id, category_id, name, description, price) VALUES($1, $2, $3, 'Es Kopi Susu Gula Aren', 'Kopi susu khas', 22000) RETURNING id",
        [storeA.id, outletA.id, catA.id],
      )
    ).rows[0];
    const varA = (
      await pool.query(
        "INSERT INTO product_variants(product_id, group_name, option_name, price_delta, required) VALUES($1, 'Ukuran', 'Large', 5000, true) RETURNING id",
        [prodA.id],
      )
    ).rows[0];
    const addonA = (
      await pool.query("INSERT INTO product_addons(product_id, name, price) VALUES($1, 'Extra Espresso', 3000) RETURNING id", [
        prodA.id,
      ])
    ).rows[0];
    const tableA = (
      await pool.query("INSERT INTO dining_tables(merchant_id, outlet_id, name) VALUES($1, $2, 'Meja 01') RETURNING id", [
        storeA.id,
        outletA.id,
      ])
    ).rows[0];
    const qrTokenA = crypto.randomBytes(24).toString('base64url');
    const qrHashA = crypto.createHash('sha256').update(qrTokenA).digest('hex');
    await pool.query('INSERT INTO table_qr_codes(table_id, token_hash, public_token) VALUES($1, $2, $3)', [
      tableA.id,
      qrHashA,
      qrTokenA,
    ]);

    // Merchant B (Non-designated tenant — must NEVER access Merchant A's Midtrans credentials)
    const ownerB = (
      await pool.query(
        "INSERT INTO users(email, password_hash, name) VALUES('owner-b@p2.test', $1, 'Owner B') RETURNING id",
        [hash],
      )
    ).rows[0];
    const storeB = (
      await pool.query("INSERT INTO merchants(name, slug) VALUES('Warung Tetangga', 'warung-tetangga') RETURNING id, slug")
    ).rows[0];
    const outletB = (
      await pool.query("INSERT INTO outlets(merchant_id, name, slug) VALUES($1, 'Cabang B', 'cabang-b') RETURNING id", [
        storeB.id,
      ])
    ).rows[0];
    await pool.query(
      "INSERT INTO merchant_memberships(merchant_id, user_id, role) VALUES($1, $2, 'MERCHANT_OWNER')",
      [storeB.id, ownerB.id],
    );
    await pool.query(
      "INSERT INTO subscriptions(merchant_id, plan_id, status, trial_ends_at) VALUES($1, $2, 'TRIAL', now() + interval '14 days')",
      [storeB.id, basicPlan.id],
    );
    await pool.query(
      `INSERT INTO outlet_settings(outlet_id, merchant_id, is_open, enable_dine_in, enable_takeaway, enable_table_service, enable_pickup_counter, enable_dynamic_qris)
       VALUES($1, $2, true, true, true, true, true, true)`,
      [outletB.id, storeB.id],
    );
    const catB = (
      await pool.query("INSERT INTO categories(merchant_id, outlet_id, name) VALUES($1, $2, 'Minuman') RETURNING id", [
        storeB.id,
        outletB.id,
      ])
    ).rows[0];
    const prodB = (
      await pool.query(
        "INSERT INTO products(merchant_id, outlet_id, category_id, name, description, price) VALUES($1, $2, $3, 'Es Teh Manis', 'Segar', 8000) RETURNING id",
        [storeB.id, outletB.id, catB.id],
      )
    ).rows[0];
    const tableB = (
      await pool.query("INSERT INTO dining_tables(merchant_id, outlet_id, name) VALUES($1, $2, 'B-01') RETURNING id", [
        storeB.id,
        outletB.id,
      ])
    ).rows[0];
    const qrTokenB = crypto.randomBytes(24).toString('base64url');
    const qrHashB = crypto.createHash('sha256').update(qrTokenB).digest('hex');
    await pool.query('INSERT INTO table_qr_codes(table_id, token_hash, public_token) VALUES($1, $2, $3)', [
      tableB.id,
      qrHashB,
      qrTokenB,
    ]);

    superAdminCookie = signSessionCookie({
      sub: saUser.id,
      merchantId: storeA.id,
      outletId: outletA.id,
      role: 'SUPER_ADMIN',
    });

    merchantA = {
      merchantId: storeA.id,
      slug: storeA.slug,
      outletId: outletA.id,
      ownerCookie: signSessionCookie({
        sub: ownerA.id,
        merchantId: storeA.id,
        outletId: outletA.id,
        role: 'MERCHANT_OWNER',
      }),
      cashierCookie: signSessionCookie({
        sub: cashierA.id,
        merchantId: storeA.id,
        outletId: outletA.id,
        role: 'CASHIER',
      }),
      productId: prodA.id,
      variantId: varA.id,
      addonId: addonA.id,
      tableId: tableA.id,
      qrToken: qrTokenA,
      proPlanId: proPlan.id,
    };

    merchantB = {
      merchantId: storeB.id,
      slug: storeB.slug,
      outletId: outletB.id,
      ownerCookie: signSessionCookie({
        sub: ownerB.id,
        merchantId: storeB.id,
        outletId: outletB.id,
        role: 'MERCHANT_OWNER',
      }),
      productId: prodB.id,
      qrToken: qrTokenB,
    };

    process.env.MIDTRANS_ENABLED = 'true';
    process.env.MIDTRANS_ENVIRONMENT = 'sandbox';
    process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;
    process.env.MIDTRANS_SANDBOX_MERCHANT_ID = merchantA.slug;
    process.env.MIDTRANS_API_BASE_URL = mockBaseUrl;
    process.env.PAYMENT_WEBHOOK_BASE_URL = 'https://webhook-test.warkopos.example.com';

    app = await createApp();
  });

  beforeEach(() => {
    nextChargeMode = 'ok';
    statusTamperGrossByOrder.clear();
    process.env.MIDTRANS_ENABLED = 'true';
    process.env.MIDTRANS_ENVIRONMENT = 'sandbox';
    process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;
    process.env.MIDTRANS_SANDBOX_MERCHANT_ID = merchantA.slug;
    process.env.MIDTRANS_API_BASE_URL = mockBaseUrl;
    process.env.PAYMENT_WEBHOOK_BASE_URL = 'https://webhook-test.warkopos.example.com';
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('1 & 2. validates provider configuration, blocks production environment & production keys, and never exposes secrets', async () => {
    const prodEnv = getMidtransReadiness({
      MIDTRANS_ENABLED: 'true',
      MIDTRANS_ENVIRONMENT: 'production',
      MIDTRANS_SERVER_KEY: 'SB-Mid-server-123456789012',
      MIDTRANS_SANDBOX_MERCHANT_ID: 'laris-sandbox-cafe',
    } as unknown as NodeJS.ProcessEnv);
    expect(prodEnv.ready).toBe(false);
    expect(prodEnv.productionBlockedReason).toMatch(/Mode produksi Midtrans dinonaktifkan/i);

    const prodKey = getMidtransReadiness({
      MIDTRANS_ENABLED: 'true',
      MIDTRANS_ENVIRONMENT: 'sandbox',
      MIDTRANS_SERVER_KEY: 'Mid-server-LIVEKEY123456789',
      MIDTRANS_SANDBOX_MERCHANT_ID: 'laris-sandbox-cafe',
    } as unknown as NodeJS.ProcessEnv);
    expect(prodKey.ready).toBe(false);
    expect(prodKey.productionBlockedReason).toMatch(/Server Key produksi terdeteksi/i);

    const insecureWebhook = getMidtransReadiness({
      MIDTRANS_ENABLED: 'true',
      MIDTRANS_ENVIRONMENT: 'sandbox',
      MIDTRANS_SERVER_KEY: TEST_SERVER_KEY,
      MIDTRANS_SANDBOX_MERCHANT_ID: 'laris-sandbox-cafe',
      PAYMENT_WEBHOOK_BASE_URL: 'http://insecure.example.com',
    } as unknown as NodeJS.ProcessEnv);
    expect(insecureWebhook.ready).toBe(true);
    expect(insecureWebhook.webhookHttpsValid).toBe(false);
    expect(insecureWebhook.warnings.some((w) => w.includes('HTTPS'))).toBe(true);

    const settingsRes = await request(app).get('/api/v1/settings').set('Cookie', merchantA.ownerCookie);
    expect(settingsRes.status).toBe(200);
    expect(JSON.stringify(settingsRes.body)).not.toContain(TEST_SERVER_KEY);
    expect(settingsRes.body.paymentGateway.dynamicQrisEligible).toBe(true);
    expect(settingsRes.body.paymentGateway.dynamicQrisAvailable).toBe(true);
    expect(settingsRes.body.paymentGateway.environment).toBe('SANDBOX');
  });

  it('3, 4 & 17. calculates gross amount strictly on server, generates official Core API v2 /v2/charge payload, and enforces idempotency', async () => {
    const startCharges = chargeCallCount;
    const idempotencyKey = crypto.randomUUID();

    // Unit = 22000 + Large (5000) + Extra Espresso (3000) = 30000; qty 2 => 60000
    const createRes = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        customerName: 'Rina Pelanggan',
        paymentMethod: 'QRIS_DYNAMIC',
        idempotencyKey,
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        // Tampered client price/total fields must be completely ignored
        totalAmount: 1000,
        items: [
          {
            productId: merchantA.productId,
            quantity: 2,
            variantIds: [merchantA.variantId],
            addonIds: [merchantA.addonId],
            price: 500,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.totalAmount).toBe(60000);
    expect(createRes.body.orderStatus).toBe('AWAITING_PAYMENT');
    expect(createRes.body.paymentStatus).toBe('UNPAID');
    expect(createRes.body.payment.method).toBe('QRIS_DYNAMIC');
    expect(createRes.body.payment.provider).toBe('MIDTRANS');
    expect(createRes.body.payment.environment).toBe('SANDBOX');
    expect(createRes.body.payment.qrString).toContain('COM.MIDTRANS.WWW');
    expect(chargeCallCount).toBe(startCharges + 1);

    // Verify exact Midtrans Core API v2 request headers & body sent to mock server
    const providerOrderId = createRes.body.payment.providerOrderId as string;
    const recorded = mockStore.get(providerOrderId)!;
    expect(recorded).toBeDefined();
    const expectedBasic = `Basic ${Buffer.from(`${TEST_SERVER_KEY}:`).toString('base64')}`;
    expect(recorded.lastHeaders.authorization).toBe(expectedBasic);
    expect(recorded.lastHeaders['x-override-notification']).toBe(
      'https://webhook-test.warkopos.example.com/api/webhooks/midtrans',
    );
    expect(recorded.requestBody.payment_type).toBe('qris');
    expect(recorded.requestBody.transaction_details.gross_amount).toBe(60000);
    const itemsSum = recorded.requestBody.item_details.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity,
      0,
    );
    expect(itemsSum).toBe(60000);

    // Duplicate submission with same idempotencyKey must NOT call Midtrans /v2/charge again
    const dupRes = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        customerName: 'Rina Pelanggan',
        paymentMethod: 'QRIS_DYNAMIC',
        idempotencyKey,
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [
          {
            productId: merchantA.productId,
            quantity: 2,
            variantIds: [merchantA.variantId],
            addonIds: [merchantA.addonId],
          },
        ],
      });
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.idempotent).toBe(true);
    expect(dupRes.body.id).toBe(createRes.body.id);
    expect(dupRes.body.payment.qrString).toBe(createRes.body.payment.qrString);
    expect(chargeCallCount).toBe(startCharges + 1);
  });

  it('5, 6, 7, 8 & 11. blocks manual cashier override, rejects forged webhooks, deduplicates replays, ignores out-of-order events, and settles via signed webhook + Status API', async () => {
    const createRes = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        customerName: 'Budi QRIS',
        paymentMethod: 'QRIS_DYNAMIC',
        idempotencyKey: crypto.randomUUID(),
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id as string;
    const providerOrderId = createRes.body.payment.providerOrderId as string;
    const record = mockStore.get(providerOrderId)!;

    // 11. Manual cashier confirmation of QRIS_DYNAMIC must be rejected with 409
    const manualConfirm = await request(app)
      .post(`/api/v1/payments/${orderId}/confirm`)
      .set('Cookie', merchantA.cashierCookie)
      .send({});
    expect(manualConfirm.status).toBe(409);

    // Unauthenticated POS reconcile must fail with 401
    const unauthReconcile = await request(app).post(`/api/v1/payments/${orderId}/reconcile`).send({});
    expect(unauthReconcile.status).toBe(401);

    // 6. Invalid webhook signature -> 401, signature_key redacted in payment_webhook_events, order still AWAITING_PAYMENT
    const forgedSig = 'a'.repeat(128);
    const badWh = await request(app).post('/api/webhooks/midtrans').send({
      order_id: providerOrderId,
      transaction_id: record.transactionId,
      status_code: '200',
      gross_amount: record.grossAmount,
      transaction_status: 'settlement',
      signature_key: forgedSig,
    });
    expect(badWh.status).toBe(401);

    const rejectedLog = await pool!.query(
      "SELECT processing_status, payload FROM payment_webhook_events WHERE provider_order_id = $1 AND processing_status = 'REJECTED'",
      [providerOrderId],
    );
    expect(rejectedLog.rowCount).toBe(1);
    expect(rejectedLog.rows[0].payload.signature_key).toBe('[REDACTED]');

    // Order must NOT be in operational queue yet
    const queueBefore = await request(app).get('/api/v1/orders').set('Cookie', merchantA.ownerCookie);
    expect(queueBefore.body.some((o: any) => o.id === orderId)).toBe(false);

    // 5. Mark provider state settled in mock Midtrans, then deliver valid SHA-512 signed webhook
    record.statusCode = '200';
    record.transactionStatus = 'settlement';
    record.settlementTime = '2026-11-27 08:30:00';

    const validSig = signMidtransNotification(providerOrderId, '200', record.grossAmount);
    const goodWh = await request(app).post('/api/webhooks/midtrans').send({
      order_id: providerOrderId,
      transaction_id: record.transactionId,
      status_code: '200',
      gross_amount: record.grossAmount,
      payment_type: 'qris',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: validSig,
    });
    expect(goodWh.status).toBe(200);
    expect(goodWh.body.outcome).toBe('SETTLED');
    expect(goodWh.body.orderStatus).toBe('NEW_ORDER');
    expect(goodWh.body.paymentStatus).toBe('PAID');

    // Now order IS in operational queue!
    const queueAfter = await request(app).get('/api/v1/orders').set('Cookie', merchantA.ownerCookie);
    expect(queueAfter.body.some((o: any) => o.id === orderId && o.orderStatus === 'NEW_ORDER')).toBe(true);

    // 7. Duplicate webhook replay -> 200 duplicate:true without creating a second settlement audit log
    const dupWh = await request(app).post('/api/webhooks/midtrans').send({
      order_id: providerOrderId,
      transaction_id: record.transactionId,
      status_code: '200',
      gross_amount: record.grossAmount,
      payment_type: 'qris',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: validSig,
    });
    expect(dupWh.status).toBe(200);
    expect(dupWh.body.duplicate).toBe(true);

    const settledAudits = await pool!.query(
      "SELECT 1 FROM audit_logs WHERE entity_id = $1 AND action = 'PAYMENT_DYNAMIC_QRIS_SETTLED'",
      [orderId],
    );
    expect(settledAudits.rowCount).toBe(1);

    // 8. Out-of-order delayed 'expire' webhook arriving AFTER settlement -> ignored, order remains PAID & NEW_ORDER
    const expireSig = signMidtransNotification(providerOrderId, '407', record.grossAmount);
    const outOfOrderWh = await request(app).post('/api/webhooks/midtrans').send({
      order_id: providerOrderId,
      transaction_id: record.transactionId,
      status_code: '407',
      gross_amount: record.grossAmount,
      payment_type: 'qris',
      transaction_status: 'expire',
      signature_key: expireSig,
    });
    expect(outOfOrderWh.status).toBe(200);
    expect(outOfOrderWh.body.outOfOrderIgnored).toBe(true);

    const checkOrder = await pool!.query('SELECT order_status, payment_status FROM orders WHERE id = $1', [orderId]);
    expect(checkOrder.rows[0].order_status).toBe('NEW_ORDER');
    expect(checkOrder.rows[0].payment_status).toBe('PAID');
  });

  it('9. quarantines amount mismatch on reconciliation and NEVER marks the order PAID', async () => {
    const createRes = await request(app)
      .post('/api/v1/orders/manual')
      .set('Cookie', merchantA.ownerCookie)
      .send({
        idempotencyKey: crypto.randomUUID(),
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        customerName: 'Uji Mismatch',
        paymentMethod: 'QRIS_DYNAMIC',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id as string;
    const providerOrderId = createRes.body.payment.providerOrderId as string;
    const record = mockStore.get(providerOrderId)!;

    record.statusCode = '200';
    record.transactionStatus = 'settlement';
    statusTamperGrossByOrder.set(providerOrderId, '1000.00');

    const recRes = await request(app)
      .post(`/api/v1/payments/${orderId}/reconcile`)
      .set('Cookie', merchantA.ownerCookie)
      .send({});
    expect(recRes.status).toBe(200);
    expect(recRes.body.outcome).toBe('QUARANTINED_MISMATCH');
    expect(recRes.body.reconciliationStatus).toBe('QUARANTINED_MISMATCH');
    expect(recRes.body.paymentStatus).toBe('UNPAID');
    expect(recRes.body.orderStatus).toBe('AWAITING_PAYMENT');

    const quarantineAudit = await pool!.query(
      "SELECT payload FROM audit_logs WHERE entity_id = $1 AND action = 'PAYMENT_QUARANTINED_MISMATCH'",
      [orderId],
    );
    expect(quarantineAudit.rowCount).toBe(1);
  });

  it('10. enforces strict multi-tenant merchant eligibility & cross-tenant payment isolation', async () => {
    const menuB = await request(app).get(`/api/public/qr/${merchantB.qrToken}/menu`);
    expect(menuB.status).toBe(200);
    expect(menuB.body.settings.dynamicQrisAvailable).toBe(false);

    const qrOrderB = await request(app)
      .post(`/api/public/qr/${merchantB.qrToken}/orders`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        customerName: 'Pelanggan B',
        paymentMethod: 'QRIS_DYNAMIC',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantB.productId, quantity: 1 }],
      });
    expect(qrOrderB.status).toBe(400);
    expect(qrOrderB.body.error).toMatch(/tidak ditautkan ke merchant ini|QRIS Otomatis/i);

    const posOrderB = await request(app)
      .post('/api/v1/orders/manual')
      .set('Cookie', merchantB.ownerCookie)
      .send({
        idempotencyKey: crypto.randomUUID(),
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        customerName: 'POS B',
        paymentMethod: 'QRIS_DYNAMIC',
        items: [{ productId: merchantB.productId, quantity: 1 }],
      });
    expect(posOrderB.status).toBe(400);

    const orderA = await request(app)
      .post('/api/v1/orders/manual')
      .set('Cookie', merchantA.ownerCookie)
      .send({
        idempotencyKey: crypto.randomUUID(),
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        customerName: 'Milik Merchant A',
        paymentMethod: 'QRIS_DYNAMIC',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(orderA.status).toBe(201);

    const crossTenantReconcile = await request(app)
      .post(`/api/v1/payments/${orderA.body.id}/reconcile`)
      .set('Cookie', merchantB.ownerCookie)
      .send({});
    expect(crossTenantReconcile.status).toBe(404);

    const eligB = isMerchantEligibleForDynamicQris(merchantB.merchantId, merchantB.slug, true);
    expect(eligB.eligible).toBe(false);
  });

  it('12 & 13. handles provider network failure and API errors safely by cancelling failed attempt so retry succeeds', async () => {
    nextChargeMode = 'hang_timeout';
    const netFail = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        customerName: 'Coba Gagal Jaringan',
        paymentMethod: 'QRIS_DYNAMIC',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(netFail.status).toBe(502);

    nextChargeMode = 'status_406';
    const apiReject = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        customerName: 'Coba Error 406',
        paymentMethod: 'QRIS_DYNAMIC',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(apiReject.status).toBe(502);

    const retryOk = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        customerName: 'Retry Berhasil',
        paymentMethod: 'QRIS_DYNAMIC',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(retryOk.status).toBe(201);
    expect(retryOk.body.payment.qrString).toBeTruthy();
  });

  it('14 & 15. reconciles pending (with cooldown), expired, late-settlement recovery, and settlement-after-cancel flagging', async () => {
    const create1 = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        customerName: 'Pelanggan Telat Bayar',
        paymentMethod: 'QRIS_DYNAMIC',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(create1.status).toBe(201);
    const trackingToken = create1.body.trackingToken as string;
    const providerOrderId1 = create1.body.payment.providerOrderId as string;
    const rec1 = mockStore.get(providerOrderId1)!;

    const statusBefore = statusCallCount;
    const poll1 = await request(app).post(`/api/public/tracking/${trackingToken}/reconcile`).send({});
    expect(poll1.status).toBe(200);
    expect(poll1.body.outcome).toBe('PENDING');
    expect(statusCallCount).toBe(statusBefore + 1);

    const pollRapid = await request(app).post(`/api/public/tracking/${trackingToken}/reconcile`).send({});
    expect(pollRapid.status).toBe(200);
    expect(pollRapid.body.outcome).toBe('COOLDOWN_CACHED');
    expect(statusCallCount).toBe(statusBefore + 1);

    await pool!.query('UPDATE payments SET last_reconciled_at = NULL WHERE provider_order_id = $1', [providerOrderId1]);
    rec1.statusCode = '407';
    rec1.transactionStatus = 'expire';

    const pollExpired = await request(app).post(`/api/public/tracking/${trackingToken}/reconcile`).send({});
    expect(pollExpired.status).toBe(200);
    expect(pollExpired.body.outcome).toBe('EXPIRED');
    expect(pollExpired.body.orderStatus).toBe('EXPIRED');
    expect(pollExpired.body.paymentStatus).toBe('EXPIRED');

    // Late settlement arriving via webhook AFTER local expiry -> recovers safely to NEW_ORDER + PAID!
    rec1.statusCode = '200';
    rec1.transactionStatus = 'settlement';
    rec1.settlementTime = '2026-11-27 08:45:00';
    const lateSig = signMidtransNotification(providerOrderId1, '200', rec1.grossAmount);
    const lateWh = await request(app).post('/api/webhooks/midtrans').send({
      order_id: providerOrderId1,
      transaction_id: rec1.transactionId,
      status_code: '200',
      gross_amount: rec1.grossAmount,
      transaction_status: 'settlement',
      signature_key: lateSig,
    });
    expect(lateWh.status).toBe(200);
    expect(lateWh.body.orderStatus).toBe('NEW_ORDER');
    expect(lateWh.body.paymentStatus).toBe('PAID');

    const payRow1 = await pool!.query(
      'SELECT reconciliation_status FROM payments WHERE provider_order_id = $1',
      [providerOrderId1],
    );
    expect(payRow1.rows[0].reconciliation_status).toBe('LATE_SETTLEMENT_RECOVERED');

    // Explicitly cancelled by cashier BEFORE settlement -> late settlement flags SETTLED_AFTER_CANCEL_REQUIRES_REFUND
    const create2 = await request(app)
      .post('/api/v1/orders/manual')
      .set('Cookie', merchantA.ownerCookie)
      .send({
        idempotencyKey: crypto.randomUUID(),
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        customerName: 'Batal Lalu Terbayar',
        paymentMethod: 'QRIS_DYNAMIC',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(create2.status).toBe(201);
    const orderId2 = create2.body.id as string;
    const providerOrderId2 = create2.body.payment.providerOrderId as string;
    const rec2 = mockStore.get(providerOrderId2)!;

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId2}/cancel`)
      .set('Cookie', merchantA.ownerCookie)
      .send({ reason: 'Pelanggan membatalkan pesanan' });
    expect(cancelRes.status).toBe(200);

    rec2.statusCode = '200';
    rec2.transactionStatus = 'settlement';
    const sig2 = signMidtransNotification(providerOrderId2, '200', rec2.grossAmount);
    const whAfterCancel = await request(app).post('/api/webhooks/midtrans').send({
      order_id: providerOrderId2,
      transaction_id: rec2.transactionId,
      status_code: '200',
      gross_amount: rec2.grossAmount,
      transaction_status: 'settlement',
      signature_key: sig2,
    });
    expect(whAfterCancel.status).toBe(200);
    expect(whAfterCancel.body.outcome).toBe('SETTLED_AFTER_CANCEL_REQUIRES_REFUND');
    expect(whAfterCancel.body.orderStatus).toBe('CANCELLED');
  });

  it('18. handles concurrent webhook + customer reconcile + POS reconcile atomically with zero duplicate settlement', async () => {
    const createRes = await request(app)
      .post(`/api/public/qr/${merchantA.qrToken}/orders`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        customerName: 'Uji Konkurensi',
        paymentMethod: 'QRIS_DYNAMIC',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id as string;
    const trackingToken = createRes.body.trackingToken as string;
    const providerOrderId = createRes.body.payment.providerOrderId as string;
    const rec = mockStore.get(providerOrderId)!;

    rec.statusCode = '200';
    rec.transactionStatus = 'settlement';
    const sig = signMidtransNotification(providerOrderId, '200', rec.grossAmount);

    const [rWh, rTrack, rPos] = await Promise.all([
      request(app).post('/api/webhooks/midtrans').send({
        order_id: providerOrderId,
        transaction_id: rec.transactionId,
        status_code: '200',
        gross_amount: rec.grossAmount,
        transaction_status: 'settlement',
        signature_key: sig,
      }),
      request(app).post(`/api/public/tracking/${trackingToken}/reconcile`).send({}),
      request(app)
        .post(`/api/v1/payments/${orderId}/reconcile`)
        .set('Cookie', merchantA.ownerCookie)
        .send({}),
    ]);

    expect(rWh.status).toBe(200);
    expect(rTrack.status).toBe(200);
    expect(rPos.status).toBe(200);

    const auditCount = await pool!.query(
      "SELECT 1 FROM audit_logs WHERE entity_id = $1 AND action = 'PAYMENT_DYNAMIC_QRIS_SETTLED'",
      [orderId],
    );
    expect(auditCount.rowCount).toBe(1);
  });

  it('16 & 21. separates SANDBOX Dynamic QRIS volume from LIVE Cash/Static QRIS revenue across Dashboard, History & Super Admin', async () => {
    // Create and immediately settle a real LIVE Cash POS order (22000 + 5000 = 27000)
    const cashOrder = await request(app)
      .post('/api/v1/orders/manual')
      .set('Cookie', merchantA.cashierCookie)
      .send({
        idempotencyKey: crypto.randomUUID(),
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        tableId: merchantA.tableId,
        customerName: 'Tunai Produksi',
        paymentMethod: 'CASH',
        cashReceived: 30000,
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(cashOrder.status).toBe(201);
    expect(cashOrder.body.paymentStatus).toBe('PAID');
    expect(cashOrder.body.change).toBe(3000);

    // Merchant Dashboard separates LIVE revenue (27000) from SANDBOX volume (> 0)
    const dashRes = await request(app).get('/api/v1/orders/dashboard').set('Cookie', merchantA.ownerCookie);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.metrics.revenue).toBe(27000);
    expect(dashRes.body.metrics.sandboxOrdersToday).toBeGreaterThanOrEqual(3);
    expect(dashRes.body.metrics.sandboxGrossToday).toBeGreaterThan(0);

    // Merchant History summary (status=ALL) separates paidRevenue (LIVE) from sandboxGrossVolume
    const histRes = await request(app)
      .get('/api/v1/orders/history?status=ALL')
      .set('Cookie', merchantA.ownerCookie);
    expect(histRes.status).toBe(200);
    expect(histRes.body.summary.paidRevenue).toBe(27000);
    expect(histRes.body.summary.sandboxGrossVolume).toBeGreaterThan(0);

    // Super Admin Overview GMV includes ONLY LIVE transactions (27000) while reporting sandboxGmv separately
    const saRes = await request(app).get('/api/super-admin/overview').set('Cookie', superAdminCookie);
    expect(saRes.status).toBe(200);
    expect(saRes.body.metrics.totalGmv).toBe(27000);
    expect(saRes.body.metrics.totalPaidOrders).toBe(1);
    expect(saRes.body.metrics.sandboxGmv).toBeGreaterThan(0);
    expect(saRes.body.metrics.sandboxPaidOrders).toBeGreaterThanOrEqual(3);
  });

  it('19. enforces extended orders_paid_queue_check on READY_TO_SERVE while allowing post-service refunds', async () => {
    const ord = await request(app)
      .post('/api/v1/orders/manual')
      .set('Cookie', merchantA.ownerCookie)
      .send({
        idempotencyKey: crypto.randomUUID(),
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        customerName: 'Uji Constraint DB',
        paymentMethod: 'CASH',
        cashReceived: 30000,
        items: [{ productId: merchantA.productId, quantity: 1, variantIds: [merchantA.variantId], addonIds: [] }],
      });
    expect(ord.status).toBe(201);
    const orderId = ord.body.id as string;

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', merchantA.ownerCookie)
      .send({ status: 'IN_PROGRESS' });
    const readyRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', merchantA.ownerCookie)
      .send({ status: 'READY_TO_SERVE' });
    expect(readyRes.status).toBe(200);

    // Direct SQL attempt to set payment_status = 'UNPAID' while READY_TO_SERVE MUST be rejected by PostgreSQL CHECK constraint
    await expect(
      pool!.query("UPDATE orders SET payment_status = 'UNPAID' WHERE id = $1", [orderId]),
    ).rejects.toThrow(/orders_paid_queue_check/);

    // Authorized post-service refund on READY_TO_SERVE order MUST succeed cleanly
    const refundRes = await request(app)
      .post(`/api/v1/payments/${orderId}/refund`)
      .set('Cookie', merchantA.ownerCookie)
      .send({ reason: 'Komplain kualitas minuman' });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.paymentStatus).toBe('REFUNDED');
  });

  it('20. manages SaaS Subscription Invoices separately and activates plan ONLY after verified settlement', async () => {
    const invCreate = await request(app)
      .post('/api/v1/subscription/invoices')
      .set('Cookie', merchantA.ownerCookie)
      .send({ planCode: 'pro' });
    expect(invCreate.status).toBe(201);
    const invoice = invCreate.body;
    expect(invoice.status).toBe('PENDING_PAYMENT');
    expect(invoice.providerOrderId).toMatch(/^WKP-SUB-/);

    const subBefore = await pool!.query('SELECT status, plan_id FROM subscriptions WHERE merchant_id = $1', [
      merchantA.merchantId,
    ]);
    expect(subBefore.rows[0].status).toBe('TRIAL');

    const subRecord = mockStore.get(invoice.providerOrderId)!;
    subRecord.statusCode = '200';
    subRecord.transactionStatus = 'settlement';
    const subSig = signMidtransNotification(invoice.providerOrderId, '200', subRecord.grossAmount);

    const subWh = await request(app).post('/api/webhooks/midtrans').send({
      order_id: invoice.providerOrderId,
      transaction_id: subRecord.transactionId,
      status_code: '200',
      gross_amount: subRecord.grossAmount,
      transaction_status: 'settlement',
      signature_key: subSig,
    });
    expect(subWh.status).toBe(200);
    expect(subWh.body.domain).toBe('SUBSCRIPTION');
    expect(subWh.body.outcome).toBe('ACTIVATED');

    const subAfter = await pool!.query('SELECT status, plan_id FROM subscriptions WHERE merchant_id = $1', [
      merchantA.merchantId,
    ]);
    expect(subAfter.rows[0].status).toBe('ACTIVE');
    expect(subAfter.rows[0].plan_id).toBe(merchantA.proPlanId);

    // F&B GMV (27000 + 27000 refunded -> only 27000 PAID) must remain untouched by SaaS subscription billing!
    const saRes = await request(app).get('/api/super-admin/overview').set('Cookie', superAdminCookie);
    expect(saRes.body.metrics.totalGmv).toBe(27000);
  });

  it('maps Midtrans transaction states & WIB timestamps accurately', async () => {
    expect(mapMidtransTransactionState('pending', 'accept')).toBe('PENDING');
    expect(mapMidtransTransactionState('settlement', 'accept')).toBe('SETTLED');
    expect(mapMidtransTransactionState('settlement', null)).toBe('SETTLED');
    expect(mapMidtransTransactionState('capture', 'accept')).toBe('SETTLED');
    expect(mapMidtransTransactionState('capture', 'challenge')).toBe('PENDING');
    expect(mapMidtransTransactionState('settlement', 'deny')).toBe('FAILED');
    expect(mapMidtransTransactionState('expire', null)).toBe('EXPIRED');
    expect(mapMidtransTransactionState('cancel', null)).toBe('FAILED');
    expect(mapMidtransTransactionState('deny', null)).toBe('FAILED');
    expect(mapMidtransTransactionState('refund', null)).toBe('REFUNDED');
    expect(mapMidtransTransactionState('partial_refund', null)).toBe('REFUNDED');

    const parsedWib = parseMidtransTimestamp('2026-11-27 15:00:00');
    expect(parsedWib?.toISOString()).toBe('2026-11-27T08:00:00.000Z');

    const rawEnv = {
      MIDTRANS_ENABLED: 'true',
      MIDTRANS_ENVIRONMENT: 'sandbox',
      MIDTRANS_SERVER_KEY: TEST_SERVER_KEY,
      MIDTRANS_SANDBOX_MERCHANT_ID: 'laris-sandbox-cafe',
    } as unknown as NodeJS.ProcessEnv;
    const valid = signMidtransNotification('WKP-ORD-1234', '200', '25000.00');
    expect(
      verifyMidtransWebhookSignature(
        { order_id: 'WKP-ORD-1234', status_code: '200', gross_amount: '25000.00', signature_key: valid },
        rawEnv,
      ),
    ).toBe(true);
    expect(
      verifyMidtransWebhookSignature(
        { order_id: 'WKP-ORD-1234', status_code: '200', gross_amount: '25000.00', signature_key: 'short' },
        rawEnv,
      ),
    ).toBe(false);

    await expect(
      chargeMidtransDynamicQris(
        {
          providerOrderId: 'WKP-ORD-BADSUM',
          grossAmount: 50000,
          customerName: 'Test',
          items: [{ id: '1', name: 'Item', price: 20000, quantity: 2 }],
        },
        rawEnv,
      ),
    ).rejects.toThrow(/tidak cocok dengan gross_amount/);
  });
});
