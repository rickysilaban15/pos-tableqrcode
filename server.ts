import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { ZodError } from 'zod';
import { authRouter } from './server/modules/auth/routes.ts';
import { productsRouter } from './server/modules/products/routes.ts';
import { customizationsRouter } from './server/modules/products/customizations.ts';
import { categoriesRouter } from './server/modules/categories/routes.ts';
import { publicTablesRouter, tablesRouter } from './server/modules/tables/routes.ts';
import { merchantOrdersRouter, publicOrdersRouter } from './server/modules/orders/routes.ts';
import { expireAbandonedOrders } from './server/modules/orders/service.ts';
import { paymentsRouter } from './server/modules/payments/routes.ts';
import { settingsRouter } from './server/modules/settings/routes.ts';
import { superAdminRouter } from './server/modules/superadmin/routes.ts';
import { subscribeTenantEvents } from './server/modules/events/bus.ts';
import { requireAuth, requireMerchantContext } from './server/middleware/auth.ts';
import { createRateLimiter } from './server/middleware/rateLimit.ts';
import { verifySameOriginMutation } from './server/middleware/security.ts';
import { databaseHealth, pool } from './server/database/client.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const app = express();
  app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '2.5mb' }));
  app.use(verifySameOriginMutation);

  const authRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 250 : 25,
    message: 'Terlalu banyak percobaan login. Coba lagi sebentar.',
  });
  const publicOrderRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 200 : 30,
    message: 'Terlalu banyak pembuatan pesanan. Coba lagi sebentar.',
  });
  const publicReadRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 500 : 120,
    message: 'Terlalu banyak permintaan. Coba lagi sebentar.',
  });

  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/register', authRateLimit);
  app.post('/api/public/qr/:token/orders', publicOrderRateLimit);
  app.use('/api/public', publicReadRateLimit);

  // Operational health check endpoint (no sensitive env or legacy JSON exposure)
  app.get('/api/health', async (_req, res) => {
    const database = await databaseHealth().catch(() => false);
    const ok = database || !process.env.DATABASE_URL;
    res.status(ok ? 200 : 503).json({
      ok,
      status: ok ? 'healthy' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/products', customizationsRouter);
  app.use('/api/v1/categories', categoriesRouter);
  app.use('/api/v1/tables', tablesRouter);
  app.use('/api/public', publicTablesRouter);
  app.use('/api/public', publicOrdersRouter);
  app.use('/api/v1/orders', merchantOrdersRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/super-admin', superAdminRouter);

  app.get('/api/public/plans', async (_req, res, next) => {
    try {
      if (!pool) return res.json([]);
      const rows = (
        await pool.query(
          'SELECT id, code, name, monthly_price "monthlyPrice", trial_days "trialDays" FROM subscription_plans WHERE is_active = true ORDER BY monthly_price ASC',
        )
      ).rows;
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/v1/events', requireAuth, requireMerchantContext, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const unsubscribe = subscribeTenantEvents(req.auth!.merchantId, req.auth!.outletId, res);
    req.on('close', unsubscribe);
  });

  // Legacy JSON runtime endpoints are permanently retired; PostgreSQL (/api/v1 & /api/public) is the sole source of truth.
  app.use('/api/pos', (_req, res) => {
    res.status(410).json({
      error: 'Endpoint legacy /api/pos telah dinonaktifkan. Gunakan /api/v1 dan /api/public.',
    });
  });

  // Never expose stack traces or environment details through API responses.
  const handleApiError =
    (fallback: string) =>
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.issues[0]?.message || 'Data permintaan tidak valid' });
        return;
      }
      const status =
        typeof (error as { status?: unknown })?.status === 'number'
          ? (error as { status: number }).status
          : 500;
      if (status >= 500) {
        console.error('API request failed:', error);
        res.status(500).json({ error: fallback });
        return;
      }
      res.status(status).json({ error: error instanceof Error ? error.message : fallback });
    };

  app.use('/api/auth', handleApiError('Layanan autentikasi belum tersedia. Periksa konfigurasi server.'));
  app.use('/api/v1', handleApiError('Layanan data belum tersedia. Periksa konfigurasi server.'));
  app.use('/api/super-admin', handleApiError('Layanan super admin belum tersedia.'));
  app.use('/api/public', handleApiError('Layanan pemesanan tidak tersedia saat ini.'));

  return app;
}

async function startServer() {
  const app = await createApp();

  const expirationTimer = setInterval(() => {
    void expireAbandonedOrders().catch(() => {});
  }, 60_000);
  expirationTimer.unref?.();

  // Vite middleware in development/test, static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`WarkopOS server listening on http://0.0.0.0:${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start WarkopOS server:', err);
    process.exit(1);
  });
}
