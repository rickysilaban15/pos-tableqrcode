import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, requireAuth } from '../../middleware/auth.ts';
import { publishTenantEvent } from '../events/bus.ts';

function isSafeImageOrUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('/') ||
    lower.startsWith('data:image/')
  );
}

function isSafeBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const input = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300).default(''),
    address: z.string().trim().max(200).default(''),
    whatsapp: z.string().trim().max(40).default(''),
    logoUrl: z.string().max(2_000_000).default('').refine(isSafeImageOrUrl, 'URL logo tidak valid'),
    operatingHours: z.string().trim().max(60).default(''),
    isOpen: z.boolean(),
    enableDineIn: z.boolean(),
    enableTakeaway: z.boolean(),
    enableTableService: z.boolean(),
    enablePickupCounter: z.boolean(),
    qrisImageUrl: z
      .string()
      .max(2_000_000)
      .default('')
      .refine(isSafeImageOrUrl, 'URL gambar QRIS tidak valid'),
    qrBaseUrl: z.string().trim().max(250).default('').refine(isSafeBaseUrl, 'Base URL QR tidak valid'),
  })
  .superRefine((value, ctx) => {
    if (!value.enableDineIn && !value.enableTakeaway) {
      ctx.addIssue({ code: 'custom', message: 'Minimal satu jenis pesanan harus aktif' });
    }
    if (!value.enableTableService && !value.enablePickupCounter) {
      ctx.addIssue({ code: 'custom', message: 'Minimal satu metode penyerahan harus aktif' });
    }
  });

const select = `SELECT m.name, o.slug, s.description, s.address, s.whatsapp, s.logo_url "logoUrl", s.operating_hours "operatingHours", s.is_open "isOpen", s.enable_dine_in "enableDineIn", s.enable_takeaway "enableTakeaway", s.enable_table_service "enableTableService", s.enable_pickup_counter "enablePickupCounter", s.qris_image_url "qrisImageUrl", s.qr_base_url "qrBaseUrl" FROM outlets o JOIN merchants m ON m.id=o.merchant_id LEFT JOIN outlet_settings s ON s.outlet_id=o.id WHERE o.id=$1 AND o.merchant_id=$2`;

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const row = (await pool.query(select, [req.auth!.outletId, req.auth!.merchantId])).rows[0];
    if (!row) return res.status(404).json({ error: 'Outlet tidak ditemukan' });
    res.json({
      name: row.name,
      slug: row.slug,
      description: row.description ?? '',
      address: row.address ?? '',
      whatsapp: row.whatsapp ?? '',
      logoUrl: row.logoUrl ?? '',
      operatingHours: row.operatingHours ?? '',
      isOpen: row.isOpen ?? true,
      enableDineIn: row.enableDineIn ?? true,
      enableTakeaway: row.enableTakeaway ?? true,
      enableTableService: row.enableTableService ?? true,
      enablePickupCounter: row.enablePickupCounter ?? true,
      qrisImageUrl: row.qrisImageUrl ?? '',
      qrBaseUrl: row.qrBaseUrl ?? '',
    });
  } catch (e) {
    next(e);
  }
});

settingsRouter.put('/', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const v = input.parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('UPDATE merchants SET name=$1,updated_at=now() WHERE id=$2', [
        v.name,
        req.auth!.merchantId,
      ]);
      await c.query(
        'INSERT INTO outlet_settings(outlet_id,merchant_id,description,address,whatsapp,logo_url,operating_hours,is_open,enable_dine_in,enable_takeaway,enable_table_service,enable_pickup_counter,qris_image_url,qr_base_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(outlet_id) DO UPDATE SET description=EXCLUDED.description,address=EXCLUDED.address,whatsapp=EXCLUDED.whatsapp,logo_url=EXCLUDED.logo_url,operating_hours=EXCLUDED.operating_hours,is_open=EXCLUDED.is_open,enable_dine_in=EXCLUDED.enable_dine_in,enable_takeaway=EXCLUDED.enable_takeaway,enable_table_service=EXCLUDED.enable_table_service,enable_pickup_counter=EXCLUDED.enable_pickup_counter,qris_image_url=EXCLUDED.qris_image_url,qr_base_url=EXCLUDED.qr_base_url,updated_at=now()',
        [
          req.auth!.outletId,
          req.auth!.merchantId,
          v.description,
          v.address,
          v.whatsapp,
          v.logoUrl.trim(),
          v.operatingHours,
          v.isOpen,
          v.enableDineIn,
          v.enableTakeaway,
          v.enableTableService,
          v.enablePickupCounter,
          v.qrisImageUrl.trim(),
          v.qrBaseUrl.trim(),
        ],
      );
      await c.query('COMMIT');
      publishTenantEvent({
        type: 'settings:updated',
        merchantId: req.auth!.merchantId,
        outletId: req.auth!.outletId,
      });
      res.json({
        ...v,
        logoUrl: v.logoUrl.trim(),
        qrisImageUrl: v.qrisImageUrl.trim(),
        qrBaseUrl: v.qrBaseUrl.trim(),
      });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    next(e);
  }
});
