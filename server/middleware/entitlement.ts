import { pool } from '../database/client.ts';

export type MerchantEntitlements = {
  hasSubscription: boolean;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'NONE';
  effectiveActive: boolean;
  planCode: string;
  planName: string;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  qrOrderingEnabled: boolean;
  posEnabled: boolean;
};

export async function getMerchantEntitlements(merchantId: string): Promise<MerchantEntitlements> {
  if (!pool) throw Error('Database tidak tersedia');
  const row = (
    await pool.query(
      `SELECT s.status, s.trial_ends_at "trialEndsAt", s.current_period_ends_at "currentPeriodEndsAt",
              s.qr_ordering_enabled "qrOrderingEnabled", s.pos_enabled "posEnabled",
              p.code "planCode", p.name "planName"
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.merchant_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [merchantId],
    )
  ).rows[0];

  if (!row) {
    return {
      hasSubscription: false,
      status: 'NONE',
      effectiveActive: false,
      planCode: 'none',
      planName: 'Tanpa Paket',
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      qrOrderingEnabled: false,
      posEnabled: false,
    };
  }

  const now = Date.now();
  const trialExpired =
    row.status === 'TRIAL' && row.trialEndsAt ? new Date(row.trialEndsAt).getTime() < now : false;
  const periodExpired =
    row.status === 'ACTIVE' && row.currentPeriodEndsAt
      ? new Date(row.currentPeriodEndsAt).getTime() < now
      : false;
  const effectiveStatus =
    trialExpired || periodExpired ? 'EXPIRED' : (row.status as MerchantEntitlements['status']);
  const effectiveActive = effectiveStatus === 'TRIAL' || effectiveStatus === 'ACTIVE';

  return {
    hasSubscription: true,
    status: effectiveStatus,
    effectiveActive,
    planCode: row.planCode,
    planName: row.planName,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEndsAt: row.currentPeriodEndsAt,
    qrOrderingEnabled: Boolean(row.qrOrderingEnabled),
    posEnabled: Boolean(row.posEnabled),
  };
}
