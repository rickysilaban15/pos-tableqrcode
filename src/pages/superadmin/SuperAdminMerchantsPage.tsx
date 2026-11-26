import React, { useState, useMemo } from 'react';
import {
  Search,
  Store,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  X,
  Check,
  QrCode,
  Calculator,
  Calendar,
  ShoppingCart,
} from 'lucide-react';
import { useOverview, type MerchantRow, type PlanRow } from './useOverview';
import { SubStatusBadge } from './SubStatusBadge';
import { formatRpFull, formatDate, daysUntil } from './utils';
import { useToast } from '../../context/ToastContext';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SUB', label: 'No Subscription' },
];

interface SubEditForm {
  status: string;
  planCode: string;
  qrOrderingEnabled: boolean;
  posEnabled: boolean;
  extendDays: number;
  notes: string;
}

function MerchantDetailPanel({
  merchant,
  plans,
  onClose,
  onSaved,
}: {
  merchant: MerchantRow;
  plans: PlanRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { pushToast } = useToast();
  const [form, setForm] = useState<SubEditForm>({
    status: merchant.subscriptionStatus ?? 'TRIAL',
    planCode: merchant.planCode ?? 'basic',
    qrOrderingEnabled: merchant.qrOrderingEnabled ?? true,
    posEnabled: merchant.posEnabled ?? true,
    extendDays: 0,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/super-admin/merchants/${merchant.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: form.status,
          planCode: form.planCode || undefined,
          qrOrderingEnabled: form.qrOrderingEnabled,
          posEnabled: form.posEnabled,
          extendDays: form.extendDays || undefined,
          notes: form.notes || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      pushToast('Langganan merchant diperbarui', 'success');
      onSaved();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const days = daysUntil(merchant.subscriptionStatus === 'TRIAL' ? merchant.trialEndsAt : merchant.currentPeriodEndsAt);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-[#0D2B22] border border-white/10 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/8">
          <div>
            <h2 className="font-bold text-white text-lg">{merchant.name}</h2>
            <p className="text-xs text-white/40">{merchant.ownerEmail ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 rounded-lg" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info section */}
        <div className="p-5 border-b border-white/8 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-white/40 mb-1">Daftar</p>
              <p className="font-semibold text-white">{formatDate(merchant.createdAt)}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-white/40 mb-1">Status Langganan</p>
              <SubStatusBadge status={merchant.subscriptionStatus} />
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-white/40 mb-1">Paket</p>
              <p className="font-semibold text-white capitalize">{merchant.planName ?? '—'}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-white/40 mb-1">
                {merchant.subscriptionStatus === 'TRIAL' ? 'Trial berakhir' : 'Periode berakhir'}
              </p>
              <p className={`font-semibold ${days !== null && days <= 7 ? 'text-orange-300' : 'text-white'}`}>
                {days !== null ? (days < 0 ? `${Math.abs(days)}h lalu` : `${days}h lagi`) : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-white/40 mb-1">Paid Orders</p>
              <p className="font-semibold text-white">{merchant.paidOrders.toLocaleString('id-ID')}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-white/40 mb-1">Revenue</p>
              <p className="font-semibold text-[#FCD804]">{formatRpFull(merchant.paidRevenue)}</p>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">Update Langganan</h3>

          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Status</label>
              <div className="relative">
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full appearance-none rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
                >
                  {['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'].map((s) => (
                    <option key={s} value={s} className="bg-[#0D2B22]">{s}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              </div>
            </div>

            {/* Plan */}
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Paket</label>
              <div className="relative">
                <select
                  value={form.planCode}
                  onChange={(e) => setForm((f) => ({ ...f, planCode: e.target.value }))}
                  className="w-full appearance-none rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
                >
                  {plans.map((p) => (
                    <option key={p.code} value={p.code} className="bg-[#0D2B22]">
                      {p.name} ({formatRpFull(p.monthlyPrice)}/bln)
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              </div>
            </div>
          </div>

          {/* Extend days */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Perpanjang (hari, 0 = tidak perpanjang)</label>
            <input
              type="number"
              min={0}
              max={365}
              value={form.extendDays}
              onChange={(e) => setForm((f) => ({ ...f, extendDays: Math.max(0, parseInt(e.target.value) || 0) }))}
              className="w-full rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
            />
          </div>

          {/* Feature toggles */}
          <div className="grid grid-cols-2 gap-3">
            <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${form.qrOrderingEnabled ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/8 bg-white/5'}`}>
              <QrCode className={`h-5 w-5 shrink-0 ${form.qrOrderingEnabled ? 'text-emerald-400' : 'text-white/30'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">QR Ordering</p>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${form.qrOrderingEnabled ? 'bg-emerald-500' : 'bg-white/15'}`} onClick={() => setForm((f) => ({ ...f, qrOrderingEnabled: !f.qrOrderingEnabled }))}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.qrOrderingEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>

            <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${form.posEnabled ? 'border-blue-500/30 bg-blue-500/10' : 'border-white/8 bg-white/5'}`}>
              <Calculator className={`h-5 w-5 shrink-0 ${form.posEnabled ? 'text-blue-400' : 'text-white/30'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">Manual POS</p>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${form.posEnabled ? 'bg-blue-500' : 'bg-white/15'}`} onClick={() => setForm((f) => ({ ...f, posEnabled: !f.posEnabled }))}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.posEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Catatan admin (opsional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              maxLength={300}
              placeholder="Alasan perubahan, komunikasi merchant, dll."
              className="w-full rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:border-white/20 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="flex-1 rounded-xl bg-[#FCD804] py-2.5 text-sm font-bold text-[#252525] hover:bg-[#EFCB00] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SuperAdminMerchantsPage: React.FC = () => {
  const { data, loading, error, reload } = useOverview();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<MerchantRow | null>(null);

  const merchants = useMemo(() => {
    if (!data) return [];
    return data.merchants.filter((m) => {
      const matchSearch =
        !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.ownerEmail ?? '').toLowerCase().includes(search.toLowerCase()) ||
        m.slug.toLowerCase().includes(search.toLowerCase());

      const effectiveStatus = m.subscriptionStatus ?? 'NO_SUB';
      const matchStatus = !statusFilter || effectiveStatus === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-64 rounded-xl bg-white/5" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-400/20 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-300">{error}</p>
        <button onClick={() => void reload()} className="mt-4 text-sm text-red-300 hover:text-red-200 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Merchants</h1>
          <p className="text-sm text-white/40 mt-0.5">{data?.merchants.length ?? 0} merchant terdaftar</p>
        </div>
        <button
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white transition-colors self-start"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari merchant, email, slug…"
            className="w-full rounded-xl bg-white/8 border border-white/10 pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-xl bg-white/8 border border-white/10 pl-3 pr-8 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#0D2B22]">{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white/5 border border-white/8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Merchant</th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider hidden md:table-cell">Owner</th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider hidden lg:table-cell">Paket</th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider hidden lg:table-cell">
                  <div className="flex items-center gap-1"><QrCode className="h-3.5 w-3.5" /> QR</div>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider hidden lg:table-cell">
                  <div className="flex items-center gap-1"><Calculator className="h-3.5 w-3.5" /> POS</div>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider hidden xl:table-cell">
                  <div className="flex items-center gap-1"><ShoppingCart className="h-3.5 w-3.5" /> Orders</div>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider hidden xl:table-cell">
                  <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Daftar</div>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {merchants.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-white/30">
                    <Store className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Tidak ada merchant yang cocok
                  </td>
                </tr>
              )}
              {merchants.map((m) => {
                const days = daysUntil(m.subscriptionStatus === 'TRIAL' ? m.trialEndsAt : m.currentPeriodEndsAt);
                const daysLabel = days !== null
                  ? days < 0 ? <span className="text-red-400">{Math.abs(days)}h expired</span>
                  : days <= 7 ? <span className="text-orange-300">{days}h lagi</span>
                  : <span className="text-white/40">{days}h lagi</span>
                  : <span className="text-white/20">—</span>;

                return (
                  <tr key={m.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{m.name}</p>
                      <p className="text-xs text-white/30">{m.slug}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-white/70 text-xs">{m.ownerEmail ?? '—'}</p>
                      <p className="text-white/40 text-xs">{m.ownerName ?? ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <SubStatusBadge status={m.subscriptionStatus} />
                        <span className="text-xs">{daysLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-white/60 text-xs capitalize">{m.planName ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs font-semibold ${m.qrOrderingEnabled ? 'text-emerald-400' : 'text-white/25'}`}>
                        {m.qrOrderingEnabled ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs font-semibold ${m.posEnabled ? 'text-blue-400' : 'text-white/25'}`}>
                        {m.posEnabled ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-white/60 text-xs">{m.paidOrders.toLocaleString('id-ID')}</span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-white/40 text-xs">{formatDate(m.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(m)}
                        className="rounded-lg bg-[#FCD804]/15 border border-[#FCD804]/20 px-3 py-1.5 text-xs font-semibold text-[#FCD804] hover:bg-[#FCD804]/25 transition-colors"
                      >
                        Kelola
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <MerchantDetailPanel
          merchant={selected}
          plans={data?.plans ?? []}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); void reload(); }}
        />
      )}
    </div>
  );
};
