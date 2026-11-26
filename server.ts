import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
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
import { requireAuth } from './server/middleware/auth.ts';
import { createRateLimiter } from './server/middleware/rateLimit.ts';
import { databaseHealth, pool } from './server/database/client.ts';
import { createSeedData } from './src/data/seedData.ts';
import type {
  ActivityLog,
  CafeSettings,
  CafeTable,
  Category,
  FulfillmentMethod,
  Order,
  OrderItemSnapshot,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PosDataState,
  Product,
} from './src/types/pos.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE = path.resolve(DATA_DIR, 'pos-state.json');

const ALLOWED_ORDER_TYPES: ReadonlySet<OrderType> = new Set(['DINE_IN', 'TAKEAWAY']);
const ALLOWED_FULFILLMENT: ReadonlySet<FulfillmentMethod> = new Set([
  'TABLE_SERVICE',
  'PICKUP_COUNTER',
]);
const ALLOWED_PAYMENT_METHODS: ReadonlySet<PaymentMethod> = new Set([
  'QRIS',
  'E_WALLET',
  'BANK_TRANSFER',
  'CASHIER',
]);
const ALLOWED_ORDER_STATUS: ReadonlySet<OrderStatus> = new Set([
  'ORDER_BARU',
  'MEMASAK',
  'DISAJIKAN',
]);

function generateTableToken(tableName: string): string {
  const cleanName = tableName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'TBL';
  // Cryptographically secure entropy prevents practical QR-token guessing.
  return `LRS-${cleanName}-${randomBytes(12).toString('base64url')}`;
}

function generateOrderId(sequence: number): string {
  const year = new Date().getFullYear();
  return `ORD-${year}-${String(sequence).padStart(4, '0')}`;
}

function sanitizeString(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function sanitizeSafeUrl(value: unknown, maxLen = 2_000_000): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().slice(0, maxLen);
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('/') ||
    lower.startsWith('data:image/')
  ) {
    return trimmed;
  }
  return '';
}

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) return '';
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

function isPrivateOrLocalUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('ais-dev-')
    );
  } catch {
    return true;
  }
}

function extractSafeRequestOrigin(req: express.Request): string | null {
  const rawHost = (
    req.headers['x-forwarded-host']?.toString().split(',')[0] ||
    req.headers.host ||
    ''
  ).trim();
  if (!rawHost || rawHost.length > 200 || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(rawHost)) {
    return null;
  }
  const rawProto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim().toLowerCase();
  const isLocalHost =
    rawHost.startsWith('localhost') ||
    rawHost.startsWith('127.0.0.1') ||
    rawHost.startsWith('0.0.0.0');
  const proto =
    rawProto === 'http' || rawProto === 'https'
      ? rawProto
      : isLocalHost
        ? req.protocol === 'https'
          ? 'https'
          : 'http'
        : 'https';
  return `${proto}://${rawHost}`;
}

function getPublicEnvBaseUrl(): string {
  const candidates = [process.env.SHARED_APP_URL, process.env.APP_URL];
  for (const raw of candidates) {
    if (!raw) continue;
    const normalized = normalizeBaseUrl(raw);
    if (normalized && !isPrivateOrLocalUrl(normalized)) {
      return normalized;
    }
  }
  return '';
}

function appendActivity(
  activities: ActivityLog[],
  message: string,
  orderId?: string,
): ActivityLog[] {
  const entry: ActivityLog = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toISOString(),
    message,
    orderId,
  };
  return [entry, ...activities].slice(0, 40);
}

function ensureInitialQrBaseUrl(seed: PosDataState): PosDataState {
  const publicEnvUrl = getPublicEnvBaseUrl();
  return {
    ...seed,
    cafeSettings: {
      ...seed.cafeSettings,
      qrBaseUrl: publicEnvUrl,
    },
  };
}

function loadStateFromDisk(): PosDataState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PosDataState;
      if (
        parsed &&
        parsed.cafeSettings &&
        Array.isArray(parsed.tables) &&
        Array.isArray(parsed.products) &&
        Array.isArray(parsed.orders)
      ) {
        if (isPrivateOrLocalUrl(parsed.cafeSettings.qrBaseUrl || '')) {
          const cleaned: PosDataState = {
            ...parsed,
            cafeSettings: {
              ...parsed.cafeSettings,
              qrBaseUrl: getPublicEnvBaseUrl(),
            },
          };
          saveStateToDisk(cleaned);
          return cleaned;
        }
        return parsed;
      }
    }
  } catch {
    // Fallback to clean seed if file is missing or unreadable
  }
  const initial = ensureInitialQrBaseUrl(createSeedData());
  saveStateToDisk(initial);
  return initial;
}

function saveStateToDisk(nextState: PosDataState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(nextState, null, 2), 'utf-8');
    fs.renameSync(tempFile, STATE_FILE);
  } catch (err) {
    console.error('Failed to persist POS state:', err);
  }
}

let posState: PosDataState = loadStateFromDisk();

// Real-time SSE subscribers
const sseClients = new Set<express.Response>();

function broadcastUpdate(reason: string, orderId?: string): void {
  const payload = JSON.stringify({
    type: 'state:updated',
    reason,
    orderId: orderId ?? null,
    updatedAt: Date.now(),
  });
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function updateAndBroadcast(nextState: PosDataState, reason: string, orderId?: string): void {
  posState = nextState;
  saveStateToDisk(posState);
  broadcastUpdate(reason, orderId);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  const authRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 200 : 25,
    message: 'Terlalu banyak percobaan login. Coba lagi sebentar.',
  });
  const publicOrderRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 120 : 30,
    message: 'Terlalu banyak pembuatan pesanan. Coba lagi sebentar.',
  });
  const publicReadRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 400 : 120,
    message: 'Terlalu banyak permintaan. Coba lagi sebentar.',
  });

  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/register', authRateLimit);
  app.post('/api/public/qr/:token/orders', publicOrderRateLimit);
  app.use('/api/public', publicReadRateLimit);

  const expirationTimer = setInterval(() => {
    void expireAbandonedOrders().catch(() => {});
  }, 60_000);
  expirationTimer.unref?.();

  // Health endpoint
  app.get('/api/health', async (_req, res) => {
    const database = await databaseHealth().catch(() => false);
    res.status(database || !process.env.DATABASE_URL ? 200 : 503).json({ ok: database || !process.env.DATABASE_URL, database, ordersCount: posState.orders.length });
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
  app.get('/api/v1/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const unsubscribe = subscribeTenantEvents(req.auth!.merchantId, req.auth!.outletId, res);
    req.on('close', unsubscribe);
  });
  // Never expose stack traces or environment details through API responses.
  const handleApiError = (fallback: string) => (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues[0]?.message || 'Data permintaan tidak valid' });
      return;
    }
    const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 500;
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

  // Legacy JSON runtime endpoints are permanently disabled; PostgreSQL (/api/v1 & /api/public) is the sole source of truth.
  app.use('/api/pos', (_req, res) => {
    res.status(410).json({ error: 'Endpoint legacy /api/pos telah dinonaktifkan. Gunakan /api/v1 dan /api/public.' });
  });

  // Get full authoritative POS state
  app.get('/api/pos/state', (req, res) => {
    const requestOrigin = extractSafeRequestOrigin(req);

    // Auto-upgrade empty/local/private-preview QR URL to the live public origin
    if (
      requestOrigin &&
      !isPrivateOrLocalUrl(requestOrigin) &&
      isPrivateOrLocalUrl(posState.cafeSettings.qrBaseUrl)
    ) {
      posState = {
        ...posState,
        cafeSettings: {
          ...posState.cafeSettings,
          qrBaseUrl: requestOrigin,
        },
      };
      saveStateToDisk(posState);
    }

    const effectiveQrBaseUrl =
      posState.cafeSettings.qrBaseUrl || requestOrigin || 'http://localhost:3000';

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...posState,
      cafeSettings: {
        ...posState.cafeSettings,
        qrBaseUrl: effectiveQrBaseUrl,
      },
    });
  });

  // Real-time Server-Sent Events stream for cross-device live updates
  app.get('/api/pos/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', updatedAt: Date.now() })}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Update Cafe Settings
  app.patch('/api/pos/settings', (req, res) => {
    const body = req.body as Partial<CafeSettings> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Data pengaturan tidak valid' });
      return;
    }

    const prev = posState.cafeSettings;
    const nextSettings: CafeSettings = {
      ...prev,
      name: body.name !== undefined ? sanitizeString(body.name, 80) || prev.name : prev.name,
      slug:
        body.slug !== undefined
          ? sanitizeString(body.slug, 60)
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-')
              .replace(/^-|-$/g, '') || prev.slug
          : prev.slug,
      logoUrl: body.logoUrl !== undefined ? sanitizeSafeUrl(body.logoUrl) : prev.logoUrl,
      description:
        body.description !== undefined ? sanitizeString(body.description, 300) : prev.description,
      address: body.address !== undefined ? sanitizeString(body.address, 200) : prev.address,
      whatsapp: body.whatsapp !== undefined ? sanitizeString(body.whatsapp, 40) : prev.whatsapp,
      operatingHours:
        body.operatingHours !== undefined
          ? sanitizeString(body.operatingHours, 60)
          : prev.operatingHours,
      isOpen: typeof body.isOpen === 'boolean' ? body.isOpen : prev.isOpen,
      qrBaseUrl:
        body.qrBaseUrl !== undefined
          ? normalizeBaseUrl(sanitizeString(body.qrBaseUrl, 250)) || prev.qrBaseUrl
          : prev.qrBaseUrl,
      enableDineIn:
        typeof body.enableDineIn === 'boolean' ? body.enableDineIn : prev.enableDineIn,
      enableTakeaway:
        typeof body.enableTakeaway === 'boolean' ? body.enableTakeaway : prev.enableTakeaway,
      enableTableService:
        typeof body.enableTableService === 'boolean'
          ? body.enableTableService
          : prev.enableTableService,
      enablePickupCounter:
        typeof body.enablePickupCounter === 'boolean'
          ? body.enablePickupCounter
          : prev.enablePickupCounter,
    };

    if (!nextSettings.enableDineIn && !nextSettings.enableTakeaway) {
      res.status(400).json({ error: 'Minimal satu jenis pesanan harus aktif' });
      return;
    }
    if (!nextSettings.enableTableService && !nextSettings.enablePickupCounter) {
      res.status(400).json({ error: 'Minimal satu metode penyerahan harus aktif' });
      return;
    }

    updateAndBroadcast(
      {
        ...posState,
        cafeSettings: nextSettings,
        activities: appendActivity(posState.activities, 'Pengaturan cafe diperbarui'),
      },
      'settings:updated',
    );
    res.json(posState.cafeSettings);
  });

  // Categories CRUD
  app.post('/api/pos/categories', (req, res) => {
    const name = sanitizeString(req.body?.name, 60);
    if (!name) {
      res.status(400).json({ error: 'Nama kategori wajib diisi' });
      return;
    }
    const nextOrder = posState.categories.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name,
      sortOrder: nextOrder,
      isActive: true,
    };
    updateAndBroadcast(
      {
        ...posState,
        categories: [...posState.categories, newCat],
        activities: appendActivity(posState.activities, `Kategori baru "${name}" ditambahkan`),
      },
      'category:created',
    );
    res.status(201).json(newCat);
  });

  app.patch('/api/pos/categories/:id', (req, res) => {
    const { id } = req.params;
    const existing = posState.categories.find((c) => c.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Kategori tidak ditemukan' });
      return;
    }
    const updated: Category = {
      ...existing,
      name:
        req.body?.name !== undefined
          ? sanitizeString(req.body.name, 60) || existing.name
          : existing.name,
      isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : existing.isActive,
      sortOrder:
        typeof req.body?.sortOrder === 'number' && Number.isFinite(req.body.sortOrder)
          ? Math.max(1, Math.round(req.body.sortOrder))
          : existing.sortOrder,
    };
    updateAndBroadcast(
      {
        ...posState,
        categories: posState.categories.map((c) => (c.id === id ? updated : c)),
      },
      'category:updated',
    );
    res.json(updated);
  });

  app.delete('/api/pos/categories/:id', (req, res) => {
    const { id } = req.params;
    const existing = posState.categories.find((c) => c.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Kategori tidak ditemukan' });
      return;
    }
    updateAndBroadcast(
      {
        ...posState,
        categories: posState.categories.filter((c) => c.id !== id),
        activities: appendActivity(posState.activities, `Kategori "${existing.name}" dihapus`),
      },
      'category:deleted',
    );
    res.json({ ok: true });
  });

  // Products CRUD
  app.post('/api/pos/products', (req, res) => {
    const body = req.body as Partial<Product>;
    const name = sanitizeString(body?.name, 100);
    if (!name) {
      res.status(400).json({ error: 'Nama produk wajib diisi' });
      return;
    }
    const newProd: Product = {
      id: `prod-${Date.now()}`,
      categoryId: sanitizeString(body?.categoryId, 60) || posState.categories[0]?.id || 'cat-coffee',
      name,
      description: sanitizeString(body?.description, 300),
      price: Math.max(0, Math.round(Number(body?.price) || 0)),
      image: sanitizeSafeUrl(body?.image),
      isActive: typeof body?.isActive === 'boolean' ? body.isActive : true,
      variantGroups: Array.isArray(body?.variantGroups) ? body.variantGroups : [],
      toppings: Array.isArray(body?.toppings) ? body.toppings : [],
    };
    updateAndBroadcast(
      {
        ...posState,
        products: [...posState.products, newProd],
        activities: appendActivity(posState.activities, `Produk "${newProd.name}" ditambahkan ke menu`),
      },
      'product:created',
    );
    res.status(201).json(newProd);
  });

  app.patch('/api/pos/products/:id', (req, res) => {
    const { id } = req.params;
    const existing = posState.products.find((p) => p.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Produk tidak ditemukan' });
      return;
    }
    const body = req.body as Partial<Product>;
    const updated: Product = {
      ...existing,
      categoryId:
        body.categoryId !== undefined
          ? sanitizeString(body.categoryId, 60) || existing.categoryId
          : existing.categoryId,
      name:
        body.name !== undefined ? sanitizeString(body.name, 100) || existing.name : existing.name,
      description:
        body.description !== undefined
          ? sanitizeString(body.description, 300)
          : existing.description,
      price:
        body.price !== undefined
          ? Math.max(0, Math.round(Number(body.price) || 0))
          : existing.price,
      image: body.image !== undefined ? sanitizeSafeUrl(body.image) : existing.image,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : existing.isActive,
      variantGroups: Array.isArray(body.variantGroups)
        ? body.variantGroups
        : existing.variantGroups,
      toppings: Array.isArray(body.toppings) ? body.toppings : existing.toppings,
    };
    updateAndBroadcast(
      {
        ...posState,
        products: posState.products.map((p) => (p.id === id ? updated : p)),
      },
      'product:updated',
    );
    res.json(updated);
  });

  app.delete('/api/pos/products/:id', (req, res) => {
    const { id } = req.params;
    const existing = posState.products.find((p) => p.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Produk tidak ditemukan' });
      return;
    }
    updateAndBroadcast(
      {
        ...posState,
        products: posState.products.filter((p) => p.id !== id),
        activities: appendActivity(posState.activities, `Produk "${existing.name}" dihapus dari menu`),
      },
      'product:deleted',
    );
    res.json({ ok: true });
  });

  // Tables CRUD
  app.post('/api/pos/tables', (req, res) => {
    const cleanName = sanitizeString(req.body?.name, 24).toUpperCase();
    const area = sanitizeString(req.body?.area, 60) || 'Indoor Main';
    if (!cleanName) {
      res.status(400).json({ error: 'Nama meja wajib diisi' });
      return;
    }
    if (posState.tables.some((t) => t.name.toUpperCase() === cleanName)) {
      res.status(409).json({ error: `Meja ${cleanName} sudah terdaftar` });
      return;
    }
    const nowIso = new Date().toISOString();
    const newTable: CafeTable = {
      id: `tbl-${Date.now()}`,
      name: cleanName,
      area,
      token: generateTableToken(cleanName),
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    updateAndBroadcast(
      {
        ...posState,
        tables: [...posState.tables, newTable],
        activities: appendActivity(posState.activities, `Meja ${cleanName} dibuat dengan token QR baru`),
      },
      'table:created',
    );
    res.status(201).json(newTable);
  });

  app.patch('/api/pos/tables/:id', (req, res) => {
    const { id } = req.params;
    const existing = posState.tables.find((t) => t.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Meja tidak ditemukan' });
      return;
    }
    const nextName =
      req.body?.name !== undefined
        ? sanitizeString(req.body.name, 24).toUpperCase() || existing.name
        : existing.name;

    if (
      nextName !== existing.name &&
      posState.tables.some((t) => t.id !== id && t.name.toUpperCase() === nextName)
    ) {
      res.status(409).json({ error: `Nama meja ${nextName} sudah digunakan` });
      return;
    }

    const updated: CafeTable = {
      ...existing,
      name: nextName,
      area:
        req.body?.area !== undefined
          ? sanitizeString(req.body.area, 60) || existing.area
          : existing.area,
      isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    updateAndBroadcast(
      {
        ...posState,
        tables: posState.tables.map((t) => (t.id === id ? updated : t)),
      },
      'table:updated',
    );
    res.json(updated);
  });

  app.post('/api/pos/tables/:id/regenerate', (req, res) => {
    const { id } = req.params;
    const existing = posState.tables.find((t) => t.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Meja tidak ditemukan' });
      return;
    }
    const updated: CafeTable = {
      ...existing,
      token: generateTableToken(existing.name),
      updatedAt: new Date().toISOString(),
    };
    updateAndBroadcast(
      {
        ...posState,
        tables: posState.tables.map((t) => (t.id === id ? updated : t)),
        activities: appendActivity(
          posState.activities,
          `QR Code Meja ${updated.name} di-generate ulang`,
        ),
      },
      'table:regenerated',
    );
    res.json(updated);
  });

  app.delete('/api/pos/tables/:id', (req, res) => {
    const { id } = req.params;
    const existing = posState.tables.find((t) => t.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Meja tidak ditemukan' });
      return;
    }
    updateAndBroadcast(
      {
        ...posState,
        tables: posState.tables.filter((t) => t.id !== id),
        activities: appendActivity(posState.activities, `Meja ${existing.name} dihapus`),
      },
      'table:deleted',
    );
    res.json({ ok: true });
  });

  // Create Order (Customer HP -> Server -> Live Broadcast to Admin Laptop!)
  app.post('/api/pos/orders', (req, res) => {
    const body = req.body;
    const customerName = sanitizeString(body?.customerName, 80);
    const orderType = body?.orderType as OrderType;
    const fulfillmentMethod = body?.fulfillmentMethod as FulfillmentMethod;
    const paymentMethod = body?.paymentMethod as PaymentMethod;
    const rawItems = Array.isArray(body?.items) ? (body.items as OrderItemSnapshot[]) : [];

    if (!customerName) {
      res.status(400).json({ error: 'Nama customer wajib diisi' });
      return;
    }
    if (!ALLOWED_ORDER_TYPES.has(orderType)) {
      res.status(400).json({ error: 'Jenis pesanan tidak valid' });
      return;
    }
    if (!ALLOWED_FULFILLMENT.has(fulfillmentMethod)) {
      res.status(400).json({ error: 'Metode penyerahan tidak valid' });
      return;
    }
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      res.status(400).json({ error: 'Metode pembayaran tidak valid' });
      return;
    }
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'Pesanan harus memiliki minimal 1 produk' });
      return;
    }

    // Prices, variants, and toppings are derived from the server-side catalog.
    // Client-supplied price fields are intentionally ignored.
    const cleanItems: OrderItemSnapshot[] = [];
    for (const it of rawItems.slice(0, 50)) {
      const productId = sanitizeString(it.productId, 60);
      const product = posState.products.find((candidate) => candidate.id === productId && candidate.isActive);
      if (!product) {
        res.status(400).json({ error: 'Satu atau lebih produk tidak tersedia' });
        return;
      }
      const qty = Math.max(1, Math.min(99, Math.round(Number(it.quantity) || 1)));
      const selectedVariantIds = new Map<string, string>();
      for (const variant of Array.isArray(it.selectedVariants) ? it.selectedVariants : []) {
        selectedVariantIds.set(sanitizeString(variant.groupId, 60), sanitizeString(variant.optionId, 60));
      }
      const selectedVariants = [] as OrderItemSnapshot['selectedVariants'];
      for (const group of product.variantGroups) {
        const selectedId = selectedVariantIds.get(group.id);
        if (group.required && !selectedId) {
          res.status(400).json({ error: `Pilihan ${group.name} wajib diisi untuk ${product.name}` });
          return;
        }
        if (selectedId) {
          const option = group.options.find((candidate) => candidate.id === selectedId);
          if (!option) {
            res.status(400).json({ error: `Pilihan produk tidak valid untuk ${product.name}` });
            return;
          }
          selectedVariants.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionLabel: option.label, priceDelta: option.priceDelta });
        }
      }
      const requestedToppingIds = new Set(
        (Array.isArray(it.selectedToppings) ? it.selectedToppings : []).map((t) => sanitizeString(t.id, 60)),
      );
      const selectedToppings = product.toppings
        .filter((topping) => requestedToppingIds.has(topping.id))
        .map((topping) => ({ id: topping.id, name: topping.name, price: topping.price }));
      const unitPrice =
        product.price +
        selectedVariants.reduce((s, v) => s + v.priceDelta, 0) +
        selectedToppings.reduce((s, t) => s + t.price, 0);

      cleanItems.push({
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        basePrice: product.price,
        selectedVariants,
        selectedToppings,
        quantity: qty,
        notes: sanitizeString(it.notes, 200),
        unitPrice,
        subtotal: unitPrice * qty,
      });
    }

    const requestedTableId = sanitizeString(body?.tableId, 60);
    const requestedTableToken = sanitizeString(body?.tableToken, 120);
    const table = orderType === 'DINE_IN'
      ? posState.tables.find((candidate) => candidate.id === requestedTableId && candidate.isActive)
      : undefined;
    if (orderType === 'DINE_IN' && (!table || !requestedTableToken || table.token !== requestedTableToken)) {
      res.status(400).json({ error: 'QR meja tidak valid atau sudah diperbarui' });
      return;
    }

    const totalAmount = cleanItems.reduce((sum, it) => sum + it.subtotal, 0);
    const nextSeq = (posState.lastOrderSequence || 0) + 1;
    const orderId = generateOrderId(nextSeq);
    const nowIso = new Date().toISOString();

    const newOrder: Order = {
      id: orderId,
      createdAt: nowIso,
      updatedAt: nowIso,
      customerName,
      customerWhatsapp: sanitizeString(body?.customerWhatsapp, 30) || undefined,
      orderNote: sanitizeString(body?.orderNote, 240) || undefined,
      orderType,
      fulfillmentMethod: orderType === 'TAKEAWAY' ? 'PICKUP_COUNTER' : fulfillmentMethod,
      tableId: table?.id,
      tableName: table?.name,
      items: cleanItems,
      totalAmount,
      paymentMethod,
      paymentSubMethod: sanitizeString(body?.paymentSubMethod, 60) || undefined,
      // A payment provider or an authenticated cashier is the only authority
      // allowed to transition this value to LUNAS.
      paymentStatus: 'BELUM_DIBAYAR',
      orderStatus: 'ORDER_BARU',
      cashierStatus: 'AKTIF',
    };

    const contextText =
      newOrder.orderType === 'DINE_IN' && newOrder.tableName
        ? `Meja ${newOrder.tableName}`
        : 'Takeaway';

    updateAndBroadcast(
      {
        ...posState,
        orders: [newOrder, ...posState.orders],
        lastOrderSequence: nextSeq,
        activities: appendActivity(
          posState.activities,
          `Pesanan baru ${orderId} masuk dari ${contextText} (${newOrder.customerName})`,
          orderId,
        ),
      },
      'order:created',
      orderId,
    );

    res.status(201).json(newOrder);
  });

  // Update Order Status (Admin -> Live Broadcast to Customer HP Tracking!)
  app.patch('/api/pos/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const nextStatus = req.body?.orderStatus as OrderStatus;
    if (!ALLOWED_ORDER_STATUS.has(nextStatus)) {
      res.status(400).json({ error: 'Status pesanan tidak valid' });
      return;
    }

    const existing = posState.orders.find((o) => o.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated: Order = {
      ...existing,
      orderStatus: nextStatus,
      cashierStatus: nextStatus === 'DISAJIKAN' ? 'SELESAI' : existing.cashierStatus,
      updatedAt: nowIso,
    };

    const statusLabel =
      nextStatus === 'MEMASAK'
        ? 'mulai dimasak'
        : nextStatus === 'DISAJIKAN'
          ? 'telah disajikan — Transaksi Kasir Selesai'
          : 'kembali ke Order Baru';

    updateAndBroadcast(
      {
        ...posState,
        orders: posState.orders.map((o) => (o.id === id ? updated : o)),
        activities: appendActivity(posState.activities, `${id} ${statusLabel}`, id),
      },
      'order:status_updated',
      id,
    );
    res.json(updated);
  });

  // Confirm Cashier Payment (Bayar di Kasir -> LUNAS)
  app.patch('/api/pos/orders/:id/pay', (req, res) => {
    const { id } = req.params;
    const existing = posState.orders.find((o) => o.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      return;
    }
    const updated: Order = {
      ...existing,
      paymentStatus: 'LUNAS',
      updatedAt: new Date().toISOString(),
    };
    updateAndBroadcast(
      {
        ...posState,
        orders: posState.orders.map((o) => (o.id === id ? updated : o)),
        activities: appendActivity(
          posState.activities,
          `Pembayaran kasir untuk ${id} dikonfirmasi Lunas`,
          id,
        ),
      },
      'order:paid',
      id,
    );
    res.json(updated);
  });

  // Reset Demo Data
  app.post('/api/pos/reset', (req, res) => {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_RESET !== 'true') {
      res.status(404).json({ error: 'Endpoint demo tidak tersedia' });
      return;
    }
    const requestOrigin = extractSafeRequestOrigin(req);
    const fresh = ensureInitialQrBaseUrl(createSeedData());
    if (requestOrigin && !isPrivateOrLocalUrl(requestOrigin)) {
      fresh.cafeSettings.qrBaseUrl = requestOrigin;
    }
    updateAndBroadcast(fresh, 'demo:reset');
    res.json({
      ...fresh,
      cafeSettings: {
        ...fresh.cafeSettings,
        qrBaseUrl: fresh.cafeSettings.qrBaseUrl || requestOrigin || 'http://localhost:3000',
      },
    });
  });

  // Vite middleware in development, static dist in production
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
    console.log(`LARIS POS server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LARIS POS server:', err);
  process.exit(1);
});
