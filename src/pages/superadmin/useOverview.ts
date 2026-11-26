import { useCallback, useEffect, useState } from 'react';

export interface OverviewMetrics {
  totalMerchants: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  inactiveSubscriptions: number;
  totalPaidOrders: number;
  totalGmv: number;
  mrr: number;
}

export interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  qrOrderingEnabled: boolean;
  posEnabled: boolean;
  planCode: string | null;
  planName: string | null;
  monthlyPrice: number | null;
  paidOrders: number;
  paidRevenue: number;
}

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number;
  trialDays: number;
  isActive: boolean;
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  merchantName: string | null;
  actorEmail: string | null;
}

export interface OverviewData {
  metrics: OverviewMetrics;
  merchants: MerchantRow[];
  plans: PlanRow[];
  audits: AuditRow[];
}

export function useOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/super-admin/overview');
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}
