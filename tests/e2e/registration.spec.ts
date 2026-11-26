/**
 * Merchant registration and onboarding flow:
 * - Register via landing page form
 * - Automatically logs in and redirects to /admin
 * - Sees onboarding checklist (no orders yet)
 * - Subscription status shows Trial
 */
import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';

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
    await page.getByPlaceholder('Ahmad Bagas').fill('Pemilik Warung Test');
    await page.locator('input[type="email"][placeholder="email@bisnis.com"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByPlaceholder('Kopi Nusantara').fill(businessName);
    await page.getByPlaceholder('Cabang Utama').fill('Cabang Pusat');

    // 4. Submit - click the form submit button specifically
    await page.locator('form').getByRole('button', { name: /Mulai Trial 14 Hari Gratis/i }).click();

    // 5. Redirects to admin dashboard
    await page.waitForURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();
    await page.screenshot({ path: `test-results/registration-dashboard-${testInfo.project.name}.png`, fullPage: false });

    // 6. Shows merchant name from registration in sidebar
    await expect(page.getByText(businessName)).toBeVisible();

    // 7. Onboarding checklist visible (no orders)
    await expect(page.getByText('Mulai dalam 4 langkah')).toBeVisible();

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
    await expect(page.getByText(businessName)).toBeVisible();
  });
});
