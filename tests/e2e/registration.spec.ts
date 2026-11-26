/**
 * Merchant registration and complete onboarding journey:
 * 1. Register via landing page modal -> auto-login -> Trial active & persisted onboarding checklist
 * 2. Full zero-to-first-transaction journey:
 *    Register -> Settings & Static QRIS -> Category -> Product + Variants/Addons -> Table + QR
 *    -> Customer scans QR & submits order -> Pay-First verification -> Barista queue -> Ready
 *    -> Customer digital receipt & back-to-menu -> Merchant history & 5/5 onboarding complete
 */
import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';

const sampleQrisDataUrl =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#ffffff"/><rect x="12" y="12" width="32" height="32" fill="#1B4D3E"/><rect x="76" y="12" width="32" height="32" fill="#1B4D3E"/><rect x="12" y="76" width="32" height="32" fill="#1B4D3E"/></svg>',
  );

test.describe('Merchant registration and onboarding', () => {
  test('new merchant can register, login, and see dashboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once against isolated PostgreSQL database.');

    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `newmerchant-${suffix}@test.example`;
    const password = `secure-password-${suffix}`;
    const businessName = `Warung Test ${suffix.slice(0, 6)}`;

    // 1. Visit landing page
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Sistem POS & QR Order/i })).toBeVisible();

    // 2. Open registration modal
    await page.getByRole('button', { name: /Coba Gratis/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Daftar Gratis 14 Hari' })).toBeVisible();
    await page.screenshot({ path: `test-results/registration-modal-${testInfo.project.name}.png` });

    // 3. Fill registration form
    await page.getByLabel('Nama Lengkap Pemilik').fill('Pemilik Warung Test');
    await page.getByLabel('Email Bisnis').fill(email);
    await page.getByLabel(/Kata Sandi/).fill(password);
    await page.getByLabel('Nama Brand / Bisnis').fill(businessName);
    await page.getByLabel('Nama Outlet Utama').fill('Cabang Pusat');

    // 4. Submit - click the form submit button specifically
    await page.locator('form').getByRole('button', { name: /Mulai Trial 14 Hari Gratis/i }).click();

    // 5. Redirects to admin dashboard
    await page.waitForURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();
    await page.screenshot({ path: `test-results/registration-dashboard-${testInfo.project.name}.png`, fullPage: false });

    // 6. Shows merchant name from registration in sidebar
    await expect(page.getByText(businessName).first()).toBeVisible();

    // 7. Onboarding checklist visible (persisted DB progress)
    await expect(page.getByText('Mulai dalam 5 langkah')).toBeVisible();

    // 8. Navigate to subscription page — shows trial
    await page.goto('/admin/subscription');
    await expect(page.getByText('Trial Aktif')).toBeVisible();
    await page.screenshot({ path: `test-results/registration-subscription-${testInfo.project.name}.png`, fullPage: true });

    // 9. Verify API: entitlements returns trial status
    const entResp = await page.request.get('/api/v1/orders/entitlements');
    expect(entResp.status()).toBe(200);
    const ent = await entResp.json();
    expect(ent.status).toBe('TRIAL');
    expect(ent.effectiveActive).toBe(true);

    // 10. Can logout and log back in
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Keluar Sesi' }).click();
    await page.waitForURL(/\/merchant\/login/);

    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Kata sandi').fill(password);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.waitForURL(/\/admin/);
    await expect(page.getByText(businessName).first()).toBeVisible();
  });

  test('new merchant completes full onboarding from registration to first verified QR order and receipt', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once against isolated PostgreSQL database.');

    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `onboard-${suffix}@test.example`;
    const password = `onboard-pass-${suffix}`;
    const brandName = `Kopi Nusantara ${suffix.slice(0, 4)}`;
    const outletName = `Outlet Kemang ${suffix.slice(0, 4)}`;

    const merchantCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const customerCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mp = await merchantCtx.newPage();
    const cp = await customerCtx.newPage();

    try {
      // 1. Register with Pro plan via /?register=1
      await mp.goto('/?register=1');
      await expect(mp.getByRole('heading', { name: 'Daftar Gratis 14 Hari' })).toBeVisible();
      await mp.locator('label').filter({ hasText: 'Pro' }).first().click();
      await mp.getByLabel('Nama Lengkap Pemilik').fill('Rina Kusuma');
      await mp.getByLabel('Email Bisnis').fill(email);
      await mp.getByLabel(/Kata Sandi/).fill(password);
      await mp.getByLabel('Nama Brand / Bisnis').fill(brandName);
      await mp.getByLabel('Nama Outlet Utama').fill(outletName);
      await mp.locator('form').getByRole('button', { name: /Mulai Trial 14 Hari Gratis/i }).click();
      await mp.waitForURL(/\/admin/);
      await expect(mp.getByText('Mulai dalam 5 langkah')).toBeVisible();

      // 2. Step 1: Configure outlet profile & static QRIS
      await mp.goto('/admin/settings');
      await mp.getByLabel('Gambar QRIS Statis Merchant').fill(sampleQrisDataUrl);
      await mp.getByRole('button', { name: 'Simpan Pengaturan' }).click();
      await expect(mp.getByText('Pengaturan cafe berhasil disimpan.')).toBeVisible();

      // 3. Step 2: Create first category
      await mp.goto('/admin/categories');
      await mp.getByPlaceholder(/Nama kategori baru/).fill('Signature Coffee');
      await mp.getByRole('button', { name: /Tambah Kategori/ }).click();
      await expect(mp.getByText('Signature Coffee', { exact: true })).toBeVisible();

      // 4. Step 3: Create first product with default Size variants (Regular +0 / Large +5000) & Extra Espresso Shot (+6000)
      await mp.goto('/admin/menu');
      await mp.getByRole('button', { name: 'Tambah Produk' }).click();
      await mp.getByPlaceholder('Contoh: Es Kopi Susu Aren').fill('Es Kopi Susu Aren');
      await mp.getByRole('button', { name: 'Simpan Produk' }).click();
      await expect(mp.getByText('Es Kopi Susu Aren', { exact: true }).last()).toBeVisible();

      // 5. Step 4: Create first table & obtain QR ordering URL
      await mp.goto('/admin/tables');
      await mp.getByPlaceholder('Contoh: C01, VIP-1, BAR-02').fill('A01');
      await mp.getByRole('button', { name: /Tambah Meja & Generate QR/ }).click();
      await mp.getByRole('button', { name: 'Tutup preview' }).click();
      const tableCard = mp.locator('article').filter({ hasText: 'A01' });
      const qrHref = await tableCard.locator('a[title="Buka halaman pemesanan meja ini"]').getAttribute('href');
      expect(qrHref).toMatch(/^\/q\//);

      // 6. Customer scans QR, customizes Large (+5000) + Extra Espresso Shot (+6000) on Rp22.000 base = Rp33.000
      await cp.goto(qrHref!);
      await expect(cp.getByRole('heading', { name: new RegExp(`Selamat Datang di ${brandName}`) })).toBeVisible();
      await cp.getByRole('button', { name: 'Tambah' }).first().click();
      await cp.getByRole('button', { name: /Large/ }).click();
      await cp.getByRole('button', { name: /Extra Espresso Shot/ }).click();
      await cp.getByRole('button', { name: /Tambah ke Keranjang/ }).click();
      await cp.getByRole('button', { name: /Lihat Keranjang/ }).click();
      await cp.getByRole('button', { name: 'Lanjut ke Checkout' }).click();
      await cp.getByPlaceholder('Contoh: Budi Santoso').fill('Pelanggan Perdana');
      await cp.getByRole('button', { name: /^QRIS/ }).click();
      await cp.getByRole('button', { name: /Lanjut Pembayaran/ }).click();
      await expect(cp.getByAltText(new RegExp(`QRIS ${brandName}`))).toBeVisible();
      await cp.getByRole('button', { name: /Buat Pesanan/ }).click();
      await cp.waitForURL(/\/tracking\//);
      await expect(cp.getByText(/Pembayaran QRIS untuk pesanan/i)).toBeVisible();

      // Verify unpaid order on merchant dashboard does NOT render "Mulai Masak" (Pay-First rule!)
      await mp.goto('/admin');
      await expect(mp.getByText('Menunggu Verifikasi').first()).toBeVisible();
      await expect(mp.getByRole('button', { name: 'Mulai Masak' })).toHaveCount(0);

      // 7. Step 5: Merchant verifies QRIS payment & completes barista progression
      await mp.goto('/admin/orders');
      const orderCard = mp.locator('article').filter({ hasText: 'Pelanggan Perdana' });
      await expect(orderCard).toBeVisible();
      await orderCard.getByRole('button', { name: 'Verifikasi Pembayaran' }).click();
      await expect(orderCard.getByRole('button', { name: 'Proses Pesanan' })).toBeVisible();
      await orderCard.getByRole('button', { name: 'Proses Pesanan' }).click();
      await expect(orderCard.getByRole('button', { name: 'Tandai Siap' })).toBeVisible();
      await orderCard.getByRole('button', { name: 'Tandai Siap' }).click();

      // 8. Customer refreshes tracking, views verified digital receipt, and sees valid "Pesan Lagi" link back to /q/:token
      await cp.getByRole('button', { name: 'Segarkan status' }).click();
      await expect(cp.getByText('Pesanan Siap', { exact: true }).last()).toBeVisible();
      const orderAgainHref = await cp.getByRole('link', { name: /Pesan Lagi/i }).getAttribute('href');
      expect(orderAgainHref).toBe(qrHref);
      await cp.getByRole('button', { name: /Cetak \/ Simpan Struk Digital/i }).click();
      await expect(cp.getByRole('dialog', { name: 'Struk transaksi' })).toBeVisible();
      await expect(cp.getByText(/PEMBAYARAN LUNAS TERVERIFIKASI/i)).toBeVisible();

      // 9. Merchant sees verified Rp33.000 in History and 5/5 onboarding completed on Dashboard
      await mp.goto('/admin/history');
      await expect(mp.getByText('Pelanggan Perdana')).toBeVisible();
      await expect(mp.getByText('Rp33.000').first()).toBeVisible();

      await mp.goto('/admin');
      await expect(mp.getByText('Rp33.000').first()).toBeVisible();
      await expect(mp.getByText('Mulai dalam 5 langkah')).toHaveCount(0);
    } finally {
      await merchantCtx.close();
      await customerCtx.close();
    }
  });
});
