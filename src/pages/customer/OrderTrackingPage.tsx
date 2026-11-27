import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Printer,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { Order, OrderStatus } from '../../types/pos';
import {
  formatDateTime,
  formatRupiah,
  getFulfillmentLabel,
  getOrderTypeLabel,
  getPaymentMethodLabel,
} from '../../utils/format';
import { BrandMark } from '../../components/BrandMark';
import { DynamicQrisCard } from '../../components/DynamicQrisCard';
import { ReceiptModal, type ReceiptData } from '../../components/ReceiptModal';
import { CashierStatusBadge, PaymentStatusBadge } from '../../components/StatusBadge';

const STEPS: {
  key: OrderStatus;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: 'ORDER_BARU',
    label: 'Pesanan Masuk',
    desc: 'Pembayaran terverifikasi & pesanan masuk antrean barista',
    icon: ClipboardCheck,
  },
  {
    key: 'MEMASAK',
    label: 'Sedang Diproses',
    desc: 'Barista sedang menyiapkan minuman & makanan Anda',
    icon: ChefHat,
  },
  {
    key: 'DISAJIKAN',
    label: 'Pesanan Siap',
    desc: 'Pesanan selesai disiapkan dan siap dinikmati',
    icon: CheckCircle2,
  },
];

function getStepIndex(status: OrderStatus): number {
  if (status === 'ORDER_BARU') return 0;
  if (status === 'MEMASAK') return 1;
  return 2;
}

type TrackedOrder = Order & {
  rawOrderStatus?: string;
  rawPaymentStatus?: string;
  awaitingPayment?: boolean;
  merchantName?: string;
  outletName?: string;
  address?: string;
  whatsapp?: string;
  logoUrl?: string;
  orderSource?: 'QR' | 'POS';
  cashReceived?: number | null;
  changeAmount?: number | null;
  paidAt?: string | null;
  completedAt?: string | null;
  tableQrToken?: string | null;
  paymentProvider?: string | null;
  paymentEnvironment?: string | null;
  providerOrderId?: string | null;
  providerStatus?: string | null;
  qrString?: string | null;
  qrImageUrl?: string | null;
  paymentExpiresAt?: string | null;
  reconciliationStatus?: string | null;
};

export const OrderTrackingPage: React.FC = () => {
  const { orderId, token } = useParams<{ orderId: string; token: string }>();
  const { pushToast } = useToast();
  const [showDetails, setShowDetails] = useState(true);
  const [postgresOrder, setPostgresOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingError, setTrackingError] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState('');

  const refreshTracking = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    const response = await fetch(`/api/public/tracking/${encodeURIComponent(token)}`);
    if (!response.ok) {
      setLoading(false);
      throw new Error('Pesanan tidak ditemukan atau tautan pelacakan sudah tidak berlaku.');
    }
    const value = await response.json();
    const orderStatus: OrderStatus =
      value.orderStatus === 'IN_PROGRESS'
        ? 'MEMASAK'
        : value.orderStatus === 'READY_TO_SERVE'
          ? 'DISAJIKAN'
          : 'ORDER_BARU';

    setPostgresOrder({
      id: value.id,
      createdAt: value.createdAt || new Date().toISOString(),
      updatedAt: value.updatedAt || new Date().toISOString(),
      customerName: value.customerName,
      orderType: value.orderType === 'TAKEAWAY' ? 'TAKEAWAY' : value.tableName ? 'DINE_IN' : 'TAKEAWAY',
      fulfillmentMethod: value.fulfillmentMethod,
      tableName: value.tableName,
      items: (value.items || []).map((item: any) => ({
        productId: '',
        productName: item.productName,
        productImage: '',
        basePrice: item.unitPrice,
        selectedVariants: (item.selections?.variants || []).map((v: any) => ({
          groupId: v.group_name,
          groupName: v.group_name,
          optionId: v.id,
          optionLabel: v.option_name ?? v.optionName ?? '',
          priceDelta: v.price_delta ?? 0,
        })),
        selectedToppings: (item.selections?.addons || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          price: a.price,
        })),
        quantity: item.quantity,
        notes: item.selections?.note || '',
        unitPrice: item.unitPrice,
        subtotal: item.unitPrice * item.quantity,
      })),
      totalAmount: value.totalAmount,
      paymentMethod:
        value.paymentMethod === 'CASH'
          ? 'CASHIER'
          : value.paymentMethod === 'QRIS_DYNAMIC'
            ? 'QRIS_DYNAMIC'
            : 'QRIS',
      paymentStatus:
        value.paymentStatus === 'PAID'
          ? 'LUNAS'
          : value.paymentStatus === 'FAILED' || value.paymentStatus === 'EXPIRED'
            ? 'GAGAL'
            : 'BELUM_DIBAYAR',
      orderStatus,
      cashierStatus: orderStatus === 'DISAJIKAN' ? 'SELESAI' : 'AKTIF',
      rawOrderStatus: value.orderStatus,
      rawPaymentStatus: value.paymentStatus,
      awaitingPayment: value.orderStatus === 'AWAITING_PAYMENT',
      merchantName: value.merchantName,
      outletName: value.outletName,
      address: value.address,
      whatsapp: value.whatsapp,
      logoUrl: value.logoUrl,
      orderSource: value.orderSource,
      cashReceived: value.cashReceived,
      changeAmount: value.changeAmount,
      paidAt: value.paidAt,
      completedAt: value.completedAt,
      tableQrToken: value.tableQrToken,
      paymentProvider: value.paymentProvider ?? null,
      paymentEnvironment: value.paymentEnvironment ?? null,
      providerOrderId: value.providerOrderId ?? null,
      providerStatus: value.providerStatus ?? null,
      qrString: value.qrString ?? null,
      qrImageUrl: value.qrImageUrl ?? null,
      paymentExpiresAt: value.paymentExpiresAt ?? null,
      reconciliationStatus: value.reconciliationStatus ?? null,
    });
    setTrackingError('');
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void refreshTracking().catch((error) => {
      setTrackingError(error instanceof Error ? error.message : 'Gagal memuat pesanan.');
      setLoading(false);
    });

    if (typeof EventSource === 'undefined') return;
    let connectedBefore = false;
    const es = new EventSource(`/api/public/tracking/${encodeURIComponent(token)}/events`);
    const refresh = () => {
      void refreshTracking().catch(() => {});
    };
    es.addEventListener('connected', () => {
      if (connectedBefore) refresh();
      connectedBefore = true;
    });
    ['payment:confirmed', 'order:updated', 'order:cancelled', 'order:refunded', 'order:expired'].forEach((ev) => {
      es.addEventListener(ev, refresh);
    });

    // Fallback poll every 20s when tab is visible in case proxy drops SSE silently
    const fallbackTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 20_000);

    return () => {
      es.close();
      window.clearInterval(fallbackTimer);
    };
  }, [token, refreshTracking]);

  const order = postgresOrder;
  const backToMenuUrl = postgresOrder?.tableQrToken
    ? `/q/${encodeURIComponent(postgresOrder.tableQrToken)}`
    : '/';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] p-5 flex items-center justify-center" aria-busy="true">
        <div className="w-full max-w-2xl space-y-4 animate-pulse">
          <div className="h-40 rounded-2xl bg-[#1B4D3E]/85" />
          <div className="h-64 rounded-2xl bg-white border border-[#E8E6DF]" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#252525] flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-[#E8E6DF] bg-white p-7 text-center">
          <div className="flex justify-center">
            <BrandMark logoUrl="" size="md" />
          </div>
          <h1 className="mt-4 text-lg font-extrabold text-[#252525]">Pesanan Tidak Ditemukan</h1>
          <p className="mt-2 text-sm text-[#5C5952] leading-relaxed">
            {trackingError || `Nomor pesanan ${orderId ?? ''} belum ditemukan di server.`}
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            {token && (
              <button
                type="button"
                onClick={() => void refreshTracking()}
                className="w-full min-h-[44px] rounded-xl border border-[#1B4D3E] bg-white px-4 py-2.5 text-sm font-bold text-[#1B4D3E] hover:bg-[#EEF4F1]"
              >
                Muat Ulang Data Pesanan
              </button>
            )}
            <Link
              to="/"
              className="w-full min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#143B2F]"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isTerminalCancelled =
    postgresOrder?.rawOrderStatus === 'CANCELLED' ||
    postgresOrder?.rawOrderStatus === 'EXPIRED' ||
    postgresOrder?.rawPaymentStatus === 'REFUNDED';

  const activeStepIdx =
    postgresOrder?.awaitingPayment || isTerminalCancelled ? -1 : getStepIndex(order.orderStatus);
  const isServed = !postgresOrder?.awaitingPayment && !isTerminalCancelled && order.orderStatus === 'DISAJIKAN';
  const brandName = postgresOrder?.merchantName || 'Outlet';
  const brandLogo = postgresOrder?.logoUrl ?? '';
  const shortOrderCode = `#${order.id.slice(0, 8).toUpperCase()}`;

  const servedMessage =
    order.fulfillmentMethod === 'TABLE_SERVICE'
      ? 'Pesanan Anda sudah diantar ke meja. Selamat menikmati!'
      : 'Pesanan Anda sudah siap. Silakan ambil di counter.';

  const receiptData: ReceiptData = {
    id: order.id,
    merchantName: brandName,
    outletName: postgresOrder?.outletName,
    address: postgresOrder?.address,
    whatsapp: postgresOrder?.whatsapp,
    logoUrl: brandLogo,
    customerName: order.customerName,
    orderType: order.orderType,
    fulfillmentMethod: order.fulfillmentMethod,
    orderSource: postgresOrder?.orderSource ?? 'QR',
    tableName: order.tableName ?? null,
    orderStatus: postgresOrder?.rawOrderStatus ?? order.orderStatus,
    paymentStatus: postgresOrder?.rawPaymentStatus ?? order.paymentStatus,
    method:
      order.paymentMethod === 'CASHIER'
        ? 'CASH'
        : order.paymentMethod === 'QRIS_DYNAMIC'
          ? 'QRIS_DYNAMIC'
          : 'QRIS',
    paymentProvider: postgresOrder?.paymentProvider,
    paymentEnvironment: postgresOrder?.paymentEnvironment,
    providerOrderId: postgresOrder?.providerOrderId,
    cashReceived: postgresOrder?.cashReceived,
    changeAmount: postgresOrder?.changeAmount,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    paidAt: postgresOrder?.paidAt,
    completedAt: postgresOrder?.completedAt,
    items: order.items.map((it) => ({
      productName: it.productName,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      selections: {
        variants: it.selectedVariants.map((v) => ({ optionName: v.optionLabel })),
        addons: it.selectedToppings.map((t) => ({ name: t.name })),
        note: it.notes,
      },
    })),
  };

  const handleReconcileTracking = async () => {
    if (!token || reconciling) return;
    setReconciling(true);
    setReconcileMessage('');
    try {
      const response = await fetch(`/api/public/tracking/${encodeURIComponent(token)}/reconcile`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Pengecekan status ke Midtrans gagal.');
      }
      await refreshTracking();
      if (data.paymentStatus === 'PAID') {
        pushToast('Pembayaran QRIS Otomatis terverifikasi!', 'success');
        setReconcileMessage('');
      } else if (data.paymentStatus === 'EXPIRED') {
        setReconcileMessage('Waktu pembayaran QRIS telah berakhir.');
      } else if (data.paymentStatus === 'FAILED') {
        setReconcileMessage('Pembayaran ditolak atau dibatalkan.');
      } else {
        setReconcileMessage('Status di Midtrans masih menunggu pembayaran (pending).');
      }
    } catch (err) {
      setReconcileMessage(err instanceof Error ? err.message : 'Gagal memeriksa status pembayaran.');
    } finally {
      setReconciling(false);
    }
  };

  const handleCopyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525] pb-12">
      {/* Header */}
      <header className="no-print sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to={backToMenuUrl}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B4D3E] hover:underline whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Menu</span>
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <BrandMark logoUrl={brandLogo} size="sm" />
            <span className="text-sm font-extrabold text-[#252525] truncate">{brandName}</span>
          </div>

          <button
            type="button"
            onClick={async () => {
              await refreshTracking();
              pushToast('Status pesanan diperbarui', 'default');
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] text-[#252525] hover:bg-white"
            aria-label="Segarkan status"
            title="Segarkan status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 pt-5 sm:pt-6 space-y-5">
        {/* Top Status Hero Card */}
        <section className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
          <div className="bg-[#1B4D3E] px-5 py-5 sm:px-6 sm:py-6 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/75">Nomor Pesanan</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <h1 className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums">
                    {shortOrderCode}
                  </h1>
                  <button
                    type="button"
                    onClick={() => void handleCopyOrderId()}
                    className="no-print inline-flex items-center gap-1 rounded-lg bg-white/12 px-2 py-1 text-[11px] font-semibold text-white/90 hover:bg-white/20"
                    title="Salin ID lengkap pesanan"
                  >
                    {copiedId ? <Check className="h-3 w-3 text-[#FCD804]" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedId ? 'Tersalin' : 'Salin ID'}</span>
                  </button>
                </div>
                <p className="mt-1 font-mono text-[11px] text-white/60 truncate">{order.id}</p>
              </div>

              {order.orderType === 'DINE_IN' && order.tableName ? (
                <div className="rounded-xl bg-[#FCD804] px-3.5 py-2 text-center text-[#252525] shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Meja</div>
                  <div className="font-mono text-lg font-extrabold leading-none tabular-nums">
                    {order.tableName}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold text-white shrink-0">
                  Takeaway
                </div>
              )}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/85">
              <span className="font-semibold text-white">{order.customerName}</span>
              <span aria-hidden="true">·</span>
              <span>{getOrderTypeLabel(order.orderType)}</span>
              <span aria-hidden="true">·</span>
              <span>{getFulfillmentLabel(order.fulfillmentMethod)}</span>
            </div>
          </div>

          {isServed && (
            <div role="status" className="bg-[#FCD804] px-5 py-3.5 sm:px-6 text-[#252525] flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-[#1B4D3E]" />
              <p className="text-xs sm:text-sm font-extrabold leading-snug">{servedMessage}</p>
            </div>
          )}

          {/* Progress Tracker */}
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-[#252525]">Progres Pesanan</h2>
              <span className="font-mono text-[11px] text-[#5C5952] tabular-nums">
                {formatDateTime(order.updatedAt)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5" aria-hidden="true">
              {STEPS.map((s, idx) => (
                <div key={s.key} className="space-y-1.5">
                  <div
                    className={`h-2 rounded-full transition-colors duration-200 ${
                      idx <= activeStepIdx ? 'bg-[#1B4D3E]' : 'bg-[#E8E6DF]'
                    }`}
                  />
                  <div
                    className={`text-[11px] font-bold truncate ${
                      idx <= activeStepIdx ? 'text-[#1B4D3E]' : 'text-[#8C8980]'
                    }`}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              {STEPS.map((stepItem, idx) => {
                const Icon = stepItem.icon;
                const isCompleted = idx <= activeStepIdx;
                const isCurrent = idx === activeStepIdx;

                return (
                  <div
                    key={stepItem.key}
                    className={`flex items-start gap-3.5 rounded-xl border p-3.5 sm:p-4 transition-colors duration-200 ${
                      isCurrent
                        ? 'border-[#1B4D3E] bg-[#EEF4F1]'
                        : isCompleted
                          ? 'border-[#E8E6DF] bg-[#FAF9F6]'
                          : 'border-[#E8E6DF] bg-white opacity-55'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl ${
                        isCurrent
                          ? 'bg-[#1B4D3E] text-[#FCD804]'
                          : isCompleted
                            ? 'bg-[#1B4D3E]/15 text-[#1B4D3E]'
                            : 'bg-[#F2EFE9] text-[#8C8980]'
                      }`}
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-[#252525]">{stepItem.label}</span>
                        {isCurrent && (
                          <span className="text-[11px] font-bold text-[#1B4D3E] whitespace-nowrap">Saat Ini</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#5C5952] leading-relaxed">{stepItem.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E6DF] pt-4 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={order.paymentStatus} />
                <CashierStatusBadge status={order.cashierStatus} />
              </div>
              <span className="font-semibold text-[#252525]">
                {getPaymentMethodLabel(order.paymentMethod, order.paymentSubMethod)}
              </span>
            </div>

            {order.paymentMethod === 'QRIS_DYNAMIC' && order.paymentStatus !== 'LUNAS' && (
              <div className="mt-4">
                <DynamicQrisCard
                  merchantName={brandName}
                  amount={order.totalAmount}
                  providerOrderId={postgresOrder?.providerOrderId}
                  qrString={postgresOrder?.qrString}
                  qrImageUrl={postgresOrder?.qrImageUrl}
                  expiresAt={postgresOrder?.paymentExpiresAt}
                  environment={postgresOrder?.paymentEnvironment ?? 'SANDBOX'}
                  status={
                    postgresOrder?.rawOrderStatus === 'EXPIRED' || postgresOrder?.rawPaymentStatus === 'EXPIRED'
                      ? 'EXPIRED'
                      : postgresOrder?.rawPaymentStatus === 'FAILED' || postgresOrder?.rawOrderStatus === 'CANCELLED'
                        ? 'FAILED'
                        : 'PENDING'
                  }
                  reconciling={reconciling}
                  reconcileMessage={reconcileMessage}
                  onReconcile={() => void handleReconcileTracking()}
                />
              </div>
            )}

            {order.paymentMethod !== 'QRIS_DYNAMIC' && order.paymentStatus === 'BELUM_DIBAYAR' && !isTerminalCancelled && (
              <div role="status" className="mt-3 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-4 py-3 text-xs text-[#7C4106] leading-relaxed">
                {order.paymentMethod === 'QRIS' ? (
                  <>
                    Pembayaran QRIS untuk pesanan <strong className="font-mono">{shortOrderCode}</strong> sedang menunggu verifikasi merchant sebelum masuk antrean barista.
                  </>
                ) : (
                  <>
                    Silakan tunjukkan nomor pesanan <strong className="font-mono">{shortOrderCode}</strong> dan lakukan pembayaran di kasir.
                  </>
                )}
              </div>
            )}

            {isTerminalCancelled && (
              <div role="alert" className="mt-3 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-xs font-semibold text-[#A62626]">
                {postgresOrder?.rawPaymentStatus === 'REFUNDED'
                  ? 'Pesanan ini telah dibatalkan dan pembayaran telah di-refund.'
                  : postgresOrder?.rawOrderStatus === 'EXPIRED'
                    ? 'Batas waktu pembayaran telah berakhir (kedaluwarsa). Silakan buat pesanan baru.'
                    : 'Pesanan ini telah dibatalkan oleh outlet.'}
              </div>
            )}
          </div>
        </section>

        {/* Order Detail Receipt Card */}
        <section className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="w-full flex items-center justify-between px-5 sm:px-6 py-4 text-left hover:bg-[#FAF9F6] transition-colors"
          >
            <div>
              <h2 className="text-sm font-bold text-[#252525]">Detail Menu Pesanan</h2>
              <p className="text-xs text-[#5C5952]">
                {order.items.reduce((s, i) => s + i.quantity, 0)} item · Total Nett{' '}
                <span className="font-mono font-semibold text-[#252525] tabular-nums">
                  {formatRupiah(order.totalAmount)}
                </span>
              </p>
            </div>
            {showDetails ? (
              <ChevronUp className="h-4 w-4 text-[#5C5952] shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#5C5952] shrink-0" />
            )}
          </button>

          {showDetails && (
            <div className="border-t border-[#E8E6DF] px-5 sm:px-6 py-4 sm:py-5 space-y-4">
              <ul className="divide-y divide-[#F0EEE8]">
                {order.items.map((item, idx) => (
                  <li key={idx} className="py-3 first:pt-0 last:pb-0 flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#252525]">
                        <span className="font-mono text-[#1B4D3E] mr-1.5 tabular-nums">{item.quantity}x</span>
                        {item.productName}
                      </div>
                      {(item.selectedVariants.length > 0 || item.selectedToppings.length > 0) && (
                        <p className="mt-0.5 text-xs text-[#5C5952] leading-relaxed">
                          {[
                            ...item.selectedVariants.map((v) => v.optionLabel),
                            ...item.selectedToppings.map((t) => `+ ${t.name}`),
                          ].join(' · ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-0.5 text-xs italic text-[#5C5952]">Catatan: "{item.notes}"</p>
                      )}
                    </div>
                    <span className="font-mono text-xs sm:text-sm font-semibold text-[#252525] tabular-nums shrink-0">
                      {formatRupiah(item.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-[#E8E6DF] pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#252525]">Total Pembayaran (Nett)</span>
                  <span className="font-mono text-base sm:text-lg font-extrabold text-[#1B4D3E] tabular-nums">
                    {formatRupiah(order.totalAmount)}
                  </span>
                </div>
                {postgresOrder?.paidAt && (
                  <div className="flex items-center justify-between text-xs text-[#5C5952]">
                    <span>Struk Digital · Terverifikasi</span>
                    <span className="font-mono tabular-nums">{formatDateTime(postgresOrder.paidAt)}</span>
                  </div>
                )}
                {order.paymentStatus === 'LUNAS' && (
                  <button
                    type="button"
                    onClick={() => setReceiptModalOpen(true)}
                    className="no-print mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#1B4D3E]/30 bg-[#EEF4F1] px-3.5 py-2 text-xs font-bold text-[#1B4D3E] hover:bg-[#1B4D3E] hover:text-white transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Cetak / Simpan Struk Digital</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {postgresOrder?.tableQrToken && (
          <Link
            to={backToMenuUrl}
            className="no-print w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-3 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Pesan Lagi di Meja Ini</span>
          </Link>
        )}

        <p className="text-center text-xs text-[#5C5952] leading-relaxed">
          Status pesanan tersinkron otomatis secara real-time dengan antrean {brandName}.
        </p>
      </main>

      <ReceiptModal receipt={receiptModalOpen ? receiptData : null} onClose={() => setReceiptModalOpen(false)} />
    </div>
  );
};
