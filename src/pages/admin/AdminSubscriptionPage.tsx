import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  CreditCard,
  QrCode,
  Calculator,
  RefreshCw,
  FileText,
  Loader2,
} from 'lucide-react';
import { formatRupiah } from '../../utils/format';
import { DynamicQrisCard } from '../../components/DynamicQrisCard';

interface PublicPlan {
  code: string;
  name: string;
  monthlyPrice: number;
  trialDays: number;
}

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

interface SubscriptionInvoiceRow {
  id: string;
  invoiceNumber: string;
  planCode: string;
  planName: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED' | string;
  amount: number;
  billingPeriodDays: number;
  provider: 'MANUAL_INVOICE' | 'MIDTRANS' | string;
  environment: string;
  providerOrderId: string | null;
  qrString: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
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
  TRIAL: { label: 'Trial Aktif', icon: Clock, cls: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  ACTIVE: { label: 'Langganan Aktif', icon: CheckCircle2, cls: 'text-emerald-700', bg: 'bg-[#E9F5EE] border-[#B8E1C8]' },
  EXPIRED: { label: 'Langganan Kedaluwarsa', icon: XCircle, cls: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  SUSPENDED: { label: 'Akun Ditangguhkan', icon: XCircle, cls: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  CANCELLED: { label: 'Langganan Dibatalkan', icon: XCircle, cls: 'text-[#64625C]', bg: 'bg-[#FAF9F6] border-[#E8E6DF]' },
  NONE: { label: 'Tanpa Langganan', icon: AlertTriangle, cls: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
};

export const AdminSubscriptionPage: React.FC = () => {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingPlan, setCreatingPlan] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [r, pr, ir] = await Promise.all([
        fetch('/api/v1/orders/entitlements'),
        fetch('/api/public/plans'),
        fetch('/api/v1/subscription/invoices'),
      ]);
      if (!r.ok) throw new Error('Gagal memuat info langganan');
      setEnt(await r.json());
      if (pr.ok) {
        const planRows = await pr.json();
        if (Array.isArray(planRows)) setPlans(planRows);
      }
      if (ir.ok) {
        const invRows = await ir.json();
        if (Array.isArray(invRows)) setInvoices(invRows);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreateInvoice = async (planCode: string) => {
    setCreatingPlan(planCode);
    setBillingMessage('');
    setError('');
    try {
      const r = await fetch('/api/v1/subscription/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode, billingPeriodDays: 30 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Gagal membuat invoice langganan.');
      setBillingMessage(
        data.provider === 'MIDTRANS'
          ? `Invoice ${data.invoiceNumber} dibuat. Selesaikan pembayaran Sandbox untuk mengaktifkan paket.`
          : `Invoice ${data.invoiceNumber} diterbitkan. Langganan baru aktif setelah pembayaran diverifikasi.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat invoice langganan.');
    } finally {
      setCreatingPlan(null);
    }
  };

  const handleReconcileInvoice = async (invoiceId: string) => {
    setReconcilingId(invoiceId);
    setBillingMessage('');
    try {
      const r = await fetch(`/api/v1/subscription/invoices/${invoiceId}/reconcile`, {
        method: 'POST',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Gagal memeriksa status invoice.');
      if (data.status === 'PAID') {
        setBillingMessage('Pembayaran invoice terverifikasi! Paket langganan telah diaktifkan/diperpanjang.');
      } else {
        setBillingMessage(`Status invoice saat ini: ${data.status}.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memeriksa status invoice.');
    } finally {
      setReconcilingId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 max-w-2xl">
        <div className="h-28 rounded-2xl bg-[#E8E6DF]" />
        <div className="h-40 rounded-2xl bg-[#E8E6DF]" />
      </div>
    );
  }

  if (error && !ent) {
    return (
      <div className="rounded-2xl border border-[#F6C5C5] bg-[#FDECEC] p-6 text-sm text-[#A62626] max-w-2xl">
        {error || 'Info langganan tidak tersedia.'}
      </div>
    );
  }

  if (!ent) return null;

  const cfg = STATUS_CONFIG[ent.status] ?? STATUS_CONFIG['NONE'];
  const StatusIcon = cfg.icon;
  const relevantDate = ent.status === 'TRIAL' ? ent.trialEndsAt : ent.currentPeriodEndsAt;
  const days = daysUntil(relevantDate);
  const activePendingInvoice = invoices.find((inv) => inv.status === 'PENDING_PAYMENT');

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#252525]">Langganan & Paket</h1>
        <p className="text-sm text-[#64625C] mt-0.5">
          Informasi paket aktif, fitur operasional, dan tagihan langganan platform WarkopOS
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">
          {error}
        </div>
      )}
      {billingMessage && (
        <div role="status" className="rounded-xl border border-[#B8E1C8] bg-[#E9F5EE] px-4 py-3 text-sm text-[#15623A]">
          {billingMessage}
        </div>
      )}

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
            Transaksi baru tidak dapat dibuat hingga langganan diperbarui.
          </div>
        )}
      </div>

      {/* Available Plans & Separate SaaS Invoice Initiation */}
      {plans.length > 0 && (
        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-3.5">
          <div>
            <h3 className="font-bold text-[#252525]">Pilihan Paket Platform (Tagihan SaaS Terpisah)</h3>
            <p className="text-xs text-[#64625C] mt-0.5">
              Tagihan langganan WarkopOS terpisah sepenuhnya dari transaksi penjualan F&B outlet Anda dan baru aktif setelah pembayaran terverifikasi.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {plans.map((p) => {
              const isCurrent = ent.planCode === p.code;
              return (
                <div
                  key={p.code}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 ${
                    isCurrent ? 'border-[#1B4D3E] bg-[#EEF4F1]' : 'border-[#E8E6DF] bg-[#FAF9F6]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#252525]">{p.name}</span>
                      {isCurrent && (
                        <span className="rounded-md bg-[#1B4D3E] px-2 py-0.5 text-[10px] font-bold text-white">
                          Saat Ini
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 font-mono text-sm font-extrabold text-[#1B4D3E] tabular-nums">
                      {formatRupiah(p.monthlyPrice)}
                      <span className="text-xs font-normal text-[#5C5952]">/30 hari</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(creatingPlan)}
                    onClick={() => void handleCreateInvoice(p.code)}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#1B4D3E] bg-white px-2.5 py-1.5 text-xs font-bold text-[#1B4D3E] hover:bg-[#1B4D3E] hover:text-white disabled:opacity-50 transition-colors"
                  >
                    {creatingPlan === p.code && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isCurrent ? 'Buat Invoice Perpanjang' : `Pilih ${p.name}`}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Pending Subscription Invoice */}
      {activePendingInvoice && activePendingInvoice.provider === 'MIDTRANS' && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#252525]">
            Pembayaran Invoice Langganan ({activePendingInvoice.invoiceNumber})
          </h3>
          <DynamicQrisCard
            compact
            merchantName={`WarkopOS SaaS — Paket ${activePendingInvoice.planName}`}
            amount={activePendingInvoice.amount}
            providerOrderId={activePendingInvoice.providerOrderId}
            qrString={activePendingInvoice.qrString}
            qrImageUrl={activePendingInvoice.qrImageUrl}
            expiresAt={activePendingInvoice.expiresAt}
            environment={activePendingInvoice.environment}
            status="PENDING"
            reconciling={reconcilingId === activePendingInvoice.id}
            onReconcile={() => void handleReconcileInvoice(activePendingInvoice.id)}
          />
        </div>
      )}

      {/* Invoice History */}
      {invoices.length > 0 && (
        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#1B4D3E]" />
            <h3 className="font-bold text-[#252525] text-sm">Riwayat Invoice Langganan</h3>
          </div>
          <div className="divide-y divide-[#E8E6DF] text-xs">
            {invoices.slice(0, 6).map((inv) => (
              <div key={inv.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-[#252525]">{inv.invoiceNumber}</span>
                  <span className="mx-1.5 text-[#CFCBC0]">·</span>
                  <span className="font-semibold text-[#1B4D3E]">Paket {inv.planName}</span>
                  <span className="ml-1.5 rounded border border-[#F6D3AE] bg-[#FEF3E6] px-1.5 py-0.2 font-mono text-[10px] text-[#9A520A]">
                    {inv.environment}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold tabular-nums">{formatRupiah(inv.amount)}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 font-semibold ${
                      inv.status === 'PAID'
                        ? 'bg-[#E9F5EE] text-[#15623A]'
                        : inv.status === 'PENDING_PAYMENT'
                          ? 'bg-[#FEF3E6] text-[#9A520A]'
                          : 'bg-[#FAF9F6] text-[#64625C]'
                    }`}
                  >
                    {inv.status}
                  </span>
                  {inv.status === 'PENDING_PAYMENT' && inv.provider === 'MIDTRANS' && (
                    <button
                      type="button"
                      disabled={reconcilingId === inv.id}
                      onClick={() => void handleReconcileInvoice(inv.id)}
                      className="text-[#1B4D3E] font-bold hover:underline"
                    >
                      Cek Status
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-5">
        <div className="flex items-start gap-3">
          <CreditCard className="h-5 w-5 mt-0.5 text-[#1B4D3E] shrink-0" />
          <div>
            <h3 className="font-bold text-[#252525]">Dukungan Langganan & Aktivasi</h3>
            <p className="text-sm text-[#64625C] mt-1 leading-relaxed">
              Aktivasi langganan secara otomatis hanya terjadi setelah status pembayaran diverifikasi dari penyedia pembayaran atau oleh Super Admin platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
