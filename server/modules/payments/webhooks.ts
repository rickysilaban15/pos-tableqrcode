import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../../database/client.ts';
import { verifyMidtransWebhookSignature } from './midtrans.ts';
import { reconcileOrderDynamicPayment } from './reconcile.ts';
import { reconcileSubscriptionInvoiceByProviderOrderId } from '../subscriptions/service.ts';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function redactNotificationPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...raw };
  if ('signature_key' in copy) {
    copy.signature_key = '[REDACTED]';
  }
  return copy;
}

export const midtransWebhookRouter = Router();

midtransWebhookRouter.post('/midtrans', async (req, res, next) => {
  try {
    if (!pool) throw new Error('Database tidak tersedia');
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
    const statusCode = typeof body.status_code === 'string' ? body.status_code.trim() : '';
    const grossAmount = typeof body.gross_amount === 'string' ? body.gross_amount.trim() : '';
    const txStatus = typeof body.transaction_status === 'string' ? body.transaction_status.trim().toLowerCase() : '';
    const txId = typeof body.transaction_id === 'string' ? body.transaction_id.trim() : '';

    if (!orderId || !statusCode || !grossAmount || !txStatus) {
      return res.status(400).json({ error: 'Payload notifikasi Midtrans tidak lengkap' });
    }

    const sanitizedPayload = redactNotificationPayload(body);
    const sigValid = verifyMidtransWebhookSignature(body);

    if (!sigValid) {
      await pool
        .query(
          `INSERT INTO payment_webhook_events(
             provider, dedupe_key, provider_order_id, provider_transaction_id,
             signature_valid, processing_status, rejection_reason, payload
           ) VALUES('MIDTRANS', $1, $2, $3, false, 'REJECTED', 'Invalid SHA-512 signature_key', $4::jsonb)`,
          [`invalid:${randomUUID()}`, orderId.slice(0, 120), txId || null, JSON.stringify(sanitizedPayload)],
        )
        .catch(() => {});
      return res.status(401).json({ error: 'Signature notifikasi tidak valid' });
    }

    const dedupeKey = sha256(`MIDTRANS:${orderId}:${txStatus}:${statusCode}:${grossAmount}:${txId}`);
    const existingEvent = (
      await pool.query(
        'SELECT id, processing_status AS "processingStatus" FROM payment_webhook_events WHERE dedupe_key = $1',
        [dedupeKey],
      )
    ).rows[0];

    if (
      existingEvent &&
      ['PROCESSED', 'DUPLICATE_IGNORED', 'OUT_OF_ORDER_IGNORED', 'QUARANTINED'].includes(
        existingEvent.processingStatus,
      )
    ) {
      return res.status(200).json({ ok: true, duplicate: true, processingStatus: existingEvent.processingStatus });
    }

    // Route SaaS subscription invoices separately from F&B orders
    if (orderId.startsWith('WKP-SUB-')) {
      const subResult = await reconcileSubscriptionInvoiceByProviderOrderId(orderId);
      if (!subResult) {
        await pool.query(
          `INSERT INTO payment_webhook_events(
             provider, dedupe_key, provider_order_id, provider_transaction_id,
             signature_valid, processing_status, rejection_reason, payload
           ) VALUES('MIDTRANS', $1, $2, $3, true, 'QUARANTINED', 'Unknown subscription invoice provider_order_id', $4::jsonb)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [dedupeKey, orderId, txId || null, JSON.stringify(sanitizedPayload)],
        );
        return res.status(404).json({ error: 'Invoice langganan tidak ditemukan' });
      }
      await pool.query(
        `INSERT INTO payment_webhook_events(
           provider, dedupe_key, provider_order_id, provider_transaction_id,
           merchant_id, signature_valid, processing_status, payload
         ) VALUES('MIDTRANS', $1, $2, $3, $4, true, $5, $6::jsonb)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          dedupeKey,
          orderId,
          txId || null,
          subResult.merchantId,
          subResult.outcome === 'ALREADY_PAID' ? 'OUT_OF_ORDER_IGNORED' : 'PROCESSED',
          JSON.stringify(sanitizedPayload),
        ],
      );
      return res.status(200).json({ ok: true, domain: 'SUBSCRIPTION', outcome: subResult.outcome });
    }

    // F&B Merchant Order Payment Lookup
    const paymentRow = (
      await pool.query(
        `SELECT p.id AS "paymentId", p.order_id AS "orderId", p.status AS "paymentStatus",
                o.merchant_id AS "merchantId"
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.provider = 'MIDTRANS' AND p.provider_order_id = $1
         LIMIT 1`,
        [orderId],
      )
    ).rows[0];

    if (!paymentRow) {
      await pool.query(
        `INSERT INTO payment_webhook_events(
           provider, dedupe_key, provider_order_id, provider_transaction_id,
           signature_valid, processing_status, rejection_reason, payload
         ) VALUES('MIDTRANS', $1, $2, $3, true, 'QUARANTINED', 'Unknown order provider_order_id', $4::jsonb)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [dedupeKey, orderId, txId || null, JSON.stringify(sanitizedPayload)],
      );
      return res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan' });
    }

    // Out-of-order guard: never allow a delayed pending/expire/cancel notification to overwrite PAID
    if (
      (paymentRow.paymentStatus === 'PAID' || paymentRow.paymentStatus === 'REFUNDED') &&
      txStatus !== 'refund' &&
      txStatus !== 'partial_refund'
    ) {
      await pool.query(
        `INSERT INTO payment_webhook_events(
           provider, dedupe_key, provider_order_id, provider_transaction_id,
           merchant_id, payment_id, signature_valid, processing_status, rejection_reason, payload
         ) VALUES('MIDTRANS', $1, $2, $3, $4, $5, true, 'OUT_OF_ORDER_IGNORED', 'Payment already settled/finalized', $6::jsonb)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          dedupeKey,
          orderId,
          txId || null,
          paymentRow.merchantId,
          paymentRow.paymentId,
          JSON.stringify(sanitizedPayload),
        ],
      );
      return res.status(200).json({ ok: true, outOfOrderIgnored: true });
    }

    // Confirm state via authoritative Midtrans Get Status API before mutating financial state
    const reconciled = await reconcileOrderDynamicPayment({
      orderId: paymentRow.orderId,
      merchantId: paymentRow.merchantId,
      bypassCooldown: true,
    });

    const eventStatus =
      reconciled.outcome === 'QUARANTINED_MISMATCH'
        ? 'QUARANTINED'
        : reconciled.outcome === 'ALREADY_FINALIZED'
          ? 'OUT_OF_ORDER_IGNORED'
          : 'PROCESSED';

    await pool.query(
      `INSERT INTO payment_webhook_events(
         provider, dedupe_key, provider_order_id, provider_transaction_id,
         merchant_id, payment_id, signature_valid, processing_status, rejection_reason, payload
       ) VALUES('MIDTRANS', $1, $2, $3, $4, $5, true, $6, $7, $8::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        dedupeKey,
        orderId,
        txId || null,
        paymentRow.merchantId,
        paymentRow.paymentId,
        eventStatus,
        eventStatus === 'QUARANTINED' ? 'Status API verification mismatch' : '',
        JSON.stringify(sanitizedPayload),
      ],
    );

    return res.status(200).json({
      ok: true,
      outcome: reconciled.outcome,
      orderStatus: reconciled.orderStatus,
      paymentStatus: reconciled.paymentStatus,
    });
  } catch (err) {
    next(err);
  }
});
