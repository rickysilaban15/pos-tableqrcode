import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Clock, XCircle, CreditCard, QrCode, Calculator, RefreshCw } from 'lucide-react';

interface Entitlement {
  hasSubscription: boolean;
  status: string;
  effectiveActive: boolean;
  planCode: string;
  planName: string;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  qrOrderingEnabled: boolean;
  posEnabled: boolean;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string; bg: string }> = {
  TRIAL:     { label: 'Trial Aktif',         icon: Clock,         cls: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
  ACTIVE:    { label: 'Langganan Aktif',      icon: CheckCircle2, cls: 'text-emerald-700', bg: 'bg-[#E9F5EE] border-[#B8E1C8]' },
  EXPIRED:   { label: 'Langganan Kedaluwarsa', icon: XCircle,     cls: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  SUSPENDED: { label: 'Akun Ditangguhkan',    icon: XCircle,     cls: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  CANCELLED: { label: 'Langganan Dibatalkan', icon: XCircle,     cls: 'text-[#64625C]',  bg: 'bg-[#FAF9F6] border-[#E8E6DF]' },
  NONE:      { label: 'Tanpa Langganan',      icon: AlertTriangle, cls: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
};

export const AdminSubscriptionPage: React.FC = () => {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/orders/entitlements');
      if (!r.ok) throw new Error('Gagal memuat info langganan');
      setEnt(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 max-w-xl">
        <div className="h-28 rounded-2xl bg-[#E8E6DF]" />
        <div className="h-40 rounded-2xl bg-[#E8E6DF]" />
      </div>
    );
  }

  if (error || !ent) {
    return (
      <div className="rounded-2xl border border-[#F6C5C5] bg-[#FDECEC] p-6 text-sm text-[#A62626] max-w-xl">
        {error || 'Info langganan tidak tersedia.'}
      </div>
    );
  }

  const cfg = STATUS_CONFIG[ent.status] ?? STATUS_CONFIG['NONE'];
  const StatusIcon = cfg.icon;
  const relevantDate = ent.status === 'TRIAL' ? ent.trialEndsAt : ent.currentPeriodEndsAt;
  const days = daysUntil(relevantDate);

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#252525]">Langganan & Paket</h1>
        <p className="text-sm text-[#64625C] mt-0.5">Informasi paket aktif dan fitur yang tersedia</p>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl border p-5 ${cfg.bg}`}>
        <div className="flex items-start gap-3">
          <StatusIcon className={`h-6 w-6 mt-0.5 shrink-0 ${cfg.cls}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className={`font-bold text-lg ${cfg.cls}`}>{cfg.label}</h2>
              <button
                onClick={() => void load()}
                className="text-xs text-[#64625C] hover:text-[#252525] flex items-center gap-1"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
            <p className="mt-1 text-sm text-[#64625C]">
              Paket: <strong className="text-[#252525]">{ent.planName}</strong>
            </p>
            {relevantDate && (
              <p className="mt-1 text-sm text-[#64625C]">
                {ent.status === 'TRIAL' ? 'Trial berakhir:' : 'Periode berakhir:'}{' '}
                <strong className={days !== null && days <= 7 ? 'text-orange-600' : 'text-[#252525]'}>
                  {formatDate(relevantDate)}
                  {days !== null && ` (${days < 0 ? `${Math.abs(days)} hari yang lalu` : `${days} hari lagi`})`}
                </strong>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Features card */}
      <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-4">
        <h3 className="font-bold text-[#252525]">Fitur Aktif</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`flex items-center gap-3 rounded-xl border p-4 ${ent.qrOrderingEnabled && ent.effectiveActive ? 'border-[#B8E1C8] bg-[#E9F5EE]' : 'border-[#E8E6DF] bg-[#FAF9F6]'}`}>
            <QrCode className={`h-5 w-5 shrink-0 ${ent.qrOrderingEnabled && ent.effectiveActive ? 'text-[#15623A]' : 'text-[#8C8980]'}`} />
            <div>
              <p className={`text-sm font-semibold ${ent.qrOrderingEnabled && ent.effectiveActive ? 'text-[#15623A]' : 'text-[#8C8980]'}`}>
                QR Ordering
              </p>
              <p className="text-xs text-[#64625C]">
                {ent.qrOrderingEnabled && ent.effectiveActive ? 'Aktif' : ent.qrOrderingEnabled ? 'Nonaktif (sub expired)' : 'Tidak termasuk paket'}
              </p>
            </div>
          </div>

          <div className={`flex items-center gap-3 rounded-xl border p-4 ${ent.posEnabled && ent.effectiveActive ? 'border-[#B8E1C8] bg-[#E9F5EE]' : 'border-[#E8E6DF] bg-[#FAF9F6]'}`}>
            <Calculator className={`h-5 w-5 shrink-0 ${ent.posEnabled && ent.effectiveActive ? 'text-[#15623A]' : 'text-[#8C8980]'}`} />
            <div>
              <p className={`text-sm font-semibold ${ent.posEnabled && ent.effectiveActive ? 'text-[#15623A]' : 'text-[#8C8980]'}`}>
                Manual POS
              </p>
              <p className="text-xs text-[#64625C]">
                {ent.posEnabled && ent.effectiveActive ? 'Aktif' : ent.posEnabled ? 'Nonaktif (sub expired)' : 'Tidak termasuk paket'}
              </p>
            </div>
          </div>
        </div>

        {!ent.effectiveActive && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-700">
            <strong>Pesanan yang sudah lunas</strong> tetap dapat diproses melalui menu Pesanan.
            Transaksi baru tidak dapat dibuat hingga langganan diperbarui oleh administrator.
          </div>
        )}
      </div>

      {/* Contact */}
      <div className="rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-5">
        <div className="flex items-start gap-3">
          <CreditCard className="h-5 w-5 mt-0.5 text-[#1B4D3E] shrink-0" />
          <div>
            <h3 className="font-bold text-[#252525]">Perpanjang atau Upgrade Paket</h3>
            <p className="text-sm text-[#64625C] mt-1 leading-relaxed">
              Hubungi administrator platform untuk memperpanjang langganan, upgrade paket,
              atau mengaktifkan fitur tambahan. Perpanjangan dilakukan secara manual oleh admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
