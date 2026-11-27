import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

type State = {
  password: string;
  merchantA: { email: string; merchantId: string; outletId: string; productId: string; variantId: string; addonId: string; qrToken: string };
  merchantB: { email: string; merchantId: string; outletId: string };
};

const readState = async () => JSON.parse(await fs.readFile('.e2e-state.json', 'utf8')) as State;
const sampleQrisDataUrl =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#ffffff"/><rect x="12" y="12" width="32" height="32" fill="#1B4D3E"/><rect x="76" y="12" width="32" height="32" fill="#1B4D3E"/><rect x="12" y="76" width="32" height="32" fill="#1B4D3E"/><rect x="52" y="52" width="16" height="16" fill="#252525"/></svg>',
  );

test.describe('Business Settings & static QRIS enforcement', () => {
  test('enforces unconfigured QRIS, availability, service modes, static QRIS verification, and tenant isolation', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once against isolated PostgreSQL database.');
    const s = await readState();

    const merchantA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const merchantB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });

    const mpA = await merchantA.newPage();
    const mpB = await merchantB.newPage();
    const cp = await customer.newPage();

    try {

    // Login Merchant A & Merchant B
    await mpA.goto('/merchant/login');
    await mpA.getByPlaceholder('Email').fill(s.merchantA.email);
    await mpA.getByPlaceholder('Kata sandi').fill(s.password);
    await mpA.getByRole('button', { name: 'Masuk' }).click();
    await mpA.waitForURL(/\/admin/);

    await mpB.goto('/merchant/login');
    await mpB.getByPlaceholder('Email').fill(s.merchantB.email);
    await mpB.getByPlaceholder('Kata sandi').fill(s.password);
    await mpB.getByRole('button', { name: 'Masuk' }).click();
    await mpB.waitForURL(/\/admin/);

    // 1. Unconfigured QRIS: hidden in Customer & Manual POS, rejected by server
    await cp.goto(`/q/${s.merchantA.qrToken}`);
    await expect(cp.getByRole('heading', { name: /Selamat Datang di E2E A/ })).toBeVisible();
    await cp.getByRole('button', { name: 'Tambah' }).first().click();
    await cp.getByRole('button', { name: 'Besar' }).first().click();
    await cp.getByRole('button', { name: /Tambah ke Keranjang/ }).click();
    await cp.getByRole('button', { name: /Lihat Keranjang/ }).click();
    await cp.getByRole('button', { name: 'Lanjut ke Checkout' }).click();
    await expect(cp.getByRole('button', { name: /^QRIS/ })).toHaveCount(0);
    await expect(cp.getByRole('button', { name: /E-Wallet/ })).toHaveCount(0);
    await expect(cp.getByRole('button', { name: /Transfer Bank/ })).toHaveCount(0);
    await expect(cp.getByRole('button', { name: /Bayar di Kasir/ })).toBeVisible();

    const unconfiguredPublicQris = await cp.request.post(`/api/public/qr/${s.merchantA.qrToken}/orders`, {
      data: {
        customerName: 'Unconfigured QRIS',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'QRIS',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(unconfiguredPublicQris.status()).toBe(400);

    await mpA.goto('/admin/pos');
    await expect(mpA.getByText(/QRIS belum dikonfigurasi/)).toBeVisible();
    const unconfiguredManualQris = await mpA.request.post('/api/v1/orders/manual', {
      data: {
        customerName: 'Manual Unconfigured QRIS',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'QRIS',
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(unconfiguredManualQris.status()).toBe(400);

    // 2. Configure static QRIS & disable Dine In + Table Service in Merchant A Settings
    await mpA.goto('/admin/settings');
    await expect(mpA.getByLabel('Gambar QRIS Statis Merchant')).toBeVisible();
    await mpA.getByLabel('Gambar QRIS Statis Merchant').fill(sampleQrisDataUrl);
    await mpA.getByLabel(/Dine In/).uncheck();
    await mpA.getByLabel(/Table Service/).uncheck();
    await mpA.getByRole('button', { name: 'Simpan Pengaturan' }).click();
    await expect(mpA.getByText('Pengaturan cafe berhasil disimpan.')).toBeVisible();

    // Verify Merchant B settings are completely isolated
    await mpB.goto('/admin/settings');
    await expect(mpB.getByLabel('Gambar QRIS Statis Merchant')).toHaveValue('');
    await expect(mpB.getByLabel(/Dine In/)).toBeChecked();

    // 3. Verify Customer QR enforces Takeaway-only, Pickup-only, and displays configured static QRIS
    await cp.reload();
    await cp.getByRole('button', { name: /Lihat Keranjang/ }).click();
    await cp.getByRole('button', { name: 'Lanjut ke Checkout' }).click();
    await expect(cp.getByRole('button', { name: /Dine In/ })).toHaveCount(0);
    await expect(cp.getByRole('button', { name: /Takeaway/ })).toBeVisible();
    await expect(cp.getByText(/Pickup Counter — Pesanan Takeaway/)).toBeVisible();
    await expect(cp.getByRole('button', { name: /^QRIS/ })).toBeVisible();

    // Server-side enforcement rejects disabled DINE_IN and TABLE_SERVICE
    const rejectedDineIn = await cp.request.post(`/api/public/qr/${s.merchantA.qrToken}/orders`, {
      data: {
        customerName: 'Rejected DineIn',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'CASH',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(rejectedDineIn.status()).toBe(400);

    // Customer submits real static QRIS order
    await cp.getByPlaceholder('Contoh: Budi Santoso').fill('Pelanggan QRIS');
    await cp.getByRole('button', { name: /^QRIS/ }).click();
    await cp.getByRole('button', { name: /Lanjut Pembayaran/ }).click();
    const qrisImg = cp.getByAltText(/QRIS E2E A/);
    await expect(qrisImg).toBeVisible();
    expect(await qrisImg.getAttribute('src')).toBe(sampleQrisDataUrl);
    await cp.getByRole('button', { name: /Buat Pesanan/ }).click();
    await expect(cp.getByText(/Menunggu verifikasi pembayaran QRIS|Pembayaran QRIS untuk pesanan/)).toBeVisible();
    await expect(cp.getByText('Saat Ini')).toHaveCount(0);

    // 4. Verify Manual POS enforces Takeaway-only, shows configured QRIS, and allows manual verification
    await mpA.goto('/admin/pos');
    await expect(mpA.getByRole('button', { name: 'Dine in' })).toHaveCount(0);
    await expect(mpA.getByRole('button', { name: 'Takeaway' })).toBeVisible();
    await mpA.getByRole('combobox').last().selectOption('QRIS');
    await expect(mpA.getByAltText(/QRIS E2E A/)).toBeVisible();
    await mpA.screenshot({ path: 'test-results/admin-pos-qris.png', fullPage: true });

    // Merchant A verifies customer QRIS payment in Orders
    await mpA.goto('/admin/orders');
    const qrisCard = mpA.locator('article').filter({ hasText: 'Pelanggan QRIS' });
    await expect(qrisCard).toBeVisible();

    // Merchant B cannot see or confirm Merchant A's order
    const orderIdText = (await qrisCard.locator('.font-mono').first().textContent())?.trim() || '';
    expect(orderIdText).toBeTruthy();
    const crossConfirm = await mpB.request.post(`/api/v1/payments/${orderIdText}/confirm`, { data: {} });
    expect(crossConfirm.status()).toBe(404);

    await qrisCard.getByRole('button', { name: 'Verifikasi Pembayaran' }).click();
    await expect(qrisCard.getByRole('button', { name: 'Proses Pesanan' })).toBeVisible();
    await cp.getByRole('button', { name: 'Segarkan status' }).click();
    await expect(cp.getByText('Pesanan Masuk', { exact: true }).last()).toBeVisible();
    await expect(cp.getByText('Saat Ini')).toBeVisible();

    // 5. Business availability (CLOSED): blocks both Customer QR and Manual POS (UI + API)
    await mpA.goto('/admin/settings');
    await mpA.locator('select').selectOption('CLOSED');
    await mpA.getByRole('button', { name: 'Simpan Pengaturan' }).click();
    await expect(mpA.getByText('Pengaturan cafe berhasil disimpan.')).toBeVisible();

    await cp.goto(`/q/${s.merchantA.qrToken}`);
    await expect(cp.getByText(/sedang tutup sementara/)).toBeVisible();
    await expect(cp.getByRole('button', { name: 'Tambah' }).first()).toBeDisabled();

    const closedPublicOrder = await cp.request.post(`/api/public/qr/${s.merchantA.qrToken}/orders`, {
      data: {
        customerName: 'Closed Store',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'CASH',
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(closedPublicOrder.status()).toBe(409);

    await mpA.goto('/admin/pos');
    await expect(mpA.getByText(/Outlet sedang tutup sementara/)).toBeVisible();
    const closedManualOrder = await mpA.request.post('/api/v1/orders/manual', {
      data: {
        customerName: 'Closed Manual',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'CASH',
        cashReceived: 30000,
        orderType: 'TAKEAWAY',
        fulfillmentMethod: 'PICKUP_COUNTER',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(closedManualOrder.status()).toBe(409);
    } finally {
      // Restore Merchant A default open settings so test execution order never bleeds state
      await mpA.request
        .put('/api/v1/settings', {
          data: {
            name: 'E2E A',
            slug: 'outlet-a',
            isOpen: true,
            enableDineIn: true,
            enableTakeaway: true,
            enableTableService: true,
            enablePickupCounter: true,
            qrisImageUrl: '',
          },
        })
        .catch(() => {});
      await merchantA.close();
      await merchantB.close();
      await customer.close();
    }
  });
});
