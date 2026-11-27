import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, isUuid, requireAuth, requireMerchantContext } from '../../middleware/auth.ts';
import { isSafeImageOrUrl } from '../../middleware/security.ts';

const body = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().int().min(0).max(50_000_000),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().max(300).optional(),
  imageUrl: z
    .string()
    .max(2_000_000)
    .optional()
    .refine((value) => value === undefined || isSafeImageOrUrl(value), 'URL gambar produk tidak valid'),
  isActive: z.boolean().optional(),
});

const customization = z
  .object({
    variants: z
      .array(
        z.object({
          groupName: z.string().trim().min(1).max(60),
          optionName: z.string().trim().min(1).max(80),
          priceDelta: z.number().int().min(0).max(10_000_000),
          required: z.boolean(),
        }),
      )
      .max(100),
    addons: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          price: z.number().int().min(0).max(10_000_000),
          isActive: z.boolean(),
        }),
      )
      .max(100),
  })
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    value.variants.forEach((item, index) => {
      const key = `${item.groupName.toLowerCase()}\u0000${item.optionName.toLowerCase()}`;
      if (keys.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pilihan varian duplikat', path: ['variants', index] });
      }
      keys.add(key);
    });
    const addons = new Set<string>();
    value.addons.forEach((item, index) => {
      const key = item.name.toLowerCase();
      if (addons.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Addon duplikat', path: ['addons', index] });
      }
      addons.add(key);
    });
  });

const saveBody = body.extend({ customizations: customization });

export const productsRouter = Router();
productsRouter.use(requireAuth, requireMerchantContext);

productsRouter.get('/', async (req, res, next) => {
  try {
    if (!pool) throw new Error('Database tidak tersedia');
    const rows = await pool.query(
      'SELECT id,category_id "categoryId",name,description,price,image_url "imageUrl",is_active "isActive",created_at "createdAt",updated_at "updatedAt" FROM products WHERE merchant_id=$1 AND outlet_id=$2 ORDER BY name',
      [req.auth!.merchantId, req.auth!.outletId],
    );
    if (req.query.includeCustomizations === '1' && rows.rows.length > 0) {
      const productIds = rows.rows.map((r) => r.id);
      const [variantsRes, addonsRes] = await Promise.all([
        pool.query(
          'SELECT id, product_id AS "productId", group_name AS "groupName", option_name AS "optionName", price_delta AS "priceDelta", required FROM product_variants WHERE product_id = ANY($1::uuid[]) ORDER BY group_name, option_name',
          [productIds],
        ),
        pool.query(
          'SELECT id, product_id AS "productId", name, price, is_active AS "isActive" FROM product_addons WHERE product_id = ANY($1::uuid[]) ORDER BY name',
          [productIds],
        ),
      ]);
      const variantsByProduct = new Map<string, typeof variantsRes.rows>();
      for (const v of variantsRes.rows) {
        const list = variantsByProduct.get(v.productId) ?? [];
        list.push(v);
        variantsByProduct.set(v.productId, list);
      }
      const addonsByProduct = new Map<string, typeof addonsRes.rows>();
      for (const a of addonsRes.rows) {
        const list = addonsByProduct.get(a.productId) ?? [];
        list.push(a);
        addonsByProduct.set(a.productId, list);
      }
      return res.json(
        rows.rows.map((product) => ({
          ...product,
          customizations: {
            variants: variantsByProduct.get(product.id) ?? [],
            addons: addonsByProduct.get(product.id) ?? [],
          },
        })),
      );
    }
    res.json(rows.rows);
  } catch (e) {
    next(e);
  }
});

productsRouter.post('/with-customizations', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const value = saveBody.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (
        value.categoryId &&
        !(
          await client.query('SELECT 1 FROM categories WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3', [
            value.categoryId,
            req.auth!.merchantId,
            req.auth!.outletId,
          ])
        ).rowCount
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Kategori tidak valid' });
      }
      const product = (
        await client.query(
          'INSERT INTO products(merchant_id,outlet_id,category_id,name,description,price,image_url,is_active)VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,category_id "categoryId",name,description,price,image_url "image",is_active "isActive"',
          [
            req.auth!.merchantId,
            req.auth!.outletId,
            value.categoryId ?? null,
            value.name,
            value.description ?? '',
            value.price,
            value.imageUrl?.trim() ?? '',
            value.isActive ?? true,
          ],
        )
      ).rows[0];
      for (const item of value.customizations.variants) {
        await client.query(
          'INSERT INTO product_variants(product_id,group_name,option_name,price_delta,required)VALUES($1,$2,$3,$4,$5)',
          [product.id, item.groupName, item.optionName, item.priceDelta, item.required],
        );
      }
      for (const item of value.customizations.addons) {
        await client.query('INSERT INTO product_addons(product_id,name,price,is_active)VALUES($1,$2,$3,$4)', [
          product.id,
          item.name,
          item.price,
          item.isActive,
        ]);
      }
      await client.query('COMMIT');
      res.status(201).json(product);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

productsRouter.put('/:id/with-customizations', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    if (!pool) throw Error('Database tidak tersedia');
    const value = saveBody.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (
        value.categoryId &&
        !(
          await client.query('SELECT 1 FROM categories WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3', [
            value.categoryId,
            req.auth!.merchantId,
            req.auth!.outletId,
          ])
        ).rowCount
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Kategori tidak valid' });
      }
      const product = (
        await client.query(
          'UPDATE products SET category_id=$1,name=$2,description=$3,price=$4,image_url=$5,is_active=$6,updated_at=now() WHERE id=$7 AND merchant_id=$8 AND outlet_id=$9 RETURNING id',
          [
            value.categoryId ?? null,
            value.name,
            value.description ?? '',
            value.price,
            value.imageUrl?.trim() ?? '',
            value.isActive ?? true,
            req.params.id,
            req.auth!.merchantId,
            req.auth!.outletId,
          ],
        )
      ).rows[0];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produk tidak ditemukan' });
      }
      await client.query('DELETE FROM product_variants WHERE product_id=$1', [req.params.id]);
      await client.query('DELETE FROM product_addons WHERE product_id=$1', [req.params.id]);
      for (const item of value.customizations.variants) {
        await client.query(
          'INSERT INTO product_variants(product_id,group_name,option_name,price_delta,required)VALUES($1,$2,$3,$4,$5)',
          [req.params.id, item.groupName, item.optionName, item.priceDelta, item.required],
        );
      }
      for (const item of value.customizations.addons) {
        await client.query('INSERT INTO product_addons(product_id,name,price,is_active)VALUES($1,$2,$3,$4)', [
          req.params.id,
          item.name,
          item.price,
          item.isActive,
        ]);
      }
      await client.query('COMMIT');
      res.json(product);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

productsRouter.post('/', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!pool) throw new Error('Database tidak tersedia');
    const v = body.parse(req.body);
    if (v.categoryId) {
      const found = await pool.query('SELECT 1 FROM categories WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3', [
        v.categoryId,
        req.auth!.merchantId,
        req.auth!.outletId,
      ]);
      if (!found.rowCount) return res.status(400).json({ error: 'Kategori tidak valid' });
    }
    const row = await pool.query(
      'INSERT INTO products(merchant_id,outlet_id,category_id,name,description,price,image_url,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,price',
      [
        req.auth!.merchantId,
        req.auth!.outletId,
        v.categoryId ?? null,
        v.name,
        v.description ?? '',
        v.price,
        v.imageUrl?.trim() ?? '',
        v.isActive ?? true,
      ],
    );
    res.status(201).json(row.rows[0]);
  } catch (e) {
    next(e);
  }
});

productsRouter.patch('/:id', allowRoles('MERCHANT_OWNER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    if (!pool) throw new Error('Database tidak tersedia');
    const v = body.partial().parse(req.body);
    if (v.categoryId) {
      const found = await pool.query('SELECT 1 FROM categories WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3', [
        v.categoryId,
        req.auth!.merchantId,
        req.auth!.outletId,
      ]);
      if (!found.rowCount) return res.status(400).json({ error: 'Kategori tidak valid' });
    }
    const columns: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = {
      name: 'name',
      price: 'price',
      categoryId: 'category_id',
      description: 'description',
      imageUrl: 'image_url',
      isActive: 'is_active',
    };
    for (const [key, value] of Object.entries(v)) {
      columns.push(`${map[key]}=$${values.length + 1}`);
      values.push(typeof value === 'string' && key === 'imageUrl' ? value.trim() : value);
    }
    if (!columns.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
    values.push(req.params.id, req.auth!.merchantId, req.auth!.outletId);
    const result = await pool.query(
      `UPDATE products SET ${columns.join(',')},updated_at=now() WHERE id=$${values.length - 2} AND merchant_id=$${values.length - 1} AND outlet_id=$${values.length} RETURNING id,name,price,is_active "isActive"`,
      values,
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});

productsRouter.delete('/:id', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    if (!pool) throw new Error('Database tidak tersedia');
    const r = await pool.query(
      'UPDATE products SET is_active=false,updated_at=now() WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3 RETURNING id',
      [req.params.id, req.auth!.merchantId, req.auth!.outletId],
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
