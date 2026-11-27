import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../../database/client.ts';
import { publishTenantEvent, publishTrackingEvent } from '../events/bus.ts';
import { chargeMidtransDynamicQris } from '../payments/midtrans.ts';

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
  paymentMethod: 'CASH' | 'QRIS' | 'QRIS_DYNAMIC';
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
  options: { confirmCash?: number; verifiedBy?: string; rawEnv?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
) {
  if (!pool) throw Error('Database tidak tersedia');
  const requestHash = hash(JSON.stringify(input));
  const client = await pool.connect();

  let createdOrder: {
    id: string;
    totalAmount: number;
    orderStatus: string;
    paymentStatus: string;
    orderSource: string;
  } | null = null;
  let paymentId: string | null = null;
  let providerOrderId: string | null = null;
  let trackingToken = '';
  let chargeLines: { id: string; name: string; price: number; quantity: number }[] = [];

  try {
    await client.query('BEGIN');
    // Serialize concurrent retries with the same outlet + idempotencyKey.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${context.outletId}:${input.idempotencyKey}`,
    ]);

    const existing = (
      await client.query(
        `SELECT o.id, o.total_amount "totalAmount", o.order_status "orderStatus",
                o.payment_status "paymentStatus", o.order_source "orderSource",
                o.request_hash,
                p.method "paymentMethod", p.provider, p.environment,
                p.provider_order_id "providerOrderId",
                p.provider_transaction_id "providerTransactionId",
                p.qr_string "qrString", p.qr_image_url "qrImageUrl",
                p.acquirer, p.expires_at "expiresAt",
                p.change_amount "changeAmount"
         FROM orders o
         LEFT JOIN payments p ON p.order_id = o.id
         WHERE o.outlet_id = $1 AND o.idempotency_key = $2`,
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
      const {
        request_hash: _rh,
        changeAmount,
        paymentMethod,
        provider,
        environment,
        providerOrderId: existingProviderOrderId,
        providerTransactionId,
        qrString,
        qrImageUrl,
        acquirer,
        expiresAt,
        ...rest
      } = existing;
      return {
        ...rest,
        paymentMethod,
        change: changeAmount !== null && changeAmount !== undefined ? Number(changeAmount) : undefined,
        ...(paymentMethod === 'QRIS_DYNAMIC'
          ? {
              payment: {
                method: 'QRIS_DYNAMIC' as const,
                provider: provider ?? 'MIDTRANS',
                environment: environment ?? 'SANDBOX',
                providerOrderId: existingProviderOrderId ?? null,
                providerTransactionId: providerTransactionId ?? null,
                qrString: qrString ?? null,
                qrImageUrl: qrImageUrl ?? null,
                acquirer: acquirer ?? 'gopay',
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
              },
            }
          : {}),
        idempotent: true,
      };
    }

    const ids = input.items.map((item) => item.productId);
    const products = (
      await client.query(
        `SELECT p.id, p.name, p.price
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.merchant_id = $1
           AND p.outlet_id = $2
           AND p.is_active = true
           AND (p.category_id IS NULL OR c.is_active = true)
           AND p.id = ANY($3::uuid[])`,
        [context.merchantId, context.outletId, ids],
      )
    ).rows;
    if (products.length !== new Set(ids).size) {
      throw Object.assign(Error('Produk tidak tersedia'), { status: 400 });
    }
    const catalog = new Map(products.map((product) => [product.id, product]));
    let total = 0;
    const lines: {
      item: CheckoutItem;
      product: { id: string; name: string; price: number };
      unit: number;
      selections: {
        variants: { id: string; group_name: string; option_name: string; price_delta: number }[];
        addons: { id: string; name: string; price: number }[];
        note: string;
      };
    }[] = [];

    for (const item of input.items) {
      const product = catalog.get(item.productId)!;
      const variants = await client.query(
        'SELECT id, group_name, option_name, price_delta FROM product_variants WHERE product_id = $1 AND id = ANY($2::uuid[])',
        [product.id, item.variantIds],
      );
      const addons = await client.query(
        'SELECT id, name, price FROM product_addons WHERE product_id = $1 AND is_active = true AND id = ANY($2::uuid[])',
        [product.id, item.addonIds],
      );
      const required = await client.query(
        'SELECT DISTINCT group_name FROM product_variants WHERE product_id = $1 AND required = true',
        [product.id],
      );

      // Enforce single choice per variant group and validate all requested IDs + required groups.
      const chosenGroups = new Set<string>();
      let duplicateGroup = false;
      for (const v of variants.rows) {
        const gKey = String(v.group_name).toLowerCase();
        if (chosenGroups.has(gKey)) {
          duplicateGroup = true;
          break;
        }
        chosenGroups.add(gKey);
      }

      if (
        duplicateGroup ||
        variants.rows.length !== new Set(item.variantIds).size ||
        addons.rows.length !== new Set(item.addonIds).size ||
        required.rows.some((row) => !variants.rows.some((v) => v.group_name === row.group_name))
      ) {
        throw Object.assign(
          Error(
            duplicateGroup
              ? 'Hanya satu opsi yang dapat dipilih pada setiap grup varian'
              : 'Kustomisasi produk tidak valid atau pilihan wajib belum lengkap',
          ),
          { status: 400 },
        );
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

    if (total <= 0) {
      throw Object.assign(Error('Total pesanan harus lebih dari Rp0'), { status: 400 });
    }

    const paid = input.paymentMethod === 'CASH' && options.confirmCash !== undefined;
    if (paid) {
      if (options.confirmCash! < total) {
        throw Object.assign(Error('Nominal tunai kurang'), { status: 400 });
      }
      if (options.confirmCash! > 200_000_000) {
        throw Object.assign(Error('Nominal tunai melebihi batas maksimum transaksi'), { status: 400 });
      }
    }

    const isDynamicQris = input.paymentMethod === 'QRIS_DYNAMIC';
    const paymentStatus = paid
      ? 'PAID'
      : input.paymentMethod === 'QRIS'
        ? 'PENDING_VERIFICATION'
        : 'UNPAID';
    const orderStatus = paid ? 'NEW_ORDER' : 'AWAITING_PAYMENT';
    const orderSource = context.orderSource ?? 'QR';
    const expiresAt = paid ? null : new Date(Date.now() + (isDynamicQris ? 15 * 60_000 : 30 * 60_000));
    trackingToken = randomBytes(32).toString('base64url');
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

    const provider = isDynamicQris
      ? 'MIDTRANS'
      : input.paymentMethod === 'QRIS'
        ? 'MANUAL_STATIC'
        : 'INTERNAL';
    const environment = isDynamicQris ? 'SANDBOX' : 'PRODUCTION';
    const reconciliationStatus = isDynamicQris ? 'PENDING' : 'NOT_APPLICABLE';
    providerOrderId = isDynamicQris
      ? `WKP-ORD-${order.id.slice(0, 8).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`
      : null;

    const insertedPayment = (
      await client.query(
        `INSERT INTO payments(
           order_id, merchant_id, outlet_id, method, provider, provider_order_id, provider_status,
           status, amount, expected_gross_amount, currency, environment, reconciliation_status,
           expires_at, cash_received, change_amount, verified_by, paid_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'IDR',$11,$12,$13,$14,$15,$16,CASE WHEN $8='PAID' THEN now() ELSE NULL END)
         RETURNING id`,
        [
          order.id,
          context.merchantId,
          context.outletId,
          input.paymentMethod,
          provider,
          providerOrderId,
          isDynamicQris ? 'initiating' : null,
          paymentStatus,
          total,
          total,
          environment,
          reconciliationStatus,
          expiresAt,
          paid ? options.confirmCash! : null,
          changeAmount,
          paid ? (options.verifiedBy ?? null) : null,
        ],
      )
    ).rows[0];

    await client.query('COMMIT');

    createdOrder = order;
    paymentId = insertedPayment.id;
    chargeLines = lines.map((line, idx) => ({
      id: `${line.product.id.slice(0, 8)}-${idx + 1}`,
      name: line.product.name,
      price: line.unit,
      quantity: line.item.quantity,
    }));

    if (!isDynamicQris) {
      publishTenantEvent({
        type: 'order:created',
        merchantId: context.merchantId,
        outletId: context.outletId,
        orderId: order.id,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      });

      return {
        ...order,
        paymentMethod: input.paymentMethod,
        trackingToken,
        change: paid ? changeAmount! : undefined,
      };
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Dynamic QRIS step 2: Call Midtrans Core API v2 OUTSIDE of any open DB transaction
  try {
    const charge = await chargeMidtransDynamicQris(
      {
        providerOrderId: providerOrderId!,
        grossAmount: createdOrder!.totalAmount,
        customerName: input.customerName,
        items: chargeLines,
        expiryMinutes: 15,
      },
      options.rawEnv ?? process.env,
      options.fetchImpl ?? fetch,
    );

    await pool.query(
      `UPDATE payments
       SET provider_transaction_id = $1,
           provider_status = $2,
           qr_string = $3,
           qr_image_url = $4,
           acquirer = $5,
           expires_at = $6,
           provider_metadata = $7::jsonb,
           updated_at = now()
       WHERE id = $8`,
      [
        charge.providerTransactionId,
        charge.providerStatus,
        charge.qrString,
        charge.qrImageUrl,
        charge.acquirer,
        charge.expiresAt,
        JSON.stringify(charge.providerMetadata),
        paymentId,
      ],
    );

    await pool.query('UPDATE orders SET expires_at = $1, updated_at = now() WHERE id = $2', [
      charge.expiresAt,
      createdOrder!.id,
    ]);

    publishTenantEvent({
      type: 'order:created',
      merchantId: context.merchantId,
      outletId: context.outletId,
      orderId: createdOrder!.id,
      orderStatus: createdOrder!.orderStatus,
      paymentStatus: createdOrder!.paymentStatus,
    });

    return {
      ...createdOrder!,
      paymentMethod: 'QRIS_DYNAMIC' as const,
      trackingToken,
      payment: {
        method: 'QRIS_DYNAMIC' as const,
        provider: 'MIDTRANS' as const,
        environment: 'SANDBOX' as const,
        providerOrderId: charge.providerOrderId,
        providerTransactionId: charge.providerTransactionId,
        qrString: charge.qrString,
        qrImageUrl: charge.qrImageUrl,
        acquirer: charge.acquirer,
        expiresAt: charge.expiresAt.toISOString(),
      },
    };
  } catch (chargeErr) {
    // Cleanly mark failed initiation and release the original idempotency key so customer can retry safely
    await pool
      .query(
        `UPDATE payments
         SET status = 'FAILED',
             provider_status = 'charge_failed',
             reconciliation_status = 'FAILED',
             provider_metadata = $1::jsonb,
             updated_at = now()
         WHERE id = $2`,
        [
          JSON.stringify({
            initiationError: chargeErr instanceof Error ? chargeErr.message : 'Midtrans charge failed',
          }),
          paymentId,
        ],
      )
      .catch(() => {});

    await pool
      .query(
        `UPDATE orders
         SET order_status = 'CANCELLED',
             payment_status = 'FAILED',
             cancelled_at = now(),
             cancel_reason = 'Gagal menginisiasi pembayaran QRIS Otomatis',
             idempotency_key = $1,
             updated_at = now()
         WHERE id = $2`,
        [`${input.idempotencyKey}:failed:${createdOrder!.id.slice(0, 8)}`, createdOrder!.id],
      )
      .catch(() => {});

    throw chargeErr;
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
        `UPDATE payments
         SET status = 'EXPIRED',
             reconciliation_status = CASE WHEN provider = 'MIDTRANS' THEN 'EXPIRED' ELSE reconciliation_status END,
             updated_at = now()
         WHERE order_id = ANY($1::uuid[]) AND status IN ('UNPAID', 'PENDING_VERIFICATION')`,
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
