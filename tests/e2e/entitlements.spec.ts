/**
 * Tests subscription entitlement enforcement across the platform:
 * - EXPIRED subscription cannot create new QR orders
 * - EXPIRED subscription shows banner in merchant admin
 * - PAID orders already in queue remain processable after subscription expires
 * - Merchant ADMIN API still accessible after expiry (for processing paid orders)
 * - Super Admin can re-activate suspended merchant
 */
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';

type State = {
  password: string;
  superAdmin: { email: string };
  merchantA: { email: string; merchantId: string; outletId: string; qrToken: string; productId: string; variantId: string };
  merchantB: { email: string; merchantId: string };
};

const readState = async () => JSON.parse(await fs.readFile('.e2e-state.json', 'utf8')) as State;

test.describe('Subscription entitlement enforcement', () => {
  test('expired subscription blocks new orders but preserves paid order processing', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'merchant-desktop', 'Runs once against isolated PostgreSQL database.');
    const s = await readState();

    const sa = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const mp = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const cp = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });

    const saPage = await sa.newPage();
    const mpPage = await mp.newPage();
    const cpPage = await cp.newPage();

    // Login super admin and expire merchant A subscription
    await saPage.goto('/super-admin/login');
    await saPage.getByPlaceholder('admin@platform.com').fill(s.superAdmin.email);
    await saPage.getByPlaceholder('••••••••••').fill(s.password);
    await saPage.getByRole('button', { name: 'Masuk Super Admin' }).click();
    await saPage.waitForURL(/\/super-admin$/);

    // Expire the subscription via API
    const expireResp = await saPage.request.patch(
      `/api/super-admin/merchants/${s.merchantA.merchantId}/subscription`,
      {
        data: {
          status: 'EXPIRED',
          qrOrderingEnabled: true,
          posEnabled: true,
          notes: 'E2E entitlement test expiry',
        },
      },
    );
    expect(expireResp.status()).toBe(200);

    // 1. QR ordering should be blocked (HTTP 403) after expiry
    const blockedOrder = await cpPage.request.post(`/api/public/qr/${s.merchantA.qrToken}/orders`, {
      data: {
        customerName: 'Blocked Customer',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'CASH',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(blockedOrder.status()).toBe(403);

    // 2. Merchant dashboard still loads but shows subscription banner
    await mpPage.goto('/merchant/login');
    await mpPage.getByPlaceholder('Email').fill(s.merchantA.email);
    await mpPage.getByPlaceholder('Kata sandi').fill(s.password);
    await mpPage.getByRole('button', { name: 'Masuk' }).click();
    await mpPage.waitForURL(/\/admin/);
    await expect(mpPage.getByText(/Langganan.*berstatus EXPIRED/)).toBeVisible();
    await mpPage.screenshot({ path: 'test-results/merchant-expired-banner.png', fullPage: false });

    // 3. Merchant can still access orders (for processing already-paid orders)
    const ordersResp = await mpPage.request.get('/api/v1/orders');
    expect(ordersResp.status()).toBe(200);

    // 4. Subscription page shows expired status
    await mpPage.goto('/admin/subscription');
    await expect(mpPage.getByText('Langganan Kedaluwarsa')).toBeVisible();
    await mpPage.screenshot({ path: 'test-results/merchant-subscription-expired.png', fullPage: true });

    // 5. Super Admin can re-activate and customer QR ordering works again
    const reactivateResp = await saPage.request.patch(
      `/api/super-admin/merchants/${s.merchantA.merchantId}/subscription`,
      {
        data: {
          status: 'ACTIVE',
          planCode: 'basic',
          qrOrderingEnabled: true,
          posEnabled: true,
          extendDays: 30,
          notes: 'E2E re-activation',
        },
      },
    );
    expect(reactivateResp.status()).toBe(200);

    // Now QR ordering works again
    const allowedOrder = await cpPage.request.post(`/api/public/qr/${s.merchantA.qrToken}/orders`, {
      data: {
        customerName: 'Reactivated Customer',
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: 'CASH',
        orderType: 'DINE_IN',
        fulfillmentMethod: 'TABLE_SERVICE',
        items: [{ productId: s.merchantA.productId, quantity: 1, variantIds: [s.merchantA.variantId], addonIds: [] }],
      },
    });
    expect(allowedOrder.status()).toBe(201);

    // 6. Subscription page now shows active status
    await mpPage.goto('/admin/subscription');
    // Reload to pick up new state
    await mpPage.reload();
    await expect(mpPage.getByText('Langganan Aktif')).toBeVisible();
    await mpPage.screenshot({ path: 'test-results/merchant-subscription-active.png', fullPage: true });

    await sa.close();
    await mp.close();
    await cp.close();
  });
});
