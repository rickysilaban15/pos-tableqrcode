import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.e2e' });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_e2e')) throw new Error('Buat .env.e2e dengan TEST_DATABASE_URL berakhiran _e2e terlebih dahulu.');
export default defineConfig({
  testDir: './tests/e2e', globalSetup: './tests/e2e/global-setup.ts', timeout: 30_000, workers: 1, fullyParallel: false, forbidOnly: Boolean(process.env.CI), retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]], outputDir: 'test-results/artifacts',
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'customer-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true } }, { name: 'merchant-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } }, { name: 'merchant-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3101',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: process.env.JWT_SECRET || 'e2e-only-secret-with-at-least-thirty-two-characters',
      MIDTRANS_ENABLED: 'true',
      MIDTRANS_ENVIRONMENT: 'sandbox',
      MIDTRANS_SERVER_KEY: 'SB-Mid-server-e2e-mock-sandbox-key-998877',
      MIDTRANS_SANDBOX_MERCHANT_ID: 'laris-coffee-sandbox',
      MIDTRANS_API_BASE_URL: 'http://127.0.0.1:3102',
    },
  },
});
