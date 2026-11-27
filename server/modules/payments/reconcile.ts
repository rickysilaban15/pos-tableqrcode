import { pool } from '../../database/client.ts';
import { publishTenantEvent, publishTrackingEvent } from '../events/bus.ts';
import { fetchMidtransTransactionStatus } from './midtrans.ts';

export type ReconcileOutcome =
  | 'SETTLED'
  | 'ALREADY_FINALIZED'
  | 'PENDING'
  | 'EXPIRED'
  | 'FAILED'
  | 'REFUNDED'
  | 'SETTLED_AFTER_CANCEL_REQUIRES_REFUND'
  | 'QUARANTINED_MISMATCH'
  | 'COOLDOWN_CACHED';

export interface ReconcileOrderResult {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  providerStatus: string | null;
  reconciliationStatus: string;
  outcome: ReconcileOutcome;
  paidAt: string | null;
  expiresAt: string | null;
}

const RECONCILE_COOLDOWN_MS = 1500;

/**
 * Reconciles a Midtrans Dynamic QRIS order payment by querying Midtrans Get Transaction Status API
 * outside of any open database transaction, validating ownership & gross amount, and applying an
 * atomic row-locked PostgreSQL update before emitting SSE events.
 */
export async function reconcileOrderDynamicPayment(
  lookup: {
    orderId?: string;
    merchantId?: string;
    outletId?: string;
    trackingTokenHash?: string;
    providerOrderId?: string;
    bypassCooldown?: boolean;
  },
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ReconcileOrderResult> {
  if (!pool) throw new Error('Database tidak tersedia');

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (lookup.orderId) {
    params.push(lookup.orderId);
    whereClauses.push(`o.id = $${params.length}`);
  }
  if (lookup.merchantId) {
    params.push(lookup.merchantId);
    whereClauses.push(`o.merchant_id = $${params.length}`);
  }
  if (lookup.outletId) {
    params.push(lookup.outletId);
    whereClauses.push(`o.outlet_id = $${params.length}`);
  }
  if (lookup.trackingTokenHash) {
    params.push(lookup.trackingTokenHash);
    whereClauses.push(`o.tracking_token_hash = $${params.length}`);
  }
  if (lookup.providerOrderId) {
    params.push(lookup.providerOrderId);
    whereClauses.push(`p.provider_order_id = $${params.length}`);
  }

  if (whereClauses.length === 0) {
    throw Object.assign(new Error('Parameter rekonsiliasi tidak valid'), { status: 400 });
  }

  // 1. Read stored payment target WITHOUT holding a DB transaction open during external HTTP call
  const initial = (
    await pool.query(
      `SELECT o.id AS "orderId", o.merchant_id AS "merchantId", o.outlet_id AS "outletId",
              o.order_status AS "orderStatus", o.payment_status AS "paymentStatus",
              o.total_amount AS "totalAmount", o.expires_at AS "orderExpiresAt",
              p.id AS "paymentId", p.method, p.provider, p.status AS "pStatus",
              p.provider_order_id AS "providerOrderId",
              p.provider_transaction_id AS "providerTransactionId",
              p.provider_status AS "providerStatus",
              p.expected_gross_amount AS "expectedGrossAmount",
              p.environment, p.reconciliation_status AS "reconciliationStatus",
              p.last_reconciled_at AS "lastReconciledAt",
              p.paid_at AS "paidAt", p.expires_at AS "paymentExpiresAt"
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE ${whereClauses.join(' AND ')}
       LIMIT 1`,
      params,
    )
  ).rows[0];

  if (!initial) {
    throw Object.assign(new Error('Transaksi pembayaran tidak ditemukan'), { status: 404 });
  }

  if (initial.method !== 'QRIS_DYNAMIC' || initial.provider !== 'MIDTRANS' || !initial.providerOrderId) {
    throw Object.assign(
      new Error('Rekonsiliasi penyedia hanya berlaku untuk transaksi QRIS Otomatis (Midtrans).'),
      { status: 400 },
    );
  }

  // Already settled or refunded -> return authoritative terminal status without overwriting
  if (initial.pStatus === 'PAID' || initial.pStatus === 'REFUNDED') {
    return {
      orderId: initial.orderId,
      orderStatus: initial.orderStatus,
      paymentStatus: initial.paymentStatus,
      providerStatus: initial.providerStatus,
      reconciliationStatus: initial.reconciliationStatus,
      outcome: 'ALREADY_FINALIZED',
      paidAt: initial.paidAt ? new Date(initial.paidAt).toISOString() : null,
      expiresAt: initial.paymentExpiresAt ? new Date(initial.paymentExpiresAt).toISOString() : null,
    };
  }

  // Cooldown guard for rapid browser refresh clicks (skipped on webhooks)
  if (
    !lookup.bypassCooldown &&
    initial.lastReconciledAt &&
    Date.now() - new Date(initial.lastReconciledAt).getTime() < RECONCILE_COOLDOWN_MS
  ) {
    return {
      orderId: initial.orderId,
      orderStatus: initial.orderStatus,
      paymentStatus: initial.paymentStatus,
      providerStatus: initial.providerStatus,
      reconciliationStatus: initial.reconciliationStatus,
      outcome: 'COOLDOWN_CACHED',
      paidAt: initial.paidAt ? new Date(initial.paidAt).toISOString() : null,
      expiresAt: initial.paymentExpiresAt ? new Date(initial.paymentExpiresAt).toISOString() : null,
    };
  }

  // 2. Query authoritative Midtrans Get Transaction Status API outside DB transaction
  const remote = await fetchMidtransTransactionStatus(initial.providerOrderId, rawEnv, fetchImpl);

  if (!remote.found) {
    await pool.query('UPDATE payments SET last_reconciled_at = now(), updated_at = now() WHERE id = $1', [
      initial.paymentId,
    ]);
    return {
      orderId: initial.orderId,
      orderStatus: initial.orderStatus,
      paymentStatus: initial.paymentStatus,
      providerStatus: initial.providerStatus,
      reconciliationStatus: initial.reconciliationStatus,
      outcome: 'PENDING',
      paidAt: null,
      expiresAt: initial.paymentExpiresAt ? new Date(initial.paymentExpiresAt).toISOString() : null,
    };
  }

  // 3. Apply atomic row-locked DB state transition & post-commit SSE notifications
  const client = await pool.connect();
  let sseEvent: {
    type: 'payment:confirmed' | 'order:expired' | 'order:cancelled' | 'order:refunded';
    merchantId: string;
    outletId: string;
    trackingTokenHash: string | null;
    orderId: string;
    orderStatus: string;
    paymentStatus: string;
  } | null = null;

  try {
    await client.query('BEGIN');
    const locked = (
      await client.query(
        `SELECT o.id AS "orderId", o.merchant_id AS "merchantId", o.outlet_id AS "outletId",
                o.order_status AS "orderStatus", o.payment_status AS "paymentStatus",
                o.total_amount AS "totalAmount", o.tracking_token_hash AS "trackingTokenHash",
                p.id AS "paymentId", p.status AS "pStatus",
                p.provider_order_id AS "providerOrderId",
                p.provider_transaction_id AS "providerTransactionId",
                p.provider_status AS "providerStatus",
                p.expected_gross_amount AS "expectedGrossAmount",
                p.environment, p.reconciliation_status AS "reconciliationStatus",
                p.paid_at AS "paidAt", p.expires_at AS "paymentExpiresAt",
                p.provider_metadata AS "providerMetadata"
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         WHERE o.id = $1
         FOR UPDATE`,
        [initial.orderId],
      )
    ).rows[0];

    if (!locked) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Pesanan tidak ditemukan'), { status: 404 });
    }

    // Never allow a delayed pending/expire/cancel notification to overwrite a settled/refunded order
    if (
      (locked.pStatus === 'PAID' || locked.pStatus === 'REFUNDED') &&
      remote.disposition !== 'REFUNDED'
    ) {
      await client.query('COMMIT');
      return {
        orderId: locked.orderId,
        orderStatus: locked.orderStatus,
        paymentStatus: locked.paymentStatus,
        providerStatus: locked.providerStatus,
        reconciliationStatus: locked.reconciliationStatus,
        outcome: 'ALREADY_FINALIZED',
        paidAt: locked.paidAt ? new Date(locked.paidAt).toISOString() : null,
        expiresAt: locked.paymentExpiresAt ? new Date(locked.paymentExpiresAt).toISOString() : null,
      };
    }

    // Strict consistency verification: order_id, transaction_id, gross_amount, payment_type, currency, environment
    const mismatchReasons: string[] = [];
    if (remote.orderId !== locked.providerOrderId) {
      mismatchReasons.push(`order_id mismatch (${remote.orderId} !== ${locked.providerOrderId})`);
    }
    if (
      locked.providerTransactionId &&
      remote.transactionId &&
      remote.transactionId !== locked.providerTransactionId
    ) {
      mismatchReasons.push(
        `transaction_id mismatch (${remote.transactionId} !== ${locked.providerTransactionId})`,
      );
    }
    if (remote.grossAmountInt !== locked.expectedGrossAmount || locked.totalAmount !== locked.expectedGrossAmount) {
      mismatchReasons.push(
        `gross_amount mismatch (${remote.grossAmountRaw} vs expected ${locked.expectedGrossAmount})`,
      );
    }
    if (remote.paymentType && remote.paymentType !== 'qris') {
      mismatchReasons.push(`payment_type mismatch (${remote.paymentType} !== qris)`);
    }
    if (remote.currency && remote.currency.toUpperCase() !== 'IDR') {
      mismatchReasons.push(`currency mismatch (${remote.currency} !== IDR)`);
    }
    if (locked.environment !== 'SANDBOX') {
      mismatchReasons.push(`environment mismatch (${locked.environment} !== SANDBOX)`);
    }

    const updatedMeta = {
      ...(typeof locked.providerMetadata === 'object' && locked.providerMetadata ? locked.providerMetadata : {}),
      lastStatusCode: remote.statusCode,
      lastTransactionStatus: remote.transactionStatus,
      lastFraudStatus: remote.fraudStatus,
      settlementTime: remote.settlementTime ? remote.settlementTime.toISOString() : null,
      providerMerchantId: remote.merchantId,
      acquirer: remote.acquirer,
      ...(mismatchReasons.length > 0 ? { quarantineReasons: mismatchReasons } : {}),
    };

    if (mismatchReasons.length > 0) {
      await client.query(
        `UPDATE payments
         SET reconciliation_status = 'QUARANTINED_MISMATCH',
             provider_status = $1,
             last_reconciled_at = now(),
             provider_metadata = $2::jsonb,
             updated_at = now()
         WHERE id = $3`,
        [remote.transactionStatus, JSON.stringify(updatedMeta), locked.paymentId],
      );
      await client.query(
        `INSERT INTO audit_logs(merchant_id, action, entity_type, entity_id, payload)
         VALUES($1, 'PAYMENT_QUARANTINED_MISMATCH', 'order', $2, $3::jsonb)`,
        [
          locked.merchantId,
          locked.orderId,
          JSON.stringify({ providerOrderId: locked.providerOrderId, reasons: mismatchReasons }),
        ],
      );
      await client.query('COMMIT');
      return {
        orderId: locked.orderId,
        orderStatus: locked.orderStatus,
        paymentStatus: locked.paymentStatus,
        providerStatus: remote.transactionStatus,
        reconciliationStatus: 'QUARANTINED_MISMATCH',
        outcome: 'QUARANTINED_MISMATCH',
        paidAt: null,
        expiresAt: locked.paymentExpiresAt ? new Date(locked.paymentExpiresAt).toISOString() : null,
      };
    }

    // Handle SETTLED
    if (remote.disposition === 'SETTLED') {
      const settledAt = remote.settlementTime ?? new Date();

      if (locked.orderStatus === 'CANCELLED') {
        await client.query(
          `UPDATE payments
           SET provider_status = $1,
               provider_transaction_id = COALESCE(provider_transaction_id, $2),
               paid_at = COALESCE(paid_at, $3),
               reconciliation_status = 'SETTLED_AFTER_CANCEL_REQUIRES_REFUND',
               last_reconciled_at = now(),
               provider_metadata = $4::jsonb,
               updated_at = now()
           WHERE id = $5`,
          [
            remote.transactionStatus,
            remote.transactionId,
            settledAt,
            JSON.stringify(updatedMeta),
            locked.paymentId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(merchant_id, action, entity_type, entity_id, payload)
           VALUES($1, 'PAYMENT_SETTLED_AFTER_CANCEL', 'order', $2, $3::jsonb)`,
          [
            locked.merchantId,
            locked.orderId,
            JSON.stringify({
              providerOrderId: locked.providerOrderId,
              providerTransactionId: remote.transactionId,
              amount: locked.expectedGrossAmount,
            }),
          ],
        );
        await client.query('COMMIT');
        return {
          orderId: locked.orderId,
          orderStatus: 'CANCELLED',
          paymentStatus: locked.paymentStatus,
          providerStatus: remote.transactionStatus,
          reconciliationStatus: 'SETTLED_AFTER_CANCEL_REQUIRES_REFUND',
          outcome: 'SETTLED_AFTER_CANCEL_REQUIRES_REFUND',
          paidAt: settledAt.toISOString(),
          expiresAt: null,
        };
      }

      const reconStatus =
        locked.orderStatus === 'EXPIRED' ? 'LATE_SETTLEMENT_RECOVERED' : 'RECONCILED';

      await client.query(
        `UPDATE payments
         SET status = 'PAID',
             provider_status = $1,
             provider_transaction_id = COALESCE(provider_transaction_id, $2),
             paid_at = COALESCE(paid_at, $3),
             reconciliation_status = $4,
             last_reconciled_at = now(),
             provider_metadata = $5::jsonb,
             updated_at = now()
         WHERE id = $6`,
        [
          remote.transactionStatus,
          remote.transactionId,
          settledAt,
          reconStatus,
          JSON.stringify(updatedMeta),
          locked.paymentId,
        ],
      );

      const nextOrderStatus =
        locked.orderStatus === 'AWAITING_PAYMENT' || locked.orderStatus === 'EXPIRED'
          ? 'NEW_ORDER'
          : locked.orderStatus;

      await client.query(
        `UPDATE orders
         SET payment_status = 'PAID',
             order_status = $1,
             expires_at = NULL,
             updated_at = now()
         WHERE id = $2`,
        [nextOrderStatus, locked.orderId],
      );

      await client.query(
        `INSERT INTO audit_logs(merchant_id, action, entity_type, entity_id, payload)
         VALUES($1, $2, 'order', $3, $4::jsonb)`,
        [
          locked.merchantId,
          reconStatus === 'LATE_SETTLEMENT_RECOVERED'
            ? 'PAYMENT_LATE_SETTLEMENT_RECOVERED'
            : 'PAYMENT_DYNAMIC_QRIS_SETTLED',
          locked.orderId,
          JSON.stringify({
            provider: 'MIDTRANS',
            environment: 'SANDBOX',
            providerOrderId: locked.providerOrderId,
            providerTransactionId: remote.transactionId,
            grossAmount: locked.expectedGrossAmount,
          }),
        ],
      );

      await client.query('COMMIT');

      sseEvent = {
        type: 'payment:confirmed',
        merchantId: locked.merchantId,
        outletId: locked.outletId,
        trackingTokenHash: locked.trackingTokenHash,
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: 'PAID',
      };

      if (sseEvent) {
        publishTenantEvent({
          type: sseEvent.type,
          merchantId: sseEvent.merchantId,
          outletId: sseEvent.outletId,
          orderId: sseEvent.orderId,
          orderStatus: sseEvent.orderStatus,
          paymentStatus: sseEvent.paymentStatus,
        });
        publishTrackingEvent(sseEvent.trackingTokenHash, {
          type: sseEvent.type,
          orderId: sseEvent.orderId,
          orderStatus: sseEvent.orderStatus,
          paymentStatus: sseEvent.paymentStatus,
        });
      }

      return {
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: 'PAID',
        providerStatus: remote.transactionStatus,
        reconciliationStatus: reconStatus,
        outcome: 'SETTLED',
        paidAt: settledAt.toISOString(),
        expiresAt: null,
      };
    }

    // Handle EXPIRED
    if (remote.disposition === 'EXPIRED') {
      const nextOrderStatus = locked.orderStatus === 'AWAITING_PAYMENT' ? 'EXPIRED' : locked.orderStatus;
      const nextPaymentStatus = locked.orderStatus === 'AWAITING_PAYMENT' ? 'EXPIRED' : locked.paymentStatus;

      await client.query(
        `UPDATE payments
         SET status = $1,
             provider_status = $2,
             reconciliation_status = 'EXPIRED',
             last_reconciled_at = now(),
             provider_metadata = $3::jsonb,
             updated_at = now()
         WHERE id = $4`,
        [nextPaymentStatus, remote.transactionStatus, JSON.stringify(updatedMeta), locked.paymentId],
      );
      if (locked.orderStatus === 'AWAITING_PAYMENT') {
        await client.query(
          `UPDATE orders
           SET order_status = 'EXPIRED', payment_status = 'EXPIRED', updated_at = now()
           WHERE id = $1`,
          [locked.orderId],
        );
        sseEvent = {
          type: 'order:expired',
          merchantId: locked.merchantId,
          outletId: locked.outletId,
          trackingTokenHash: locked.trackingTokenHash,
          orderId: locked.orderId,
          orderStatus: 'EXPIRED',
          paymentStatus: 'EXPIRED',
        };
      }
      await client.query('COMMIT');

      if (sseEvent) {
        publishTenantEvent({
          type: sseEvent.type,
          merchantId: sseEvent.merchantId,
          outletId: sseEvent.outletId,
          orderId: sseEvent.orderId,
          orderStatus: sseEvent.orderStatus,
          paymentStatus: sseEvent.paymentStatus,
        });
        publishTrackingEvent(sseEvent.trackingTokenHash, {
          type: sseEvent.type,
          orderId: sseEvent.orderId,
          orderStatus: sseEvent.orderStatus,
          paymentStatus: sseEvent.paymentStatus,
        });
      }

      return {
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: nextPaymentStatus,
        providerStatus: remote.transactionStatus,
        reconciliationStatus: 'EXPIRED',
        outcome: 'EXPIRED',
        paidAt: null,
        expiresAt: locked.paymentExpiresAt ? new Date(locked.paymentExpiresAt).toISOString() : null,
      };
    }

    // Handle FAILED (deny / cancel / failure)
    if (remote.disposition === 'FAILED') {
      const nextOrderStatus = locked.orderStatus === 'AWAITING_PAYMENT' ? 'CANCELLED' : locked.orderStatus;
      const nextPaymentStatus = locked.orderStatus === 'AWAITING_PAYMENT' ? 'FAILED' : locked.paymentStatus;

      await client.query(
        `UPDATE payments
         SET status = $1,
             provider_status = $2,
             reconciliation_status = 'FAILED',
             last_reconciled_at = now(),
             provider_metadata = $3::jsonb,
             updated_at = now()
         WHERE id = $4`,
        [nextPaymentStatus, remote.transactionStatus, JSON.stringify(updatedMeta), locked.paymentId],
      );
      if (locked.orderStatus === 'AWAITING_PAYMENT') {
        await client.query(
          `UPDATE orders
           SET order_status = 'CANCELLED',
               payment_status = 'FAILED',
               cancelled_at = now(),
               cancel_reason = 'Pembayaran QRIS ditolak atau dibatalkan oleh penyedia',
               updated_at = now()
           WHERE id = $1`,
          [locked.orderId],
        );
        sseEvent = {
          type: 'order:cancelled',
          merchantId: locked.merchantId,
          outletId: locked.outletId,
          trackingTokenHash: locked.trackingTokenHash,
          orderId: locked.orderId,
          orderStatus: 'CANCELLED',
          paymentStatus: 'FAILED',
        };
      }
      await client.query('COMMIT');

      if (sseEvent) {
        publishTenantEvent({
          type: sseEvent.type,
          merchantId: sseEvent.merchantId,
          outletId: sseEvent.outletId,
          orderId: sseEvent.orderId,
          orderStatus: sseEvent.orderStatus,
          paymentStatus: sseEvent.paymentStatus,
        });
        publishTrackingEvent(sseEvent.trackingTokenHash, {
          type: sseEvent.type,
          orderId: sseEvent.orderId,
          orderStatus: sseEvent.orderStatus,
          paymentStatus: sseEvent.paymentStatus,
        });
      }

      return {
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: nextPaymentStatus,
        providerStatus: remote.transactionStatus,
        reconciliationStatus: 'FAILED',
        outcome: 'FAILED',
        paidAt: null,
        expiresAt: null,
      };
    }

    // Handle REFUNDED
    if (remote.disposition === 'REFUNDED' && locked.pStatus === 'PAID') {
      const nextOrderStatus = locked.orderStatus === 'READY_TO_SERVE' ? 'READY_TO_SERVE' : 'CANCELLED';
      await client.query(
        `UPDATE payments
         SET status = 'REFUNDED',
             provider_status = $1,
             refunded_at = COALESCE(refunded_at, now()),
             reconciliation_status = 'RECONCILED',
             last_reconciled_at = now(),
             provider_metadata = $2::jsonb,
             updated_at = now()
         WHERE id = $3`,
        [remote.transactionStatus, JSON.stringify(updatedMeta), locked.paymentId],
      );
      await client.query(
        `UPDATE orders
         SET payment_status = 'REFUNDED',
             order_status = $1,
             cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN now() ELSE cancelled_at END,
             updated_at = now()
         WHERE id = $2`,
        [nextOrderStatus, locked.orderId],
      );
      await client.query(
        `INSERT INTO audit_logs(merchant_id, action, entity_type, entity_id, payload)
         VALUES($1, 'PAYMENT_PROVIDER_REFUNDED', 'order', $2, $3::jsonb)`,
        [locked.merchantId, locked.orderId, JSON.stringify({ providerOrderId: locked.providerOrderId })],
      );
      await client.query('COMMIT');

      publishTenantEvent({
        type: 'order:refunded',
        merchantId: locked.merchantId,
        outletId: locked.outletId,
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: 'REFUNDED',
      });
      publishTrackingEvent(locked.trackingTokenHash, {
        type: 'order:refunded',
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: 'REFUNDED',
      });

      return {
        orderId: locked.orderId,
        orderStatus: nextOrderStatus,
        paymentStatus: 'REFUNDED',
        providerStatus: remote.transactionStatus,
        reconciliationStatus: 'RECONCILED',
        outcome: 'REFUNDED',
        paidAt: locked.paidAt ? new Date(locked.paidAt).toISOString() : null,
        expiresAt: null,
      };
    }

    // Default: still PENDING
    await client.query(
      `UPDATE payments
       SET provider_status = $1,
           last_reconciled_at = now(),
           provider_metadata = $2::jsonb,
           updated_at = now()
       WHERE id = $3`,
      [remote.transactionStatus, JSON.stringify(updatedMeta), locked.paymentId],
    );
    await client.query('COMMIT');

    return {
      orderId: locked.orderId,
      orderStatus: locked.orderStatus,
      paymentStatus: locked.paymentStatus,
      providerStatus: remote.transactionStatus,
      reconciliationStatus: locked.reconciliationStatus,
      outcome: 'PENDING',
      paidAt: null,
      expiresAt: locked.paymentExpiresAt ? new Date(locked.paymentExpiresAt).toISOString() : null,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
