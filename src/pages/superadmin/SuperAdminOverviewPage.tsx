import React from 'react';
import {
  Store,
  TrendingUp,
  Clock,
  AlertTriangle,
  ShoppingCart,
  DollarSign,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOverview } from './useOverview';
import { formatRp, formatDate } from './utils';
import { SubStatusBadge } from './SubStatusBadge';

const MetricCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}> = ({ label, value, sub, icon: Icon, accent }) => (
  <div className="rounded-2xl bg-white/5 border border-white/8 p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{label}</p>
        <p className="mt-2 text-2xl font-extrabold text-white">{value}</p>
        {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
      </div>
      <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

export const SuperAdminOverviewPage: React.FC = () => {
  const { data, loading, error, reload } = useOverview();

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/8" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-white/5 border border-white/8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-400/20 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-300">{error}</p>
        <button
          onClick={() => void reload()}
          className="mt-4 inline-flex items-center gap-2 text-sm text-red-300 hover:text-red-200"
        >
          <RefreshCw className="h-4 w-4" /> Coba lagi
        </button>
      </div>
    );
  }

  if (!data) return null;
  const { metrics, merchants, audits } = data;

  const recentMerchants = merchants.slice(0, 5);
  const recentAudits = audits.slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Platform Overview</h1>
          <p className="text-sm text-white/40 mt-0.5">Metrik real-time platform SaaS</p>
        </div>
        <button
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/12 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Merchants"
          value={metrics.totalMerchants.toString()}
          icon={Store}
          accent="bg-[#FCD804]/15 text-[#FCD804]"
        />
        <MetricCard
          label="Active Subscriptions"
          value={metrics.activeSubscriptions.toString()}
          sub={`${metrics.trialSubscriptions} trial`}
          icon={TrendingUp}
          accent="bg-emerald-500/15 text-emerald-400"
        />
        <MetricCard
          label="Inactive / Expired"
          value={metrics.inactiveSubscriptions.toString()}
          icon={AlertTriangle}
          accent="bg-orange-500/15 text-orange-400"
        />
        <MetricCard
          label="MRR"
          value={formatRp(metrics.mrr)}
          sub={`${metrics.totalPaidOrders.toLocaleString('id-ID')} paid orders`}
          icon={DollarSign}
          accent="bg-blue-500/15 text-blue-400"
        />
      </div>

      {/* GMV card */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1B4D3E]/60 to-[#0D2B22]/60 border border-[#FCD804]/15 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Total GMV (all time)</p>
            <p className="mt-2 text-3xl font-extrabold text-[#FCD804]">{formatRp(metrics.totalGmv)}</p>
          </div>
          <ShoppingCart className="h-10 w-10 text-[#FCD804]/30" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent merchants */}
        <div className="rounded-2xl bg-white/5 border border-white/8">
          <div className="flex items-center justify-between p-5 border-b border-white/8">
            <h2 className="text-sm font-bold text-white">Merchant Terbaru</h2>
            <Link
              to="/super-admin/merchants"
              className="inline-flex items-center gap-1 text-xs text-[#FCD804]/80 hover:text-[#FCD804] transition-colors"
            >
              Lihat semua <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {recentMerchants.length === 0 && (
              <p className="p-5 text-sm text-white/30">Belum ada merchant terdaftar.</p>
            )}
            {recentMerchants.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                  <p className="text-xs text-white/40 truncate">{m.ownerEmail ?? '—'}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <SubStatusBadge status={m.subscriptionStatus} />
                  <span className="text-xs text-white/30">{formatDate(m.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent audit log */}
        <div className="rounded-2xl bg-white/5 border border-white/8">
          <div className="flex items-center justify-between p-5 border-b border-white/8">
            <h2 className="text-sm font-bold text-white">Audit Log Terbaru</h2>
            <Link
              to="/super-admin/audit"
              className="inline-flex items-center gap-1 text-xs text-[#FCD804]/80 hover:text-[#FCD804] transition-colors"
            >
              Lihat semua <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {recentAudits.length === 0 && (
              <p className="p-5 text-sm text-white/30">Belum ada aktivitas audit.</p>
            )}
            {recentAudits.map((a) => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <code className="text-xs font-mono text-[#FCD804]/70 break-all">{a.action}</code>
                  <span className="text-xs text-white/30 shrink-0">{formatDate(a.createdAt)}</span>
                </div>
                {(a.merchantName || a.actorEmail) && (
                  <p className="mt-0.5 text-xs text-white/40">
                    {a.actorEmail ?? 'system'} → {a.merchantName ?? a.entityId}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
