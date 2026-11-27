import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().optional(),
  ENABLE_DEMO_RESET: z.enum(['true', 'false']).default('false'),
  MIDTRANS_ENABLED: z.enum(['true', 'false']).default('false'),
  MIDTRANS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  MIDTRANS_SERVER_KEY: z.string().trim().optional(),
  MIDTRANS_SIGNATURE_KEY: z.string().trim().optional(),
  MIDTRANS_SANDBOX_MERCHANT_ID: z.string().trim().optional(),
  MIDTRANS_API_BASE_URL: z.string().url().optional(),
  PAYMENT_WEBHOOK_BASE_URL: z.string().trim().optional(),
});

export const env = schema.parse(process.env);
export const hasDatabase = Boolean(env.DATABASE_URL);

export function requireAuthConfig(): { databaseUrl: string; jwtSecret: string } {
  if (!env.DATABASE_URL || !env.JWT_SECRET) {
    throw new Error('DATABASE_URL dan JWT_SECRET wajib diatur untuk authentication.');
  }
  return { databaseUrl: env.DATABASE_URL, jwtSecret: env.JWT_SECRET };
}

export type MidtransReadiness = {
  enabledFlag: boolean;
  environment: 'sandbox' | 'production';
  sandboxOnlyEnforced: boolean;
  productionBlockedReason: string | null;
  hasServerKey: boolean;
  designatedMerchantRef: string | null;
  webhookBaseUrl: string | null;
  webhookHttpsValid: boolean;
  ready: boolean;
  warnings: string[];
};

/**
 * Evaluates current process.env dynamically (so isolated tests can test config permutations)
 * without ever returning or logging secret key values.
 */
export function getMidtransReadiness(rawEnv: NodeJS.ProcessEnv = process.env): MidtransReadiness {
  const enabledFlag = rawEnv.MIDTRANS_ENABLED === 'true';
  const rawEnvironment = rawEnv.MIDTRANS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const serverKey = (rawEnv.MIDTRANS_SERVER_KEY ?? '').trim();
  const designatedMerchantRef = (rawEnv.MIDTRANS_SANDBOX_MERCHANT_ID ?? '').trim() || null;
  const webhookRaw = (rawEnv.PAYMENT_WEBHOOK_BASE_URL ?? '').trim();

  const warnings: string[] = [];
  let productionBlockedReason: string | null = null;

  if (rawEnvironment === 'production') {
    productionBlockedReason =
      'Mode produksi Midtrans dinonaktifkan untuk keselamatan transaksi. Gunakan MIDTRANS_ENVIRONMENT=sandbox.';
    warnings.push(productionBlockedReason);
  } else if (serverKey.startsWith('Mid-server-')) {
    productionBlockedReason =
      'Server Key produksi terdeteksi (Mid-server-...). Fase ini hanya mengizinkan Server Key Sandbox (SB-Mid-server-...).';
    warnings.push(productionBlockedReason);
  }

  const hasServerKey = serverKey.length >= 12 && !serverKey.includes('replace-with');
  if (enabledFlag && !hasServerKey) {
    warnings.push('MIDTRANS_SERVER_KEY belum diatur atau masih berupa placeholder.');
  }
  if (enabledFlag && !designatedMerchantRef) {
    warnings.push(
      'MIDTRANS_SANDBOX_MERCHANT_ID belum diatur (isi dengan UUID atau slug merchant uji sandbox yang ditunjuk).',
    );
  }

  let webhookHttpsValid = false;
  let webhookBaseUrl: string | null = null;
  if (webhookRaw) {
    try {
      const parsed = new URL(webhookRaw);
      if (parsed.protocol === 'https:') {
        webhookHttpsValid = true;
        webhookBaseUrl = webhookRaw.replace(/\/+$/, '');
      } else {
        warnings.push('PAYMENT_WEBHOOK_BASE_URL harus menggunakan protokol HTTPS agar diizinkan untuk webhook eksternal.');
      }
    } catch {
      warnings.push('PAYMENT_WEBHOOK_BASE_URL bukan URL yang valid.');
    }
  }

  const ready =
    enabledFlag &&
    rawEnvironment === 'sandbox' &&
    !productionBlockedReason &&
    hasServerKey &&
    Boolean(designatedMerchantRef);

  return {
    enabledFlag,
    environment: rawEnvironment,
    sandboxOnlyEnforced: true,
    productionBlockedReason,
    hasServerKey,
    designatedMerchantRef,
    webhookBaseUrl,
    webhookHttpsValid,
    ready,
    warnings,
  };
}
