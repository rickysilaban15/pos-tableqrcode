import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { pool as defaultPool } from '../database/client.ts';
import { createSeedData } from '../../src/data/seedData.ts';
import type { PosDataState } from '../../src/types/pos.ts';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export interface UnsupportedLegacyRecord {
  entityType: 'category' | 'product' | 'table' | 'order';
  legacyId: string;
  reason: string;
  amount?: number;
}

export interface LegacyMigrationReport {
  dryRun: boolean;
  merchantId: string;
  merchantSlug: string;
  outletId: string;
  categoriesCreated: number;
  productsCreated: number;
  variantsCreated: number;
  addonsCreated: number;
  tablesCreated: number;
  legacyQrMapped: number;
  historicalOrdersMigrated: number;
  unsupportedRecords: UnsupportedLegacyRecord[];
  reconciliation: {
    sourceValidCategories: number;
    dbCategoriesCount: number;
    sourceValidProducts: number;
    dbProductsCount: number;
    sourceValidTables: number;
    dbTablesCount: number;
    activeQrCodesCount: number;
    legacyQrMappingsCount: number;
    sourceOrdersTotal: number;
    supportedPaidOrdersCount: number;
    supportedPaidOrdersAmount: number;
    migratedLegacyOrdersDbCount: number;
    migratedLegacyOrdersDbAmount: number;
    totalsReconciled: boolean;
  };
}

export async function importLegacyStateToPostgres(
  legacyState: PosDataState,
  options: {
    ownerEmail?: string;
    ownerPassword?: string;
    ownerName?: string;
    dryRun?: boolean;
    dbPool?: Pool | null;
  } = {},
): Promise<LegacyMigrationReport> {
  const activePool = options.dbPool ?? defaultPool;
  if (!activePool) throw new Error('DATABASE_URL wajib diatur untuk migrasi data legacy.');
  if (!legacyState || typeof legacyState !== 'object' || !legacyState.cafeSettings) {
    throw new Error('Struktur JSON legacy tidak valid: objek cafeSettings wajib ada.');
  }

  const dryRun = Boolean(options.dryRun);
  const client = await activePool.connect();
  const unsupportedRecords: UnsupportedLegacyRecord[] = [];
  let categoriesCreated = 0;
  let productsCreated = 0;
  let variantsCreated = 0;
  let addonsCreated = 0;
  let tablesCreated = 0;
  let legacyQrMapped = 0;
  let historicalOrdersMigrated = 0;

  try {
    await client.query('BEGIN');

    const slug =
      (legacyState.cafeSettings.slug || 'laris-coffee')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || 'laris-coffee';

    let merchant = (
      await client.query('SELECT id, name, slug FROM merchants WHERE slug = $1', [slug])
    ).rows[0];
    if (!merchant) {
      merchant = (
        await client.query('INSERT INTO merchants(name, slug) VALUES($1, $2) RETURNING id, name, slug', [
          (legacyState.cafeSettings.name || 'LARIS Coffee').trim(),
          slug,
        ])
      ).rows[0];
    }

    let outlet = (
      await client.query('SELECT id, slug FROM outlets WHERE merchant_id = $1 ORDER BY created_at LIMIT 1', [
        merchant.id,
      ])
    ).rows[0];
    if (!outlet) {
      outlet = (
        await client.query('INSERT INTO outlets(merchant_id, name, slug) VALUES($1, $2, $3) RETURNING id, slug', [
          merchant.id,
          (legacyState.cafeSettings.name || 'Outlet Utama').trim(),
          slug,
        ])
      ).rows[0];
    }

    // Ensure subscription exists (Trial basic plan, idempotent)
    const hasSub = await client.query('SELECT 1 FROM subscriptions WHERE merchant_id = $1 LIMIT 1', [merchant.id]);
    if (!hasSub.rowCount) {
      const basicPlan = (
        await client.query(
          "SELECT id, trial_days FROM subscription_plans WHERE code = 'basic' OR is_active = true ORDER BY (code = 'basic') DESC, monthly_price ASC LIMIT 1",
        )
      ).rows[0];
      if (basicPlan) {
        await client.query(
          "INSERT INTO subscriptions(merchant_id, plan_id, status, trial_ends_at, qr_ordering_enabled, pos_enabled) VALUES($1, $2, 'TRIAL', now() + ($3 || ' days')::interval, true, true)",
          [merchant.id, basicPlan.id, basicPlan.trial_days],
        );
      }
    }

    // Optional owner provisioning
    if (options.ownerEmail && options.ownerPassword) {
      if (options.ownerPassword.length < 10) {
        throw new Error('Kata sandi owner minimal 10 karakter.');
      }
      const email = options.ownerEmail.trim().toLowerCase();
      let user = (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
      if (!user) {
        user = (
          await client.query('INSERT INTO users(email, password_hash, name) VALUES($1, $2, $3) RETURNING id', [
            email,
            await bcrypt.hash(options.ownerPassword, 12),
            options.ownerName || 'Owner LARIS',
          ])
        ).rows[0];
      }
      await client.query(
        "INSERT INTO merchant_memberships(merchant_id, user_id, role) VALUES($1, $2, 'MERCHANT_OWNER') ON CONFLICT(merchant_id, user_id) DO NOTHING",
        [merchant.id, user.id],
      );
    }

    // Settings (insert if absent, preserving existing configured production settings)
    const s = legacyState.cafeSettings;
    const enableDineIn = s.enableDineIn !== false;
    const enableTakeaway = s.enableTakeaway !== false || !enableDineIn;
    const enableTableService = s.enableTableService !== false;
    const enablePickupCounter = s.enablePickupCounter !== false || !enableTableService;

    await client.query(
      `INSERT INTO outlet_settings(
         outlet_id, merchant_id, description, address, whatsapp, logo_url, operating_hours,
         is_open, enable_dine_in, enable_takeaway, enable_table_service, enable_pickup_counter,
         qris_image_url, qr_base_url
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT(outlet_id) DO NOTHING`,
      [
        outlet.id,
        merchant.id,
        s.description || '',
        s.address || '',
        s.whatsapp || '',
        s.logoUrl || '',
        s.operatingHours || '',
        s.isOpen !== false,
        enableDineIn,
        enableTakeaway,
        enableTableService,
        enablePickupCounter,
        s.qrisImageUrl || '',
        s.qrBaseUrl || '',
      ],
    );

    // Categories
    const categoryIdMap = new Map<string, string>();
    const existingCats = (
      await client.query('SELECT id, lower(name) key FROM categories WHERE outlet_id = $1', [outlet.id])
    ).rows;
    const catByName = new Map(existingCats.map((row) => [row.key, row.id]));
    let sourceValidCategories = 0;

    for (const cat of Array.isArray(legacyState.categories) ? legacyState.categories : []) {
      const cleanName = typeof cat?.name === 'string' ? cat.name.trim() : '';
      if (!cleanName) {
        unsupportedRecords.push({
          entityType: 'category',
          legacyId: String(cat?.id ?? 'unknown'),
          reason: 'Nama kategori kosong atau tidak valid',
        });
        continue;
      }
      sourceValidCategories += 1;
      const key = cleanName.toLowerCase();
      let dbId = catByName.get(key);
      if (!dbId) {
        dbId = (
          await client.query(
            'INSERT INTO categories(merchant_id, outlet_id, name, sort_order, is_active) VALUES($1, $2, $3, $4, $5) RETURNING id',
            [merchant.id, outlet.id, cleanName, Number(cat.sortOrder) || 0, cat.isActive !== false],
          )
        ).rows[0].id;
        catByName.set(key, dbId);
        categoriesCreated += 1;
      }
      if (cat.id) categoryIdMap.set(cat.id, dbId!);
    }

    // Products + Variants + Addons
    const productIdMap = new Map<string, string>();
    const existingProducts = (
      await client.query('SELECT id, lower(name) key FROM products WHERE outlet_id = $1', [outlet.id])
    ).rows;
    const prodByName = new Map(existingProducts.map((row) => [row.key, row.id]));
    let sourceValidProducts = 0;

    for (const prod of Array.isArray(legacyState.products) ? legacyState.products : []) {
      const cleanName = typeof prod?.name === 'string' ? prod.name.trim() : '';
      const rawPrice = Number(prod?.price);
      if (!cleanName || !Number.isFinite(rawPrice) || rawPrice < 0) {
        unsupportedRecords.push({
          entityType: 'product',
          legacyId: String(prod?.id ?? 'unknown'),
          reason: !cleanName ? 'Nama produk kosong' : 'Harga produk negatif atau tidak valid',
        });
        continue;
      }
      sourceValidProducts += 1;
      const key = cleanName.toLowerCase();
      let dbProdId = prodByName.get(key);
      if (!dbProdId) {
        dbProdId = (
          await client.query(
            'INSERT INTO products(merchant_id, outlet_id, category_id, name, description, price, image_url, is_active) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [
              merchant.id,
              outlet.id,
              categoryIdMap.get(prod.categoryId) ?? null,
              cleanName,
              prod.description || '',
              Math.round(rawPrice),
              prod.image || '',
              prod.isActive !== false,
            ],
          )
        ).rows[0].id;
        prodByName.set(key, dbProdId);
        productsCreated += 1;

        const seenVariants = new Set<string>();
        for (const vg of prod.variantGroups ?? []) {
          const groupName = typeof vg?.name === 'string' ? vg.name.trim() : '';
          if (!groupName) continue;
          for (const opt of vg.options ?? []) {
            const optionName = typeof opt?.label === 'string' ? opt.label.trim() : '';
            if (!optionName) continue;
            const vKey = `${groupName.toLowerCase()}\u0000${optionName.toLowerCase()}`;
            if (seenVariants.has(vKey)) continue;
            seenVariants.add(vKey);
            await client.query(
              'INSERT INTO product_variants(product_id, group_name, option_name, price_delta, required) VALUES($1, $2, $3, $4, $5)',
              [dbProdId, groupName, optionName, Math.max(0, Math.round(Number(opt.priceDelta) || 0)), Boolean(vg.required)],
            );
            variantsCreated += 1;
          }
        }

        const seenAddons = new Set<string>();
        for (const addon of prod.toppings ?? []) {
          const addonName = typeof addon?.name === 'string' ? addon.name.trim() : '';
          if (!addonName) continue;
          const aKey = addonName.toLowerCase();
          if (seenAddons.has(aKey)) continue;
          seenAddons.add(aKey);
          await client.query(
            'INSERT INTO product_addons(product_id, name, price, is_active) VALUES($1, $2, $3, true)',
            [dbProdId, addonName, Math.max(0, Math.round(Number(addon.price) || 0))],
          );
          addonsCreated += 1;
        }
      }
      if (prod.id) productIdMap.set(prod.id, dbProdId!);
    }

    // Tables + Active QR + Legacy QR Compatibility Mapping
    const tableIdByLegacyId = new Map<string, string>();
    const existingTables = (
      await client.query('SELECT id, upper(name) key FROM dining_tables WHERE outlet_id = $1', [outlet.id])
    ).rows;
    const tableByName = new Map(existingTables.map((row) => [row.key, row.id]));
    let sourceValidTables = 0;

    for (const tbl of Array.isArray(legacyState.tables) ? legacyState.tables : []) {
      const upperName = typeof tbl?.name === 'string' ? tbl.name.trim().toUpperCase() : '';
      if (!upperName) {
        unsupportedRecords.push({
          entityType: 'table',
          legacyId: String(tbl?.id ?? 'unknown'),
          reason: 'Nama meja kosong atau tidak valid',
        });
        continue;
      }
      sourceValidTables += 1;
      let dbTableId = tableByName.get(upperName);
      if (!dbTableId) {
        dbTableId = (
          await client.query(
            'INSERT INTO dining_tables(merchant_id, outlet_id, name, area, is_active) VALUES($1, $2, $3, $4, $5) RETURNING id',
            [merchant.id, outlet.id, upperName, tbl.area || 'Indoor Main', tbl.isActive !== false],
          )
        ).rows[0].id;
        tableByName.set(upperName, dbTableId);
        tablesCreated += 1;
      }
      if (tbl.id) tableIdByLegacyId.set(tbl.id, dbTableId!);

      const activeQr = await client.query(
        'SELECT id FROM table_qr_codes WHERE table_id = $1 AND revoked_at IS NULL LIMIT 1',
        [dbTableId],
      );
      if (!activeQr.rowCount) {
        const publicToken = crypto.randomBytes(32).toString('base64url');
        await client.query(
          'INSERT INTO table_qr_codes(table_id, token_hash, public_token) VALUES($1, $2, $3)',
          [dbTableId, hash(publicToken), publicToken],
        );
      }

      if (tbl.token?.trim()) {
        const mapped = await client.query(
          `INSERT INTO legacy_qr_mappings(merchant_slug, table_name, legacy_token, table_id)
           VALUES($1, $2, $3, $4)
           ON CONFLICT(merchant_slug, table_name, legacy_token) DO NOTHING
           RETURNING id`,
          [slug, upperName, tbl.token.trim(), dbTableId],
        );
        if (mapped.rowCount) legacyQrMapped += 1;
      }
    }

    // Historical Orders: migrate verified LUNAS orders using supported payment methods (CASHIER -> CASH, QRIS -> QRIS).
    // Explicitly report simulated gateway methods (E_WALLET, BANK_TRANSFER) or unpaid/invalid prototype orders without fabricating payments.
    const rawOrders = Array.isArray(legacyState.orders) ? legacyState.orders : [];
    let supportedPaidOrdersCount = 0;
    let supportedPaidOrdersAmount = 0;

    for (const ord of rawOrders) {
      const legacyOrderId = typeof ord?.id === 'string' && ord.id.trim() ? ord.id.trim() : '';
      if (!legacyOrderId) {
        unsupportedRecords.push({
          entityType: 'order',
          legacyId: 'missing-id',
          reason: 'ID pesanan legacy kosong',
        });
        continue;
      }
      if (ord.paymentStatus !== 'LUNAS') {
        unsupportedRecords.push({
          entityType: 'order',
          legacyId: legacyOrderId,
          reason: `Status pembayaran ${ord.paymentStatus} bukan transaksi lunas terverifikasi (Pay-First policy)`,
          amount: Number(ord.totalAmount) || 0,
        });
        continue;
      }
      if (ord.paymentMethod !== 'CASHIER' && ord.paymentMethod !== 'QRIS') {
        unsupportedRecords.push({
          entityType: 'order',
          legacyId: legacyOrderId,
          reason: `Metode pembayaran legacy "${ord.paymentMethod}" adalah simulasi prototipe tanpa bukti settlement gateway`,
          amount: Number(ord.totalAmount) || 0,
        });
        continue;
      }
      const items = Array.isArray(ord.items) ? ord.items : [];
      if (items.length === 0) {
        unsupportedRecords.push({
          entityType: 'order',
          legacyId: legacyOrderId,
          reason: 'Pesanan legacy tidak memiliki item',
          amount: Number(ord.totalAmount) || 0,
        });
        continue;
      }
      const computedSum = items.reduce(
        (sum, it) => sum + Math.round(Number(it.unitPrice) || 0) * Math.max(1, Math.round(Number(it.quantity) || 1)),
        0,
      );
      const declaredTotal = Math.round(Number(ord.totalAmount) || 0);
      if (computedSum < 0 || computedSum !== declaredTotal) {
        unsupportedRecords.push({
          entityType: 'order',
          legacyId: legacyOrderId,
          reason: `Total pesanan (${declaredTotal}) tidak cocok dengan jumlah subtotal item (${computedSum})`,
          amount: declaredTotal,
        });
        continue;
      }

      supportedPaidOrdersCount += 1;
      supportedPaidOrdersAmount += declaredTotal;

      const idempotencyKey = `legacy:${legacyOrderId}`;
      const existingOrder = await client.query(
        'SELECT id FROM orders WHERE outlet_id = $1 AND idempotency_key = $2',
        [outlet.id, idempotencyKey],
      );
      if (existingOrder.rowCount) {
        continue;
      }

      const mappedStatus =
        ord.orderStatus === 'DISAJIKAN'
          ? 'READY_TO_SERVE'
          : ord.orderStatus === 'MEMASAK'
            ? 'IN_PROGRESS'
            : 'NEW_ORDER';
      const mappedMethod = ord.paymentMethod === 'CASHIER' ? 'CASH' : 'QRIS';
      const createdAt = ord.createdAt && !Number.isNaN(new Date(ord.createdAt).getTime()) ? ord.createdAt : new Date().toISOString();
      const updatedAt = ord.updatedAt && !Number.isNaN(new Date(ord.updatedAt).getTime()) ? ord.updatedAt : createdAt;
      const completedAt = mappedStatus === 'READY_TO_SERVE' ? updatedAt : null;
      const resolvedTableId =
        (ord.tableId && tableIdByLegacyId.get(ord.tableId)) ||
        (ord.tableName ? tableByName.get(ord.tableName.trim().toUpperCase()) : null) ||
        null;

      const insertedOrder = (
        await client.query(
          `INSERT INTO orders(
             merchant_id, outlet_id, table_id, idempotency_key, request_hash, tracking_token_hash,
             order_status, payment_status, total_amount, customer_name, order_type, fulfillment_method,
             order_source, completed_at, created_at, updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,'PAID',$8,$9,$10,$11,'QR',$12,$13,$14)
           RETURNING id`,
          [
            merchant.id,
            outlet.id,
            ord.orderType === 'DINE_IN' ? resolvedTableId : null,
            idempotencyKey,
            hash(JSON.stringify({ legacyOrderId, declaredTotal })),
            hash(`legacy-track:${outlet.id}:${legacyOrderId}`),
            mappedStatus,
            declaredTotal,
            (ord.customerName || 'Pelanggan Legacy').trim().slice(0, 80),
            ord.orderType === 'TAKEAWAY' ? 'TAKEAWAY' : 'DINE_IN',
            ord.orderType === 'TAKEAWAY'
              ? 'PICKUP_COUNTER'
              : ord.fulfillmentMethod === 'PICKUP_COUNTER'
                ? 'PICKUP_COUNTER'
                : 'TABLE_SERVICE',
            completedAt,
            createdAt,
            updatedAt,
          ],
        )
      ).rows[0];

      for (const it of items) {
        const unitPrice = Math.max(0, Math.round(Number(it.unitPrice) || 0));
        const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
        const selections = {
          variants: (it.selectedVariants ?? []).map((v) => ({
            group_name: v.groupName,
            option_name: v.optionLabel,
            price_delta: v.priceDelta,
          })),
          addons: (it.selectedToppings ?? []).map((t) => ({ name: t.name, price: t.price })),
          note: it.notes || '',
        };
        await client.query(
          `INSERT INTO order_items(order_id, product_id, product_name, unit_price, quantity, selections, created_at)
           VALUES($1, $2, $3, $4, $5, $6, $7)`,
          [
            insertedOrder.id,
            productIdMap.get(it.productId) ?? null,
            (it.productName || 'Produk').trim(),
            unitPrice,
            qty,
            JSON.stringify(selections),
            createdAt,
          ],
        );
      }

      await client.query(
        `INSERT INTO payments(order_id, method, status, amount, cash_received, change_amount, paid_at, created_at, updated_at)
         VALUES($1, $2, 'PAID', $3, $4, $5, $6, $7, $8)`,
        [
          insertedOrder.id,
          mappedMethod,
          declaredTotal,
          mappedMethod === 'CASH' ? declaredTotal : null,
          mappedMethod === 'CASH' ? 0 : null,
          updatedAt,
          createdAt,
          updatedAt,
        ],
      );

      historicalOrdersMigrated += 1;
    }

    // Reconcile database counts and financial totals inside the same transaction
    const reconQuery = (
      await client.query(
        `SELECT
           (SELECT count(*)::int FROM categories WHERE outlet_id = $1) "dbCategoriesCount",
           (SELECT count(*)::int FROM products WHERE outlet_id = $1) "dbProductsCount",
           (SELECT count(*)::int FROM dining_tables WHERE outlet_id = $1) "dbTablesCount",
           (SELECT count(*)::int FROM table_qr_codes q JOIN dining_tables t ON t.id = q.table_id WHERE t.outlet_id = $1 AND q.revoked_at IS NULL) "activeQrCodesCount",
           (SELECT count(*)::int FROM legacy_qr_mappings l JOIN dining_tables t ON t.id = l.table_id WHERE t.outlet_id = $1) "legacyQrMappingsCount",
           (SELECT count(*)::int FROM orders WHERE outlet_id = $1 AND idempotency_key LIKE 'legacy:%' AND payment_status = 'PAID') "migratedLegacyOrdersDbCount",
           (SELECT coalesce(sum(total_amount), 0)::int FROM orders WHERE outlet_id = $1 AND idempotency_key LIKE 'legacy:%' AND payment_status = 'PAID') "migratedLegacyOrdersDbAmount"`,
        [outlet.id],
      )
    ).rows[0];

    const reconciliation = {
      sourceValidCategories,
      dbCategoriesCount: reconQuery.dbCategoriesCount,
      sourceValidProducts,
      dbProductsCount: reconQuery.dbProductsCount,
      sourceValidTables,
      dbTablesCount: reconQuery.dbTablesCount,
      activeQrCodesCount: reconQuery.activeQrCodesCount,
      legacyQrMappingsCount: reconQuery.legacyQrMappingsCount,
      sourceOrdersTotal: rawOrders.length,
      supportedPaidOrdersCount,
      supportedPaidOrdersAmount,
      migratedLegacyOrdersDbCount: reconQuery.migratedLegacyOrdersDbCount,
      migratedLegacyOrdersDbAmount: reconQuery.migratedLegacyOrdersDbAmount,
      totalsReconciled:
        reconQuery.migratedLegacyOrdersDbCount === supportedPaidOrdersCount &&
        reconQuery.migratedLegacyOrdersDbAmount === supportedPaidOrdersAmount &&
        reconQuery.dbCategoriesCount >= sourceValidCategories &&
        reconQuery.dbProductsCount >= sourceValidProducts &&
        reconQuery.dbTablesCount >= sourceValidTables,
    };

    if (!reconciliation.totalsReconciled) {
      throw new Error('Rekonsiliasi migrasi legacy gagal: jumlah record atau total nominal tidak cocok.');
    }

    const report: LegacyMigrationReport = {
      dryRun,
      merchantId: merchant.id,
      merchantSlug: slug,
      outletId: outlet.id,
      categoriesCreated,
      productsCreated,
      variantsCreated,
      addonsCreated,
      tablesCreated,
      legacyQrMapped,
      historicalOrdersMigrated,
      unsupportedRecords,
      reconciliation,
    };

    if (dryRun) {
      await client.query('ROLLBACK');
      return report;
    }

    await client.query(
      'INSERT INTO audit_logs(merchant_id, action, entity_type, entity_id, payload) VALUES($1, $2, $3, $4, $5)',
      [merchant.id, 'LEGACY_JSON_IMPORTED', 'merchant', merchant.id, JSON.stringify(report)],
    );

    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const filePath = path.resolve('data/pos-state.json');
  let legacyState: PosDataState;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    legacyState = JSON.parse(raw) as PosDataState;
  } catch {
    legacyState = createSeedData();
  }

  const result = await importLegacyStateToPostgres(legacyState, {
    dryRun,
    ownerEmail: process.env.LEGACY_IMPORT_OWNER_EMAIL || process.env.OWNER_EMAIL,
    ownerPassword: process.env.LEGACY_IMPORT_OWNER_PASSWORD || process.env.OWNER_PASSWORD,
    ownerName: process.env.LEGACY_IMPORT_OWNER_NAME || process.env.OWNER_NAME,
  });
  console.log(dryRun ? 'Legacy LARIS dry-run complete (rolled back):' : 'Legacy LARIS migration complete:', JSON.stringify(result, null, 2));
  await defaultPool?.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli();
}
