import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../../database/client.ts';
import { publishTenantEvent, publishTrackingEvent } from '../events/bus.ts';

export type CheckoutItem = {
  productId: string;
  quantity: number;
  variantIds: string[];
  addonIds: string[];
  notes?: string;
};
export type CheckoutInput = {
  customerName: string;
  idempotencyKey: string;
  paymentMethod: 'CASH' | 'QRIS';
  items: CheckoutItem[];
  orderType: 'DINE_IN' | 'TAKEAWAY';
  fulfillmentMethod: 'TABLE_SERVICE' | 'PICKUP_COUNTER';
};
export type OrderContext = {
  merchantId: string;
  outletId: string;
  tableId?: string | null;
  orderSource?: 'QR' | 'POS';
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Shared QR and cashier transaction writer. Browser prices are intentionally ignored. */
export async function createCheckoutOrder(
  input: CheckoutInput,
  context: OrderContext,
  options: { confirmCash?: number; verifiedBy?: string } = {},
) {
  if (!pool) throw Error('Database tidak tersedia');
  const requestHash = hash(JSON.stringify(input));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent retries with the same outlet + idempotencyKey.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${context.outletId}:${input.idempotencyKey}`,
    ]);

    const existing = (
      await client.query(
        'SELECT id,total_amount "totalAmount",order_status "orderStatus",payment_status "paymentStatus",order_source "orderSource",request_hash FROM orders WHERE outlet_id=$1 AND idempotency_key=$2',
        [context.outletId, input.idempotencyKey],
      )
    ).rows[0];
    if (existing) {
      await client.query('COMMIT');
      if (existing.request_hash !== requestHash) {
        throw Object.assign(Error('Idempotency key sudah digunakan untuk payload berbeda'), {
          status: 409,
        });
      }
      return { ...existing, idempotent: true };
    }

    const ids = input.items.map((item) => item.productId);
    const products = (
      await client.query(
        'SELECT id,name,price FROM products WHERE merchant_id=$1 AND outlet_id=$2 AND is_active AND id=ANY($3::uuid[])',
        [context.merchantId, context.outletId, ids],
      )
    ).rows;
    if (products.length !== new Set(ids).size) {
      throw Object.assign(Error('Produk tidak tersedia'), { status: 400 });
    }
    const catalog = new Map(products.map((product) => [product.id, product]));
    let total = 0;
    const lines: any[] = [];
    for (const item of input.items) {
      const product = catalog.get(item.productId);
      const variants = await client.query(
        'SELECT id,group_name,option_name,price_delta FROM product_variants WHERE product_id=$1 AND id=ANY($2::uuid[])',
        [product.id, item.variantIds],
      );
      const addons = await client.query(
        'SELECT id,name,price FROM product_addons WHERE product_id=$1 AND is_active AND id=ANY($2::uuid[])',
        [product.id, item.addonIds],
      );
      const required = await client.query(
        'SELECT DISTINCT group_name FROM product_variants WHERE product_id=$1 AND required',
        [product.id],
      );
      if (
        variants.rows.length !== new Set(item.variantIds).size ||
        addons.rows.length !== new Set(item.addonIds).size ||
        required.rows.some((row) => !variants.rows.some((v) => v.group_name === row.group_name))
      ) {
        throw Object.assign(Error('Kustomisasi produk tidak valid atau pilihan wajib belum lengkap'), {
          status: 400,
        });
      }
      const unit =
        product.price +
        variants.rows.reduce((sum, value) => sum + value.price_delta, 0) +
        addons.rows.reduce((sum, value) => sum + value.price, 0);
      total += unit * item.quantity;
      lines.push({
        item,
        product,
        unit,
        selections: { variants: variants.rows, addons: addons.rows, note: item.notes ?? '' },
      });
    }

    const paid = input.paymentMethod === 'CASH' && options.confirmCash !== undefined;
    if (paid && options.confirmCash! < total) {
      throw Object.assign(Error('Nominal tunai kurang'), { status: 400 });
    }
    const paymentStatus = paid
      ? 'PAID'
      : input.paymentMethod === 'QRIS'
        ? 'PENDING_VERIFICATION'
        : 'UNPAID';
    const orderStatus = paid ? 'NEW_ORDER' : 'AWAITING_PAYMENT';
    const orderSource = context.orderSource ?? 'QR';
    const expiresAt = paid ? null : new Date(Date.now() + 30 * 60_000);
    const trackingToken = randomBytes(32).toString('base64url');
    const changeAmount = paid ? options.confirmCash! - total : null;

    const order = (
      await client.query(
        'INSERT INTO orders(merchant_id,outlet_id,table_id,idempotency_key,request_hash,tracking_token_hash,order_status,payment_status,total_amount,customer_name,order_type,fulfillment_method,order_source,expires_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,total_amount "totalAmount",order_status "orderStatus",payment_status "paymentStatus",order_source "orderSource"',
        [
          context.merchantId,
          context.outletId,
          input.orderType === 'DINE_IN' ? (context.tableId ?? null) : null,
          input.idempotencyKey,
          requestHash,
          hash(trackingToken),
          orderStatus,
          paymentStatus,
          total,
          input.customerName,
          input.orderType,
          input.fulfillmentMethod,
          orderSource,
          expiresAt,
        ],
      )
    ).rows[0];
    for (const line of lines) {
      await client.query(
        'INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity,selections)VALUES($1,$2,$3,$4,$5,$6)',
        [
          order.id,
          line.product.id,
          line.product.name,
          line.unit,
          line.item.quantity,
          JSON.stringify(line.selections),
        ],
      );
    }
    await client.query(
      "INSERT INTO payments(order_id,method,status,amount,cash_received,change_amount,verified_by,paid_at)VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $3='PAID' THEN now() ELSE NULL END)",
      [
        order.id,
        input.paymentMethod,
        paymentStatus,
        total,
        paid ? options.confirmCash! : null,
        changeAmount,
        paid ? (options.verifiedBy ?? null) : null,
      ],
    );
    await client.query('COMMIT');

    publishTenantEvent({
      type: 'order:created',
      merchantId: context.merchantId,
      outletId: context.outletId,
      orderId: order.id,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
    });

    return { ...order, trackingToken, change: paid ? changeAmount! : undefined };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Expires abandoned unpaid checkouts past expires_at and notifies affected subscribers post-commit. */
export async function expireAbandonedOrders(outletId?: string): Promise<number> {
  if (!pool) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expired = (
      await client.query(
        `UPDATE orders
         SET order_status = 'EXPIRED', payment_status = 'EXPIRED', updated_at = now()
         WHERE order_status = 'AWAITING_PAYMENT'
           AND payment_status IN ('UNPAID', 'PENDING_VERIFICATION')
           AND expires_at IS NOT NULL
           AND expires_at < now()
           ${outletId ? 'AND outlet_id = $1' : ''}
         RETURNING id, merchant_id "merchantId", outlet_id "outletId", tracking_token_hash "trackingTokenHash"`,
        outletId ? [outletId] : [],
      )
    ).rows;
    if (expired.length > 0) {
      const ids = expired.map((row) => row.id);
      await client.query(
        "UPDATE payments SET status = 'EXPIRED', updated_at = now() WHERE order_id = ANY($1::uuid[]) AND status IN ('UNPAID', 'PENDING_VERIFICATION')",
        [ids],
      );
    }
    await client.query('COMMIT');

    for (const row of expired) {
      publishTenantEvent({
        type: 'order:expired',
        merchantId: row.merchantId,
        outletId: row.outletId,
        orderId: row.id,
        orderStatus: 'EXPIRED',
        paymentStatus: 'EXPIRED',
      });
      publishTrackingEvent(row.trackingTokenHash, {
        type: 'order:expired',
        orderId: row.id,
        orderStatus: 'EXPIRED',
        paymentStatus: 'EXPIRED',
      });
    }
    return expired.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
