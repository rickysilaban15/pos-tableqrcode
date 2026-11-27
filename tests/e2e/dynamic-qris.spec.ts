import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type E2EState = {
  password: string;
  superAdmin: { email: string };
  merchantA: { email: string; merchantId: string; outletId: string; qrToken: string };
  merchantB: { email: string; merchantId: string; outletId: string };
  merchantC: {
    email: string;
    merchantId: string;
    outletId: string;
    productId: string;
    variantId: string;
    addonId: string;
    qrToken: string;
  };
};

type MockQrisTx = {
  orderId: string;
  transactionId: string;
  grossAmount: string;
  statusCode: string;
  transactionStatus: string;
  qrString: string;
  qrImageUrl: string;
  expiryTime: string;
  settlementTime?: string;
};

const E2E_SERVER_KEY = 'SB-Mid-server-e2e-mock-sandbox-key-998877';
const SCREENSHOT_DIR =
  '/Users/vdr/.gemini/antigravity/brain/6a1eeb6b-4ae0-4fef-b066-650ac8b7d8e7/phase2-screenshots';

function signWebhook(orderId: string, statusCode: string, grossAmount: string): string {
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${E2E_SERVER_KEY}`)
    .digest('hex');
}

const readState = async () => JSON.parse(await fs.readFile('.e2e-state.json', 'utf8')) as E2EState;

test.describe('[MOCKED MIDTRANS SANDBOX E2E] Dynamic QRIS Customer, POS, Webhook, Reconciliation & Financial Separation', () => {
  let mockMidtrans: http.Server;
  const txMap = new Map<string, MockQrisTx>();

  test.beforeAll(async () => {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

    mockMidtrans = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1:3102');

      if (req.method === 'POST' && url.pathname === '/v2/charge') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw || '{}');
        const orderId = String(body.transaction_details?.order_id || '');
        const grossInt = Number(body.transaction_details?.gross_amount || 0);
        const grossAmount = `${grossInt}.00`;
        const txId = crypto.randomUUID();
        const qrString = `00020101021226670016COM.MIDTRANS.WWW011893600914${orderId.slice(-10)}5204581253033605408${grossInt}5802ID5912LARIS COFFEE6007JAKARTA6304E2E1`;
        const qrImageUrl = `http://127.0.0.1:3102/v2/qris/${txId}/qr-code`;
        const expMs = Date.now() + 15 * 60_000 + 7 * 3600_000;
        const expiryWib = new Date(expMs).toISOString().slice(0, 19).replace('T', ' ');

        const record: MockQrisTx = {
          orderId,
          transactionId: txId,
          grossAmount,
          statusCode: '201',
          transactionStatus: 'pending',
          qrString,
          qrImageUrl,
          expiryTime: expiryWib,
        };
        txMap.set(orderId, record);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status_code: '201',
            status_message: 'QRIS transaction is created',
            transaction_id: txId,
            order_id: orderId,
            merchant_id: 'G812345678',
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
        const orderId = decodeURIComponent(statusMatch[1]);
        const record = txMap.get(orderId);
        if (!record) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status_code: '404', status_message: 'Transaction does not exist' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status_code: record.statusCode,
            status_message: 'Success, transaction is found',
            transaction_id: record.transactionId,
            order_id: record.orderId,
            merchant_id: 'G812345678',
            gross_amount: record.grossAmount,
            currency: 'IDR',
            payment_type: 'qris',
            transaction_status: record.transactionStatus,
            fraud_status: 'accept',
            acquirer: 'gopay',
            expiry_time: record.expiryTime,
            settlement_time: record.settlementTime,
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise<void>((resolve) => {
      mockMidtrans.listen(3102, '127.0.0.1', () => resolve());
    });
  });

  test.afterAll(async () => {
    if (mockMidtrans) {
      await new Promise<void>((resolve) => mockMidtrans.close(() => resolve()));
    }
  });

  test('verifies Customer QR Dynamic QRIS, Webhook SSE, Expired QRIS, POS Dynamic QRIS, Multi-Tenant Isolation & Multi-Viewport UI', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once across 390/768/1440 viewports against isolated DB.');
    test.setTimeout(90_000);
    const s = await readState();

    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const tabletCtx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const otherTenantCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const cp = await mobileCtx.newPage();
    const tp = await tabletCtx.newPage();
    const dp = await desktopCtx.newPage();
    const bp = await otherTenantCtx.newPage();

    const pageErrors: string[] = [];
    for (const p of [cp, tp, dp, bp]) {
      p.on('pageerror', (err) => pageErrors.push(err.message));
    }

    try {
      // Login designated Sandbox merchant (LARIS Coffee Sandbox) on Desktop & Tablet, plus Merchant B for isolation check
      for (const p of [dp, tp]) {
        await p.goto('/merchant/login');
        await p.getByPlaceholder('Email').fill(s.merchantC.email);
        await p.getByPlaceholder('Kata sandi').fill(s.password);
        await p.getByRole('button', { name: 'Masuk' }).click();
        await p.waitForURL(/\/admin/);
      }

      await bp.goto('/merchant/login');
      await bp.getByPlaceholder('Email').fill(s.merchantB.email);
      await bp.getByPlaceholder('Kata sandi').fill(s.password);
      await bp.getByRole('button', { name: 'Masuk' }).click();
      await bp.waitForURL(/\/admin/);

      // Multi-tenant isolation check on Merchant B settings
      await bp.goto('/admin/settings');
      await expect(bp.getByText('Menunggu Konfigurasi')).toBeVisible();
      await expect(bp.getByText(/isolasi kredensial multi-tenant aktif/i)).toBeVisible();

      // Screenshot 10: Merchant Payment Settings on designated Sandbox merchant (1440x900)
      await dp.goto('/admin/settings');
      await expect(dp.getByText('Status Metode Pembayaran & Gateway (Midtrans Core API v2)')).toBeVisible();
      await expect(dp.getByText('Siap Digunakan (Sandbox)')).toBeVisible();
      await dp.screenshot({
        path: path.join(SCREENSHOT_DIR, '10-merchant-payment-settings-desktop-1440.png'),
        fullPage: true,
      });

      // Customer QR Ordering on Mobile (390x844) -> Add item -> Checkout payment selection
      await cp.goto(`/q/${s.merchantC.qrToken}`);
      await expect(cp.getByRole('heading', { name: /Selamat Datang di LARIS Coffee Sandbox/i })).toBeVisible();
      await cp.getByRole('button', { name: 'Tambah' }).first().click();
      await cp.getByRole('button', { name: 'Regular' }).first().click();
      await cp.getByRole('button', { name: /Extra Espresso Shot/i }).first().click();
      await cp.getByRole('button', { name: /Tambah ke Keranjang/i }).click();
      await cp.getByRole('button', { name: /Lihat Keranjang/i }).click();
      await cp.getByRole('button', { name: 'Lanjut ke Checkout' }).click();
      await cp.getByPlaceholder('Contoh: Budi Santoso').fill('Nadia Putri');
      await cp.getByRole('button', { name: /Pembayaran QRIS Otomatis/i }).click();

      // Screenshot 1: Checkout payment selection (390x844)
      await cp.screenshot({
        path: path.join(SCREENSHOT_DIR, '01-checkout-payment-selection-mobile-390.png'),
      });

      // Initiate Dynamic QRIS via Midtrans Sandbox Core API v2
      await cp.getByRole('button', { name: /Buat QRIS Otomatis/i }).click();
      await expect(cp.getByRole('heading', { name: 'Pembayaran QRIS Otomatis' })).toBeVisible();
      await expect(cp.getByText(/Simulasi Tanpa Uang Asli/i)).toBeVisible();
      await expect(cp.getByText('MIDTRANS SANDBOX')).toBeVisible();

      // Screenshot 2: Dynamic QRIS payment drawer (390x844)
      await cp.screenshot({
        path: path.join(SCREENSHOT_DIR, '02-dynamic-qris-payment-drawer-mobile-390.png'),
      });

      // Extract providerOrderId from "Ref: WKP-ORD-..."
      const refText = (await cp.getByText(/^Ref:\s+WKP-ORD-/).textContent())?.trim() || '';
      const providerOrderId1 = refText.replace(/^Ref:\s+/, '').trim();
      expect(providerOrderId1).toMatch(/^WKP-ORD-/);
      const tx1 = txMap.get(providerOrderId1)!;
      expect(tx1).toBeTruthy();

      // Navigate to Order Tracking while still PENDING
      await cp.getByRole('button', { name: /Buka Halaman Pelacakan Pesanan/i }).click();
      await expect(cp).toHaveURL(/\/tracking\//);
      await expect(cp.getByText('QRIS Nasional Dinamis')).toBeVisible();
      // Pay First, Order Later: operational progress step must NOT show 'Saat Ini' while unpaid!
      await expect(cp.getByText('Saat Ini')).toHaveCount(0);

      // Screenshot 3: Pending payment on customer tracking (390x844)
      await cp.screenshot({
        path: path.join(SCREENSHOT_DIR, '03-pending-payment-tracking-mobile-390.png'),
        fullPage: true,
      });

      // Merchant Orders Queue on Desktop & Tablet shows awaiting payment (NOT in barista active queue yet)
      await dp.goto('/admin/orders');
      await tp.goto('/admin/orders');
      await expect(dp.getByText('Nadia Putri')).toBeVisible();
      await expect(dp.getByText(/Menunggu penyelesaian QRIS Otomatis \(Midtrans\)/i)).toBeVisible();
      // Cashier MUST NOT have a manual "Verifikasi Pembayaran" override button on Dynamic QRIS!
      const nadiaPendingCard = dp.locator('article').filter({ hasText: 'Nadia Putri' });
      await expect(nadiaPendingCard.getByRole('button', { name: /Verifikasi Pembayaran/i })).toHaveCount(0);
      await expect(nadiaPendingCard.getByRole('button', { name: 'Cek Status Midtrans' })).toBeVisible();

      // Simulate official Midtrans Sandbox settlement + signed SHA-512 HTTPS webhook
      tx1.statusCode = '200';
      tx1.transactionStatus = 'settlement';
      tx1.settlementTime = '2026-11-27 08:25:00';
      const whRes = await dp.request.post('/api/webhooks/midtrans', {
        data: {
          order_id: providerOrderId1,
          transaction_id: tx1.transactionId,
          status_code: '200',
          gross_amount: tx1.grossAmount,
          payment_type: 'qris',
          transaction_status: 'settlement',
          fraud_status: 'accept',
          signature_key: signWebhook(providerOrderId1, '200', tx1.grossAmount),
        },
      });
      expect(whRes.status()).toBe(200);

      // Customer Tracking updates automatically via SSE (no page reload needed!) -> PAID & NEW_ORDER
      await expect(cp.getByText('Saat Ini')).toBeVisible({ timeout: 10_000 });
      await expect(cp.getByText('Lunas').first()).toBeVisible();

      // Screenshot 4: Verified payment on customer tracking (390x844)
      await cp.screenshot({
        path: path.join(SCREENSHOT_DIR, '04-verified-payment-tracking-mobile-390.png'),
        fullPage: true,
      });

      // Open Digital Receipt Modal on Customer Mobile (390x844) (Detail Menu Pesanan is expanded by default, click button directly)
      const receiptBtn = cp.getByRole('button', { name: /Cetak \/ Simpan Struk Digital/i });
      if (!(await receiptBtn.isVisible())) {
        await cp.getByRole('button', { name: /Detail Menu Pesanan/i }).click();
      }
      await receiptBtn.click();
      await expect(cp.getByText('SIMULASI SANDBOX — TANPA UANG ASLI')).toBeVisible();
      await expect(cp.getByText('PEMBAYARAN LUNAS TERVERIFIKASI')).toBeVisible();

      // Screenshot 9: Digital receipt (390x844)
      await cp.screenshot({
        path: path.join(SCREENSHOT_DIR, '09-digital-receipt-mobile-390.png'),
      });
      await cp.getByRole('button', { name: 'Tutup struk' }).click();

      // Screenshot 7: Merchant Order Queue (1440x900 & 768x1024) showing paid NEW_ORDER ready for barista!
      await expect(nadiaPendingCard.getByRole('button', { name: 'Proses Pesanan' })).toBeVisible({ timeout: 10_000 });
      await dp.screenshot({
        path: path.join(SCREENSHOT_DIR, '07-merchant-order-queue-desktop-1440.png'),
        fullPage: true,
      });
      await tp.reload();
      await expect(tp.getByText('Nadia Putri')).toBeVisible();
      await tp.screenshot({
        path: path.join(SCREENSHOT_DIR, '07b-merchant-order-queue-tablet-768.png'),
        fullPage: true,
      });

      // Barista completes preparation: NEW_ORDER -> IN_PROGRESS -> READY_TO_SERVE
      await nadiaPendingCard.getByRole('button', { name: 'Proses Pesanan' }).click();
      await expect(nadiaPendingCard.getByRole('button', { name: 'Tandai Siap' })).toBeVisible();
      await nadiaPendingCard.getByRole('button', { name: 'Tandai Siap' }).click();
      await expect(cp.getByText('Pesanan Siap', { exact: true }).last()).toBeVisible({ timeout: 10_000 });

      // Screenshot 8: Transaction History (1440x900) showing QRIS Otomatis, SANDBOX badge, and Sandbox Revenue Separation
      await dp.goto('/admin/history');
      await expect(dp.getByText('Nadia Putri')).toBeVisible();
      await expect(dp.getByText(/Pemisahan Keuangan Sandbox:/i)).toBeVisible();
      await dp.screenshot({
        path: path.join(SCREENSHOT_DIR, '08-transaction-history-desktop-1440.png'),
        fullPage: true,
      });

      // Expired Dynamic QRIS Customer Flow (390x844) -> Screenshot 5
      await cp.goto(`/q/${s.merchantC.qrToken}`);
      await cp.getByRole('button', { name: 'Tambah' }).first().click();
      await cp.getByRole('button', { name: 'Regular' }).first().click();
      await cp.getByRole('button', { name: /Tambah ke Keranjang/i }).click();
      await cp.getByRole('button', { name: /Lihat Keranjang/i }).click();
      await cp.getByRole('button', { name: 'Lanjut ke Checkout' }).click();
      await cp.getByPlaceholder('Contoh: Budi Santoso').fill('Dimas Kedaluwarsa');
      await cp.getByRole('button', { name: /Pembayaran QRIS Otomatis/i }).click();
      await cp.getByRole('button', { name: /Buat QRIS Otomatis/i }).click();
      const refText2 = (await cp.getByText(/^Ref:\s+WKP-ORD-/).textContent())?.trim() || '';
      const providerOrderId2 = refText2.replace(/^Ref:\s+/, '').trim();
      const tx2 = txMap.get(providerOrderId2)!;
      await cp.getByRole('button', { name: /Buka Halaman Pelacakan Pesanan/i }).click();
      await expect(cp).toHaveURL(/\/tracking\//);

      // Mark tx2 expired in Mock Midtrans and click local 'Cek Status Pembayaran' reconciliation
      tx2.statusCode = '407';
      tx2.transactionStatus = 'expire';
      await cp.getByRole('button', { name: 'Cek Status Pembayaran' }).click();
      await expect(cp.getByText('Batas Waktu Pembayaran QRIS Berakhir')).toBeVisible();

      // Screenshot 5: Expired payment (390x844)
      await cp.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-expired-payment-tracking-mobile-390.png'),
        fullPage: true,
      });

      // Merchant POS Dynamic QRIS Flow on Desktop (1440x900) & Tablet (768x1024) -> Screenshot 6
      await dp.goto('/admin/pos');
      await expect(dp.getByRole('heading', { name: 'Kasir POS' })).toBeVisible();
      await dp.getByRole('button', { name: /Es Kopi Susu Gula Aren/i }).click();
      await expect(dp.getByRole('dialog')).toBeVisible();
      await dp.getByRole('button', { name: /Regular/i }).click();
      await dp.getByRole('button', { name: 'Tambah ke keranjang' }).click();
      await dp.getByRole('button', { name: 'Takeaway' }).click();
      await dp.getByLabel('Pembayaran').selectOption('QRIS_DYNAMIC');
      await dp.getByRole('button', { name: 'Buat QRIS Otomatis' }).click();
      await expect(dp.getByText('QRIS Nasional Dinamis')).toBeVisible();

      // Screenshot 6: Merchant POS QRIS (1440x900) + Tablet POS verification (768x1024)
      await dp.screenshot({
        path: path.join(SCREENSHOT_DIR, '06-merchant-pos-qris-desktop-1440.png'),
        fullPage: true,
      });

      await tp.goto('/admin/pos');
      await expect(tp.getByRole('heading', { name: 'Kasir POS' })).toBeVisible();
      await tp.screenshot({
        path: path.join(SCREENSHOT_DIR, '06b-merchant-pos-qris-tablet-768.png'),
        fullPage: true,
      });

      // Settle POS Dynamic QRIS and reconcile directly from POS screen
      const posRefText = (await dp.getByText(/^Ref:\s+WKP-ORD-/).textContent())?.trim() || '';
      const providerOrderIdPos = posRefText.replace(/^Ref:\s+/, '').trim();
      const txPos = txMap.get(providerOrderIdPos)!;
      txPos.statusCode = '200';
      txPos.transactionStatus = 'settlement';
      txPos.settlementTime = '2026-11-27 08:28:00';

      await dp.getByRole('button', { name: 'Cek Status Pembayaran' }).click();
      await expect(dp.getByText('Pembayaran QRIS Otomatis Terverifikasi!')).toBeVisible();

      // Verify SaaS Subscription Invoice screen (/admin/subscription) on Desktop
      await dp.goto('/admin/subscription');
      await expect(dp.getByRole('heading', { name: /Langganan/i }).first()).toBeVisible();
      await dp.screenshot({
        path: path.join(SCREENSHOT_DIR, '10b-merchant-subscription-desktop-1440.png'),
        fullPage: true,
      });

      expect(pageErrors).toEqual([]);
    } finally {
      await mobileCtx.close();
      await tabletCtx.close();
      await desktopCtx.close();
      await otherTenantCtx.close();
    }
  });
});
