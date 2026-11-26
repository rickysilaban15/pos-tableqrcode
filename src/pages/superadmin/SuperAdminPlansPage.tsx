import React, { useState } from 'react';
import { CreditCard, Edit3, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOverview, type PlanRow } from './useOverview';
import { formatRpFull } from './utils';
import { useToast } from '../../context/ToastContext';

function PlanCard({
  plan,
  onSaved,
}: {
  plan: PlanRow;
  onSaved: () => void;
}) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    trialDays: plan.trialDays,
    isActive: plan.isActive,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/super-admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      pushToast(`Paket ${form.name} diperbarui`, 'success');
      setEditing(false);
      onSaved();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const PLAN_ACCENT: Record<string, string> = {
    basic: 'from-blue-500/20 to-blue-900/10 border-blue-500/20',
    pro: 'from-purple-500/20 to-purple-900/10 border-purple-500/20',
    business: 'from-[#FCD804]/20 to-[#FCD804]/5 border-[#FCD804]/20',
  };

  const accent = PLAN_ACCENT[plan.code] ?? 'from-white/8 to-white/3 border-white/8';

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${accent}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {editing ? (
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-base font-bold text-white w-full focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
            />
          ) : (
            <h3 className="text-base font-bold text-white">{plan.name}</h3>
          )}
          <p className="text-xs text-white/40 mt-0.5 uppercase tracking-wider font-mono">{plan.code}</p>
        </div>
        <div className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${plan.isActive ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' : 'bg-white/5 text-white/30 border-white/8'}`}>
          {plan.isActive ? 'Aktif' : 'Nonaktif'}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Harga Bulanan (Rp)</label>
            <input
              type="number"
              min={1000}
              value={form.monthlyPrice}
              onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: parseInt(e.target.value) || 0 }))}
              className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Trial Days</label>
            <input
              type="number"
              min={1}
              max={90}
              value={form.trialDays}
              onChange={(e) => setForm((f) => ({ ...f, trialDays: parseInt(e.target.value) || 14 }))}
              className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`active-${plan.id}`}
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor={`active-${plan.id}`} className="text-sm text-white/70">Paket aktif (tersedia untuk pendaftaran)</label>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setEditing(false); setForm({ name: plan.name, monthlyPrice: plan.monthlyPrice, trialDays: plan.trialDays, isActive: plan.isActive }); }}
              className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/50 hover:text-white transition-colors flex items-center justify-center gap-1.5"
            >
              <X className="h-4 w-4" /> Batal
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="flex-1 rounded-xl bg-[#FCD804] py-2 text-sm font-bold text-[#252525] hover:bg-[#EFCB00] transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-white">{formatRpFull(plan.monthlyPrice)}</span>
              <span className="text-xs text-white/40">/bulan</span>
            </div>
            <p className="text-xs text-white/50">{plan.trialDays} hari trial gratis</p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded-xl bg-white/8 border border-white/10 py-2 text-sm text-white/70 hover:text-white hover:bg-white/12 transition-colors flex items-center justify-center gap-2"
          >
            <Edit3 className="h-4 w-4" /> Edit Paket
          </button>
        </>
      )}
    </div>
  );
}

export const SuperAdminPlansPage: React.FC = () => {
  const { data, loading, error, reload } = useOverview();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
        {[0, 1, 2].map((i) => <div key={i} className="h-48 rounded-2xl bg-white/5" />)}
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

  const plans = data?.plans ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Paket & Harga</h1>
        <p className="text-sm text-white/40 mt-0.5">Kelola paket langganan platform</p>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/8 p-10 text-center">
          <CreditCard className="h-10 w-10 mx-auto mb-3 text-white/20" />
          <p className="text-sm text-white/30">Belum ada paket terdaftar di database.</p>
          <p className="text-xs text-white/20 mt-1">Jalankan migrasi database untuk menambahkan paket default.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} onSaved={() => void reload()} />
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-white/3 border border-white/5 p-4">
        <p className="text-xs text-white/30 leading-relaxed">
          <strong className="text-white/50">Catatan:</strong> Harga paket bersifat informatif. 
          Platform belum terintegrasi dengan payment gateway untuk tagihan SaaS otomatis. 
          Semua perpanjangan dilakukan secara manual oleh Super Admin.
        </p>
      </div>
    </div>
  );
};
