import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../database/client.ts';
import { createSeedData } from '../../src/data/seedData.ts';
import type { PosDataState } from '../../src/types/pos.ts';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function importLegacyStateToPostgres(
  legacyState: PosDataState,
  options: { ownerEmail?: string; ownerPassword?: string; ownerName?: string } = {},
) {
  if (!pool) throw new Error('DATABASE_URL wajib diatur untuk migrasi data legacy.');
  const client = await pool.connect();
  const stats = {
    merchantId: '',
    outletId: '',
    categoriesCreated: 0,
    productsCreated: 0,
    tablesCreated: 0,
    legacyQrMapped: 0,
  };

  try {
    await client.query('BEGIN');

    const slug = (legacyState.cafeSettings.slug || 'laris-coffee')
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
          legacyState.cafeSettings.name || 'LARIS Coffee',
          slug,
        ])
      ).rows[0];
    }
    stats.merchantId = merchant.id;

    let outlet = (
      await client.query('SELECT id, slug FROM outlets WHERE merchant_id = $1 ORDER BY created_at LIMIT 1', [
        merchant.id,
      ])
    ).rows[0];
    if (!outlet) {
      outlet = (
        await client.query('INSERT INTO outlets(merchant_id, name, slug) VALUES($1, $2, $3) RETURNING id, slug', [
          merchant.id,
          legacyState.cafeSettings.name || 'Outlet Utama',
          slug,
        ])
      ).rows[0];
    }
    stats.outletId = outlet.id;

    // Ensure subscription exists (Trial/Active basic plan, idempotent)
    const hasSub = await client.query('SELECT 1 FROM subscriptions WHERE merchant_id = $1 LIMIT 1', [
      merchant.id,
    ]);
    if (!hasSub.rowCount) {
      const basicPlan = (
        await client.query("SELECT id, trial_days FROM subscription_plans WHERE code = 'basic' LIMIT 1")
      ).rows[0];
      if (basicPlan) {
        await client.query(
          "INSERT INTO subscriptions(merchant_id, plan_id, status, trial_ends_at) VALUES($1, $2, 'TRIAL', now() + ($3 || ' days')::interval)",
          [merchant.id, basicPlan.id, basicPlan.trial_days],
        );
      }
    }

    // Optional owner provisioning (only if merchant has no owner yet)
    if (options.ownerEmail && options.ownerPassword) {
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
        Boolean(s.isOpen),
        Boolean(s.enableDineIn),
        Boolean(s.enableTakeaway),
        Boolean(s.enableTableService),
        Boolean(s.enablePickupCounter),
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

    for (const cat of legacyState.categories) {
      const key = cat.name.trim().toLowerCase();
      let dbId = catByName.get(key);
      if (!dbId) {
        dbId = (
          await client.query(
            'INSERT INTO categories(merchant_id, outlet_id, name, sort_order, is_active) VALUES($1, $2, $3, $4, $5) RETURNING id',
            [merchant.id, outlet.id, cat.name.trim(), cat.sortOrder ?? 0, Boolean(cat.isActive)],
          )
        ).rows[0].id;
        catByName.set(key, dbId);
        stats.categoriesCreated += 1;
      }
      categoryIdMap.set(cat.id, dbId!);
    }

    // Products + Variants + Addons
    const existingProducts = (
      await client.query('SELECT id, lower(name) key FROM products WHERE outlet_id = $1', [outlet.id])
    ).rows;
    const prodByName = new Map(existingProducts.map((row) => [row.key, row.id]));

    for (const prod of legacyState.products) {
      const key = prod.name.trim().toLowerCase();
      let dbProdId = prodByName.get(key);
      if (!dbProdId) {
        dbProdId = (
          await client.query(
            'INSERT INTO products(merchant_id, outlet_id, category_id, name, description, price, image_url, is_active) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [
              merchant.id,
              outlet.id,
              categoryIdMap.get(prod.categoryId) ?? null,
              prod.name.trim(),
              prod.description || '',
              Math.max(0, Math.round(prod.price)),
              prod.image || '',
              Boolean(prod.isActive),
            ],
          )
        ).rows[0].id;
        prodByName.set(key, dbProdId);
        stats.productsCreated += 1;

        for (const vg of prod.variantGroups ?? []) {
          for (const opt of vg.options ?? []) {
            await client.query(
              'INSERT INTO product_variants(product_id, group_name, option_name, price_delta, required) VALUES($1, $2, $3, $4, $5)',
              [dbProdId, vg.name, opt.label, Math.max(0, Math.round(opt.priceDelta)), Boolean(vg.required)],
            );
          }
        }
        for (const addon of prod.toppings ?? []) {
          await client.query(
            'INSERT INTO product_addons(product_id, name, price, is_active) VALUES($1, $2, $3, true)',
            [dbProdId, addon.name, Math.max(0, Math.round(addon.price))],
          );
        }
      }
    }

    // Tables + Active QR + Legacy QR Compatibility Mapping
    const existingTables = (
      await client.query('SELECT id, upper(name) key FROM dining_tables WHERE outlet_id = $1', [outlet.id])
    ).rows;
    const tableByName = new Map(existingTables.map((row) => [row.key, row.id]));

    for (const tbl of legacyState.tables) {
      const upperName = tbl.name.trim().toUpperCase();
      let dbTableId = tableByName.get(upperName);
      if (!dbTableId) {
        dbTableId = (
          await client.query(
            'INSERT INTO dining_tables(merchant_id, outlet_id, name, area, is_active) VALUES($1, $2, $3, $4, $5) RETURNING id',
            [merchant.id, outlet.id, upperName, tbl.area || 'Indoor Main', Boolean(tbl.isActive)],
          )
        ).rows[0].id;
        tableByName.set(upperName, dbTableId);
        stats.tablesCreated += 1;
      }

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
        if (mapped.rowCount) stats.legacyQrMapped += 1;
      }
    }

    // Audit the migration without fabricating any historical payments
    await client.query(
      'INSERT INTO audit_logs(merchant_id, action, entity_type, payload) VALUES($1, $2, $3, $4)',
      [merchant.id, 'LEGACY_JSON_IMPORTED', 'merchant', JSON.stringify(stats)],
    );

    await client.query('COMMIT');
    return stats;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runCli() {
  const filePath = path.resolve('data/pos-state.json');
  let legacyState: PosDataState;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    legacyState = JSON.parse(raw) as PosDataState;
  } catch {
    legacyState = createSeedData();
  }

  const result = await importLegacyStateToPostgres(legacyState, {
    ownerEmail: process.env.LEGACY_IMPORT_OWNER_EMAIL,
    ownerPassword: process.env.LEGACY_IMPORT_OWNER_PASSWORD,
    ownerName: process.env.LEGACY_IMPORT_OWNER_NAME,
  });
  console.log('Legacy LARIS migration complete:', result);
  await pool?.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli();
}
