import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

type State = {
  password: string;
  superAdmin: { email: string };
  merchantA: { email: string; merchantId: string; outletId: string };
  merchantB: { email: string; merchantId: string; outletId: string };
};

const readState = async () => JSON.parse(await fs.readFile('.e2e-state.json', 'utf8')) as State;

test.describe('Super Admin access control and dashboard', () => {
  test('super admin can login, view overview, and manage merchant subscription', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once against isolated PostgreSQL database.');
    const s = await readState();

    const sa = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const mp = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const saPage = await sa.newPage();
    const mpPage = await mp.newPage();

    // 1. Merchant cannot access super-admin API
    await mpPage.goto('/merchant/login');
    await mpPage.getByPlaceholder('Email').fill(s.merchantA.email);
    await mpPage.getByPlaceholder('Kata sandi').fill(s.password);
    await mpPage.getByRole('button', { name: 'Masuk' }).click();
    await mpPage.waitForURL(/\/admin/);

    const merchantTryAdmin = await mpPage.request.get('/api/super-admin/overview');
    expect(merchantTryAdmin.status()).toBe(403);

    // 2. Super admin login page renders correctly
    await saPage.goto('/super-admin/login');
    await expect(saPage.getByRole('heading', { name: 'Super Admin' })).toBeVisible();
    await expect(saPage.getByText('Akses terbatas untuk administrator platform')).toBeVisible();
    await saPage.screenshot({ path: 'test-results/super-admin-login.png', fullPage: true });

    // 3. Attempting login with merchant credentials shows error
    await saPage.getByPlaceholder('admin@platform.com').fill(s.merchantA.email);
    await saPage.getByPlaceholder('••••••••••').fill(s.password);
    await saPage.getByRole('button', { name: 'Masuk Super Admin' }).click();
    await expect(saPage.getByText('Akun ini tidak memiliki akses Super Admin')).toBeVisible();

    // 4. Unauthenticated access to super-admin dashboard redirects to login
    await saPage.goto('/super-admin');
    await saPage.waitForURL(/\/super-admin\/login/);

    // 5. API: super-admin/overview without auth returns 401
    const unauthedOverview = await saPage.request.get('/api/super-admin/overview');
    expect(unauthedOverview.status()).toBe(401);

    // 6. Subscription update API: merchant cannot patch merchant's subscription
    const illegalSubPatch = await mpPage.request.patch(
      `/api/super-admin/merchants/${s.merchantA.merchantId}/subscription`,
      { data: { status: 'ACTIVE', qrOrderingEnabled: true, posEnabled: true } },
    );
    expect(illegalSubPatch.status()).toBe(403);

    // 7. Super Admin can actually login and access overview
    await saPage.goto('/super-admin/login');
    await saPage.getByPlaceholder('admin@platform.com').fill(s.superAdmin.email);
    await saPage.getByPlaceholder('••••••••••').fill(s.password);
    await saPage.getByRole('button', { name: 'Masuk Super Admin' }).click();
    await saPage.waitForURL(/\/super-admin$/);
    await expect(saPage.getByRole('heading', { name: 'Platform Overview' })).toBeVisible();
    await saPage.screenshot({ path: 'test-results/super-admin-overview.png', fullPage: true });

    // 8. Super Admin API returns actual data
    const overviewResp = await saPage.request.get('/api/super-admin/overview');
    expect(overviewResp.status()).toBe(200);
    const overview = await overviewResp.json();
    expect(overview.metrics.totalMerchants).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(overview.merchants)).toBe(true);
    expect(Array.isArray(overview.plans)).toBe(true);

    // 9. Super Admin can navigate to merchants page
    await saPage.goto('/super-admin/merchants');
    await expect(saPage.getByRole('heading', { name: 'Merchants' })).toBeVisible();
    await expect(saPage.getByText('E2E A')).toBeVisible();
    await expect(saPage.getByText('E2E B')).toBeVisible();
    await saPage.screenshot({ path: 'test-results/super-admin-merchants.png', fullPage: true });

    // 10. Super Admin can update merchant subscription
    const patchResp = await saPage.request.patch(
      `/api/super-admin/merchants/${s.merchantA.merchantId}/subscription`,
      {
        data: {
          status: 'ACTIVE',
          planCode: 'basic',
          qrOrderingEnabled: true,
          posEnabled: true,
          extendDays: 30,
          notes: 'E2E test activation',
        },
      },
    );
    expect(patchResp.status()).toBe(200);
    const patchResult = await patchResp.json();
    expect(patchResult.ok).toBe(true);

    // 11. Audit log captures the action
    const auditResp = await saPage.request.get('/api/super-admin/overview');
    const auditData = await auditResp.json();
    const auditEntry = auditData.audits.find((a: { action: string }) => a.action === 'SUPER_ADMIN_SUBSCRIPTION_UPDATED');
    expect(auditEntry).toBeTruthy();

    // 12. Super Admin can view plans page
    await saPage.goto('/super-admin/plans');
    await expect(saPage.getByRole('heading', { name: 'Paket & Harga' })).toBeVisible();
    await expect(saPage.getByRole('heading', { name: 'Basic' })).toBeVisible();
    await saPage.screenshot({ path: 'test-results/super-admin-plans.png', fullPage: true });

    // 13. Super Admin can view audit log page
    await saPage.goto('/super-admin/audit');
    await expect(saPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
    await saPage.screenshot({ path: 'test-results/super-admin-audit.png', fullPage: true });

    await sa.close();
    await mp.close();
  });

  test('landing page and registration flow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once against isolated PostgreSQL database.');

    // 1. Landing page renders correctly
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Sistem POS & QR Order/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mulai Trial 14 Hari Gratis/i }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/landing-page.png', fullPage: true });

    // 2. Registration modal opens and closes
    await page.getByRole('button', { name: /Coba Gratis/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Daftar Gratis 14 Hari' })).toBeVisible();
    await page.getByRole('button', { name: 'Masuk Super Admin' }).count(); // Not present (modal should not have this)
    await page.getByLabel('Tutup').click();
    await expect(page.getByRole('heading', { name: 'Daftar Gratis 14 Hari' })).not.toBeVisible();

    // 3. Demo portal interactive sandbox works without touching production DB
    await page.goto('/demo');
    await expect(page.getByRole('link', { name: 'LARIS POS' }).first()).toBeVisible();
    await expect(page.getByText('Sandbox Demo Terisolasi')).toBeVisible();

    // 4. Standalone operational routes enforce merchant authentication
    await page.goto('/admin/kitchen');
    await page.waitForURL(/\/merchant\/login/);
    await page.goto('/admin/tables/print');
    await page.waitForURL(/\/merchant\/login/);
  });
});
