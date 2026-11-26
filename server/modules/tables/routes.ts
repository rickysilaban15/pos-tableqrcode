import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../database/client.ts';
import { allowRoles, requireAuth } from '../../middleware/auth.ts';
import { getMerchantEntitlements } from '../../middleware/entitlement.ts';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex'); const token=()=>randomBytes(32).toString('base64url');
const input=z.object({name:z.string().trim().min(1).max(24),area:z.string().trim().max(60).optional(),isActive:z.boolean().optional()});
export const tablesRouter=Router();
tablesRouter.use(requireAuth);
tablesRouter.get('/',async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const r=await pool.query('SELECT t.id,t.name,t.area,t.is_active "isActive",q.id "qrId",q.public_token "qrToken",q.revoked_at "qrRevokedAt" FROM dining_tables t LEFT JOIN LATERAL(SELECT * FROM table_qr_codes WHERE table_id=t.id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1)q ON true WHERE t.merchant_id=$1 AND t.outlet_id=$2 ORDER BY t.name',[req.auth!.merchantId,req.auth!.outletId]);res.json(r.rows)}catch(e){next(e)}});
tablesRouter.post('/',allowRoles('MERCHANT_OWNER'),async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const v=input.parse(req.body);const t=token();const client=await pool.connect();try{await client.query('BEGIN');const table=(await client.query('INSERT INTO dining_tables(merchant_id,outlet_id,name,area,is_active)VALUES($1,$2,$3,$4,$5) RETURNING id,name,area,is_active "isActive"',[req.auth!.merchantId,req.auth!.outletId,v.name,v.area??'',v.isActive??true])).rows[0];await client.query('INSERT INTO table_qr_codes(table_id,token_hash,public_token)VALUES($1,$2,$3)',[table.id,hash(t),t]);await client.query('COMMIT');res.status(201).json({...table,qrToken:t});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}catch(e){next(e)}});
tablesRouter.patch('/:id',allowRoles('MERCHANT_OWNER'),async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const value=input.partial().parse(req.body);const fields:string[]=[];const values:unknown[]=[];for(const [key,item]of Object.entries(value)){fields.push(`${key==='isActive'?'is_active':key}=$${values.length+1}`);values.push(item)}if(!fields.length)return res.status(400).json({error:'Tidak ada perubahan'});values.push(req.params.id,req.auth!.merchantId,req.auth!.outletId);const r=await pool.query(`UPDATE dining_tables SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length-2} AND merchant_id=$${values.length-1} AND outlet_id=$${values.length} RETURNING id,name,area,is_active "isActive"`,values);if(!r.rowCount)return res.status(404).json({error:'Meja tidak ditemukan'});res.json(r.rows[0])}catch(e){next(e)}});
tablesRouter.delete('/:id',allowRoles('MERCHANT_OWNER'),async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const r=await pool.query('UPDATE dining_tables SET is_active=false,updated_at=now() WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3 RETURNING id',[req.params.id,req.auth!.merchantId,req.auth!.outletId]);if(!r.rowCount)return res.status(404).json({error:'Meja tidak ditemukan'});res.status(204).end()}catch(e){next(e)}});
tablesRouter.post('/:id/regenerate-qr',allowRoles('MERCHANT_OWNER'),async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const t=token();const client=await pool.connect();try{await client.query('BEGIN');const found=await client.query('SELECT id FROM dining_tables WHERE id=$1 AND merchant_id=$2 AND outlet_id=$3',[req.params.id,req.auth!.merchantId,req.auth!.outletId]);if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Meja tidak ditemukan'})}await client.query('UPDATE table_qr_codes SET revoked_at=now(),updated_at=now() WHERE table_id=$1 AND revoked_at IS NULL',[req.params.id]);await client.query('INSERT INTO table_qr_codes(table_id,token_hash,public_token)VALUES($1,$2,$3)',[req.params.id,hash(t),t]);await client.query('COMMIT');res.json({tableId:req.params.id,qrToken:t});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}catch(e){next(e)}});
export const publicTablesRouter=Router();
publicTablesRouter.get('/legacy-qr', async (req, res, next) => {
  try {
    if (!pool) throw Error('Database tidak tersedia');
    const slug = typeof req.query.slug === 'string' ? req.query.slug.trim().toLowerCase() : '';
    const table = typeof req.query.table === 'string' ? req.query.table.trim().toUpperCase() : '';
    const tokenValue = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!table || !tokenValue) {
      return res.status(400).json({ error: 'Parameter meja dan token QR wajib diisi' });
    }
    const row = (
      await pool.query(
        `SELECT q.public_token "qrToken", t.name "tableName", m.name "merchantName"
         FROM legacy_qr_mappings l
         JOIN dining_tables t ON t.id = l.table_id
         JOIN merchants m ON m.id = t.merchant_id
         JOIN table_qr_codes q ON q.table_id = t.id AND q.revoked_at IS NULL
         WHERE ($1 = '' OR l.merchant_slug = $1)
           AND upper(l.table_name) = $2
           AND l.legacy_token = $3
           AND t.is_active = true
           AND q.public_token IS NOT NULL
         ORDER BY q.created_at DESC
         LIMIT 1`,
        [slug, table, tokenValue],
      )
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'QR meja legacy tidak ditemukan atau sudah tidak aktif' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});
publicTablesRouter.get('/qr/:token',async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const r=await pool.query("SELECT t.id table_id,t.name table_name,t.area,o.id outlet_id,o.name outlet_name,m.id merchant_id,m.name merchant_name FROM table_qr_codes q JOIN dining_tables t ON t.id=q.table_id JOIN outlets o ON o.id=t.outlet_id JOIN merchants m ON m.id=t.merchant_id WHERE q.token_hash=$1 AND q.revoked_at IS NULL AND t.is_active=true",[hash(req.params.token)]);if(!r.rowCount)return res.status(404).json({error:'QR meja tidak valid atau tidak aktif'});res.json(r.rows[0]);}catch(e){next(e)}});
publicTablesRouter.get('/qr/:token/menu',async(req,res,next)=>{try{if(!pool)throw Error('Database tidak tersedia');const ctx=(await pool.query("SELECT t.id,t.merchant_id,t.outlet_id,t.name table_name,m.name merchant_name,COALESCE(s.description,'') description,COALESCE(s.address,'') address,COALESCE(s.whatsapp,'') whatsapp,COALESCE(s.logo_url,'') \"logoUrl\",COALESCE(s.operating_hours,'') \"operatingHours\",COALESCE(s.is_open,true) \"isOpen\",COALESCE(s.enable_dine_in,true) \"enableDineIn\",COALESCE(s.enable_takeaway,true) \"enableTakeaway\",COALESCE(s.enable_table_service,true) \"enableTableService\",COALESCE(s.enable_pickup_counter,true) \"enablePickupCounter\",COALESCE(s.qris_image_url,'') \"qrisImageUrl\" FROM table_qr_codes q JOIN dining_tables t ON t.id=q.table_id JOIN merchants m ON m.id=t.merchant_id LEFT JOIN outlet_settings s ON s.outlet_id=t.outlet_id WHERE q.token_hash=$1 AND q.revoked_at IS NULL AND t.is_active",[hash(req.params.token)])).rows[0];if(!ctx)return res.status(404).json({error:'QR meja tidak valid atau tidak aktif'});const entitlement=await getMerchantEntitlements(ctx.merchant_id);const effectiveOpen=ctx.isOpen&&entitlement.effectiveActive&&entitlement.qrOrderingEnabled;const [categories,products]=await Promise.all([pool.query('SELECT id,name,sort_order "sortOrder" FROM categories WHERE merchant_id=$1 AND outlet_id=$2 AND is_active ORDER BY sort_order,name',[ctx.merchant_id,ctx.outlet_id]),pool.query('SELECT p.id,p.category_id "categoryId",p.name,p.description,p.price,p.image_url "image",COALESCE(json_agg(DISTINCT jsonb_build_object(\'id\',v.id,\'groupName\',v.group_name,\'optionName\',v.option_name,\'priceDelta\',v.price_delta,\'required\',v.required)) FILTER(WHERE v.id IS NOT NULL),\'[]\') variants,COALESCE(json_agg(DISTINCT jsonb_build_object(\'id\',a.id,\'name\',a.name,\'price\',a.price)) FILTER(WHERE a.id IS NOT NULL),\'[]\') addons FROM products p LEFT JOIN product_variants v ON v.product_id=p.id LEFT JOIN product_addons a ON a.product_id=p.id AND a.is_active WHERE p.merchant_id=$1 AND p.outlet_id=$2 AND p.is_active GROUP BY p.id ORDER BY p.name',[ctx.merchant_id,ctx.outlet_id])]);res.json({merchantName:ctx.merchant_name,tableName:ctx.table_name,entitlements:{active:entitlement.effectiveActive,qrOrderingEnabled:entitlement.qrOrderingEnabled},settings:{description:ctx.description,address:ctx.address,whatsapp:ctx.whatsapp,logoUrl:ctx.logoUrl,operatingHours:ctx.operatingHours,isOpen:effectiveOpen,enableDineIn:ctx.enableDineIn,enableTakeaway:ctx.enableTakeaway,enableTableService:ctx.enableTableService,enablePickupCounter:ctx.enablePickupCounter,qrisImageUrl:ctx.qrisImageUrl},categories:categories.rows,products:products.rows})}catch(e){next(e)}});
