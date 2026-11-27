import { randomBytes } from 'node:crypto';
import { pool } from '../../database/client.ts';
import { getMidtransReadiness } from '../../config/env.ts';
import {
  chargeMidtransDynamicQris,
  fetchMidtransTransactionStatus,
} from '../payments/midtrans.ts';

export interface CreateSubscriptionInvoiceInput {
  merchantId: string;
  actorUserId: string;
  planCode: string;
  billingPeriodDays?: number;
}

export async function expireOverdueSubscriptionInvoices(merchantId?: string): Promise<number> {
  if (!pool) return 0;
  const res = await pool.query(
    `UPDATE subscription_invoices
     SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'PENDING_PAYMENT'
       AND expires_at IS NOT NULL
       AND expires_at < now()
       ${merchantId ? 'AND merchant_id = $1' : ''}`,
    merchantId ? [merchantId] : [],
  );
  return res.rowCount ?? 0;
}

export async function listMerchantSubscriptionInvoices(merchantId: string) {
  if (!pool) throw new Error('Database tidak tersedia');
  await expireOverdueSubscriptionInvoices(merchantId).catch(() => 0);
  const rows = (
    await pool.query(
      `SELECT i.id, i.invoice_number AS "invoiceNumber", i.status, i.amount, i.currency,
              i.billing_period_days AS "billingPeriodDays", i.provider, i.environment,
              i.provider_order_id AS "providerOrderId", i.provider_status AS "providerStatus",
              i.qr_string AS "qrString", i.qr_image_url AS "qrImageUrl",
              i.expires_at AS "expiresAt", i.paid_at AS "paidAt",
              i.activated_period_start AS "activatedPeriodStart",
              i.activated_period_end AS "activatedPeriodEnd",
              i.created_at AS "createdAt",
              p.code AS "planCode", p.name AS "planName"
       FROM subscription_invoices i
       JOIN subscription_plans p ON p.id = i.plan_id
       WHERE i.merchant_id = $1
       ORDER BY i.created_at DESC
       LIMIT 25`,
      [merchantId],
    )
  ).rows;
  return rows;
}

export async function createSubscriptionInvoice(
  input: CreateSubscriptionInvoiceInput,
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  if (!pool) throw new Error('Database tidak tersedia');
  await expireOverdueSubscriptionInvoices(input.merchantId).catch(() => 0);

  const billingDays = Math.min(365, Math.max(30, input.billingPeriodDays ?? 30));
  const months = Math.max(1, Math.round(billingDays / 30));

  const [merchantRow, planRow, existingPending, currentSub] = await Promise.all([
    pool.query('SELECT id, name, slug FROM merchants WHERE id = $1', [input.merchantId]),
    pool.query(
      'SELECT id, code, name, monthly_price AS "monthlyPrice" FROM subscription_plans WHERE code = $1 AND is_active = true',
      [input.planCode.trim().toLowerCase()],
    ),
    pool.query(
      `SELECT i.id, i.invoice_number AS "invoiceNumber", i.status, i.amount, i.currency,
              i.billing_period_days AS "billingPeriodDays", i.provider, i.environment,
              i.provider_order_id AS "providerOrderId", i.provider_status AS "providerStatus",
              i.qr_string AS "qrString", i.qr_image_url AS "qrImageUrl",
              i.expires_at AS "expiresAt", i.created_at AS "createdAt",
              p.code AS "planCode", p.name AS "planName"
       FROM subscription_invoices i
       JOIN subscription_plans p ON p.id = i.plan_id
       WHERE i.merchant_id = $1 AND i.status = 'PENDING_PAYMENT' AND (i.expires_at IS NULL OR i.expires_at > now())
       ORDER BY i.created_at DESC LIMIT 1`,
      [input.merchantId],
    ),
    pool.query(
      'SELECT id FROM subscriptions WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [input.merchantId],
    ),
  ]);

  const merchant = merchantRow.rows[0];
  if (!merchant) throw Object.assign(new Error('Merchant tidak ditemukan'), { status: 404 });
  const plan = planRow.rows[0];
  if (!plan) throw Object.assign(new Error('Paket langganan tidak tersedia'), { status: 400 });

  // Prevent duplicate active pending invoice spam while an unpaid valid invoice exists for the same plan
  const activeInvoice = existingPending.rows[0];
  if (activeInvoice && activeInvoice.planCode === plan.code) {
    return { ...activeInvoice, reusedExisting: true };
  }

  const amount = Number(plan.monthlyPrice) * months;
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randSuffix = randomBytes(3).toString('hex').toUpperCase();
  const invoiceNumber = `WKP-SUB-${datePart}-${randSuffix}`;
  const providerOrderId = invoiceNumber;

  const readiness = getMidtransReadiness(rawEnv);
  const useMidtransSandbox = readiness.ready;
  const defaultExpiry = new Date(Date.now() + (useMidtransSandbox ? 30 * 60_000 : 24 * 60 * 60_000));

  const created = (
    await pool.query(
      `INSERT INTO subscription_invoices(
         merchant_id, subscription_id, plan_id, invoice_number, status, amount, currency,
         billing_period_days, provider, environment, provider_order_id, expires_at, created_by
       ) VALUES($1, $2, $3, $4, 'PENDING_PAYMENT', $5, 'IDR', $6, $7, 'SANDBOX', $8, $9, $10)
       RETURNING id, invoice_number AS "invoiceNumber", status, amount, currency,
                 billing_period_days AS "billingPeriodDays", provider, environment,
                 provider_order_id AS "providerOrderId", expires_at AS "expiresAt",
                 created_at AS "createdAt"`,
      [
        merchant.id,
        currentSub.rows[0]?.id ?? null,
        plan.id,
        invoiceNumber,
        amount,
        billingDays,
        useMidtransSandbox ? 'MIDTRANS' : 'MANUAL_INVOICE',
        useMidtransSandbox ? providerOrderId : null,
        defaultExpiry,
        input.actorUserId,
      ],
    )
  ).rows[0];

  await pool.query(
    `INSERT INTO audit_logs(merchant_id, actor_user_id, action, entity_type, entity_id, payload)
     VALUES($1, $2, 'SUBSCRIPTION_INVOICE_CREATED', 'subscription_invoice', $3, $4::jsonb)`,
    [
      merchant.id,
      input.actorUserId,
      created.id,
      JSON.stringify({
        invoiceNumber,
        planCode: plan.code,
        amount,
        provider: created.provider,
        environment: 'SANDBOX',
      }),
    ],
  );

  if (!useMidtransSandbox) {
    return {
      ...created,
      planCode: plan.code,
      planName: plan.name,
      qrString: null,
      qrImageUrl: null,
    };
  }

  try {
    const charge = await chargeMidtransDynamicQris(
      {
        providerOrderId,
        grossAmount: amount,
        customerName: merchant.name,
        expiryMinutes: 30,
        items: [
          {
            id: `plan-${plan.code}`,
            name: `Langganan WarkopOS ${plan.name}`.slice(0, 50),
            price: amount,
            quantity: 1,
          },
        ],
      },
      rawEnv,
      fetchImpl,
    );

    const updated = (
      await pool.query(
        `UPDATE subscription_invoices
         SET provider_transaction_id = $1,
             provider_status = $2,
             qr_string = $3,
             qr_image_url = $4,
             expires_at = $5,
             metadata = $6::jsonb,
             updated_at = now()
         WHERE id = $7
         RETURNING id, invoice_number AS "invoiceNumber", status, amount, currency,
                   billing_period_days AS "billingPeriodDays", provider, environment,
                   provider_order_id AS "providerOrderId", provider_status AS "providerStatus",
                   qr_string AS "qrString", qr_image_url AS "qrImageUrl",
                   expires_at AS "expiresAt", created_at AS "createdAt"`,
        [
          charge.providerTransactionId,
          charge.providerStatus,
          charge.qrString,
          charge.qrImageUrl,
          charge.expiresAt,
          JSON.stringify(charge.providerMetadata),
          created.id,
        ],
      )
    ).rows[0];

    return {
      ...updated,
      planCode: plan.code,
      planName: plan.name,
    };
  } catch (err) {
    await pool.query(
      `UPDATE subscription_invoices
       SET status = 'CANCELLED', metadata = $1::jsonb, updated_at = now()
       WHERE id = $2`,
      [JSON.stringify({ error: err instanceof Error ? err.message : 'Charge gagal' }), created.id],
    );
    throw err;
  }
}

async function finalizeSubscriptionInvoiceVerification(
  invoiceId: string,
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  invoiceId: string;
  merchantId: string;
  status: string;
  outcome: 'ACTIVATED' | 'ALREADY_PAID' | 'PENDING' | 'EXPIRED' | 'FAILED' | 'QUARANTINED';
} | null> {
  if (!pool) throw new Error('Database tidak tersedia');
  const inv = (
    await pool.query(
      `SELECT id, merchant_id AS "merchantId", subscription_id AS "subscriptionId",
              plan_id AS "planId", invoice_number AS "invoiceNumber", status, amount,
              billing_period_days AS "billingPeriodDays", provider, environment,
              provider_order_id AS "providerOrderId"
       FROM subscription_invoices
       WHERE id = $1`,
      [invoiceId],
    )
  ).rows[0];

  if (!inv) return null;
  if (inv.status === 'PAID') {
    return { invoiceId: inv.id, merchantId: inv.merchantId, status: 'PAID', outcome: 'ALREADY_PAID' };
  }
  if (inv.provider !== 'MIDTRANS' || !inv.providerOrderId) {
    return { invoiceId: inv.id, merchantId: inv.merchantId, status: inv.status, outcome: 'PENDING' };
  }

  const remote = await fetchMidtransTransactionStatus(inv.providerOrderId, rawEnv, fetchImpl);
  if (!remote.found) {
    return { invoiceId: inv.id, merchantId: inv.merchantId, status: inv.status, outcome: 'PENDING' };
  }

  if (remote.orderId !== inv.providerOrderId || remote.grossAmountInt !== inv.amount) {
    await pool.query(
      `UPDATE subscription_invoices
       SET provider_status = $1, metadata = metadata || $2::jsonb, updated_at = now()
       WHERE id = $3`,
      [
        remote.transactionStatus,
        JSON.stringify({ quarantineReason: 'Order ID or gross_amount mismatch' }),
        inv.id,
      ],
    );
    return { invoiceId: inv.id, merchantId: inv.merchantId, status: inv.status, outcome: 'QUARANTINED' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = (
      await client.query('SELECT * FROM subscription_invoices WHERE id = $1 FOR UPDATE', [inv.id])
    ).rows[0];
    if (!locked) {
      await client.query('ROLLBACK');
      return null;
    }
    if (locked.status === 'PAID') {
      await client.query('COMMIT');
      return { invoiceId: locked.id, merchantId: locked.merchant_id, status: 'PAID', outcome: 'ALREADY_PAID' };
    }

    if (remote.disposition === 'SETTLED') {
      const subRow = (
        await client.query(
          'SELECT id, current_period_ends_at FROM subscriptions WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
          [locked.merchant_id],
        )
      ).rows[0];

      const now = new Date();
      const existingEnd = subRow?.current_period_ends_at ? new Date(subRow.current_period_ends_at) : null;
      const periodStart = existingEnd && existingEnd > now ? existingEnd : now;
      const periodEnd = new Date(periodStart.getTime() + Number(locked.billing_period_days) * 24 * 60 * 60_000);

      let activeSubId = subRow?.id ?? null;
      if (subRow) {
        await client.query(
          `UPDATE subscriptions
           SET plan_id = $1,
               status = 'ACTIVE',
               qr_ordering_enabled = true,
               pos_enabled = true,
               current_period_ends_at = $2,
               updated_at = now()
           WHERE id = $3`,
          [locked.plan_id, periodEnd, subRow.id],
        );
      } else {
        const insertedSub = (
          await client.query(
            `INSERT INTO subscriptions(merchant_id, plan_id, status, qr_ordering_enabled, pos_enabled, current_period_ends_at)
             VALUES($1, $2, 'ACTIVE', true, true, $3) RETURNING id`,
            [locked.merchant_id, locked.plan_id, periodEnd],
          )
        ).rows[0];
        activeSubId = insertedSub.id;
      }

      await client.query(
        `UPDATE subscription_invoices
         SET status = 'PAID',
             subscription_id = $1,
             provider_transaction_id = COALESCE(provider_transaction_id, $2),
             provider_status = $3,
             paid_at = COALESCE($4, now()),
             activated_period_start = $5,
             activated_period_end = $6,
             updated_at = now()
         WHERE id = $7`,
        [
          activeSubId,
          remote.transactionId,
          remote.transactionStatus,
          remote.settlementTime,
          periodStart,
          periodEnd,
          locked.id,
        ],
      );

      await client.query(
        `INSERT INTO audit_logs(merchant_id, action, entity_type, entity_id, payload)
         VALUES($1, 'SUBSCRIPTION_INVOICE_PAID_ACTIVATED', 'subscription_invoice', $2, $3::jsonb)`,
        [
          locked.merchant_id,
          locked.id,
          JSON.stringify({
            invoiceNumber: locked.invoice_number,
            providerOrderId: locked.provider_order_id,
            amount: locked.amount,
            periodEnd: periodEnd.toISOString(),
          }),
        ],
      );

      await client.query('COMMIT');
      return { invoiceId: locked.id, merchantId: locked.merchant_id, status: 'PAID', outcome: 'ACTIVATED' };
    }

    if (remote.disposition === 'EXPIRED') {
      await client.query(
        "UPDATE subscription_invoices SET status = 'EXPIRED', provider_status = $1, updated_at = now() WHERE id = $2",
        [remote.transactionStatus, locked.id],
      );
      await client.query('COMMIT');
      return { invoiceId: locked.id, merchantId: locked.merchant_id, status: 'EXPIRED', outcome: 'EXPIRED' };
    }

    if (remote.disposition === 'FAILED') {
      await client.query(
        "UPDATE subscription_invoices SET status = 'CANCELLED', provider_status = $1, updated_at = now() WHERE id = $2",
        [remote.transactionStatus, locked.id],
      );
      await client.query('COMMIT');
      return { invoiceId: locked.id, merchantId: locked.merchant_id, status: 'CANCELLED', outcome: 'FAILED' };
    }

    await client.query(
      'UPDATE subscription_invoices SET provider_status = $1, updated_at = now() WHERE id = $2',
      [remote.transactionStatus, locked.id],
    );
    await client.query('COMMIT');
    return { invoiceId: locked.id, merchantId: locked.merchant_id, status: locked.status, outcome: 'PENDING' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function reconcileSubscriptionInvoiceForMerchant(
  invoiceId: string,
  merchantId: string,
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  if (!pool) throw new Error('Database tidak tersedia');
  const row = (
    await pool.query('SELECT id FROM subscription_invoices WHERE id = $1 AND merchant_id = $2', [
      invoiceId,
      merchantId,
    ])
  ).rows[0];
  if (!row) throw Object.assign(new Error('Invoice langganan tidak ditemukan'), { status: 404 });
  const result = await finalizeSubscriptionInvoiceVerification(row.id, rawEnv, fetchImpl);
  if (!result) throw Object.assign(new Error('Invoice langganan tidak ditemukan'), { status: 404 });
  return result;
}

export async function reconcileSubscriptionInvoiceByProviderOrderId(
  providerOrderId: string,
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  if (!pool) throw new Error('Database tidak tersedia');
  const row = (
    await pool.query('SELECT id FROM subscription_invoices WHERE provider_order_id = $1', [providerOrderId])
  ).rows[0];
  if (!row) return null;
  return finalizeSubscriptionInvoiceVerification(row.id, rawEnv, fetchImpl);
}
