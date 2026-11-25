import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import type { OrderStatus } from '../../types/pos';
import {
  formatDateTime,
  formatRupiah,
  getFulfillmentLabel,
  getOrderTypeLabel,
  getPaymentMethodLabel,
} from '../../utils/format';
import { BrandMark } from '../../components/BrandMark';
import {
  CashierStatusBadge,
  PaymentStatusBadge,
} from '../../components/StatusBadge';

const STEPS: {
  key: OrderStatus;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: 'ORDER_BARU',
    label: 'Order Masuk',
    desc: 'Pesanan diterima & menunggu konfirmasi barista',
    icon: ClipboardCheck,
  },
  {
    key: 'MEMASAK',
    label: 'Memasak',
    desc: 'Barista sedang menyiapkan minuman & makanan Anda',
    icon: ChefHat,
  },
  {
    key: 'DISAJIKAN',
    label: 'Disajikan',
    desc: 'Pesanan selesai disiapkan dan siap dinikmati',
    icon: CheckCircle2,
  },
];

function getStepIndex(status: OrderStatus): number {
  if (status === 'ORDER_BARU') return 0;
  if (status === 'MEMASAK') return 1;
  return 2;
}

export const OrderTrackingPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const { state, refreshFromServer, pushToast } = usePos();
  const [showDetails, setShowDetails] = useState(true);

  const order = state.orders.find((o) => o.id === orderId);
  const slug = searchParams.get('slug') || state.cafeSettings.slug;
  const tableParam = searchParams.get('table') || order?.tableName || '';
  const tokenParam = searchParams.get('token') || '';

  const backToMenuUrl = (() => {
    const params = new URLSearchParams();
    if (tableParam && order?.orderType !== 'TAKEAWAY') {
      params.set('table', tableParam);
      if (tokenParam) {
        params.set('token', tokenParam);
      } else {
        const tbl = state.tables.find((t) => t.name === tableParam);
        if (tbl) params.set('token', tbl.token);
      }
    } else if (order?.orderType === 'TAKEAWAY') {
      params.set('mode', 'takeaway');
    }
    const qs = params.toString();
    return `/order/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
  })();

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#252525] flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-[#E8E6DF] bg-white p-7 text-center">
          <div className="flex justify-center">
            <BrandMark logoUrl={state.cafeSettings.logoUrl} size="md" />
          </div>
          <h1 className="mt-4 text-lg font-extrabold text-[#252525]">
            Pesanan Tidak Ditemukan
          </h1>
          <p className="mt-2 text-sm text-[#64625C] leading-relaxed">
            Nomor pesanan{' '}
            <span className="font-mono font-semibold text-[#252525]">{orderId}</span> belum ditemukan di server. Coba segarkan halaman atau kembali ke menu.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void refreshFromServer()}
              className="w-full min-h-[44px] rounded-xl border border-[#1B4D3E] bg-white px-4 py-2.5 text-sm font-bold text-[#1B4D3E] hover:bg-[#EEF4F1]"
            >
              Muat Ulang Data Pesanan
            </button>
            <Link
              to={backToMenuUrl}
              className="w-full min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#143B2F]"
            >
              Kembali ke Menu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeStepIdx = getStepIndex(order.orderStatus);
  const isServed = order.orderStatus === 'DISAJIKAN';

  const servedMessage =
    order.fulfillmentMethod === 'TABLE_SERVICE'
      ? 'Pesanan Anda sudah diantar ke meja. Selamat menikmati!'
      : 'Pesanan Anda sudah siap. Silakan ambil di counter.';

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525] pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to={backToMenuUrl}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B4D3E] hover:underline whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Menu</span>
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <BrandMark logoUrl={state.cafeSettings.logoUrl} size="sm" />
            <span className="text-sm font-extrabold text-[#252525] truncate">
              {state.cafeSettings.name}
            </span>
          </div>

          <button
            type="button"
            onClick={async () => {
              await refreshFromServer();
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
                <h1 className="mt-0.5 font-mono text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums truncate">
                  {order.id}
                </h1>
              </div>

              {order.orderType === 'DINE_IN' && order.tableName ? (
                <div className="rounded-xl bg-[#FCD804] px-3.5 py-2 text-center text-[#252525] shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                    Meja
                  </div>
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

          {/* Completion Banner when Served */}
          {isServed && (
            <div className="bg-[#FCD804] px-5 py-3.5 sm:px-6 text-[#252525] flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-[#1B4D3E]" />
              <p className="text-xs sm:text-sm font-extrabold leading-snug">{servedMessage}</p>
            </div>
          )}

          {/* Progress Tracker */}
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-[#252525]">Progres Pesanan</h2>
              <span className="font-mono text-[11px] text-[#64625C] tabular-nums">
                {formatDateTime(order.updatedAt)}
              </span>
            </div>

            {/* Compact 3-segment Horizontal Progress Bar */}
            <div className="grid grid-cols-3 gap-2 mb-5" aria-hidden="true">
              {STEPS.map((s, idx) => (
                <div key={s.key} className="space-y-1.5">
                  <div
                    className={`h-2 rounded-full transition-colors ${
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

            {/* Step Cards */}
            <div className="space-y-2.5">
              {STEPS.map((stepItem, idx) => {
                const Icon = stepItem.icon;
                const isCompleted = idx <= activeStepIdx;
                const isCurrent = idx === activeStepIdx;

                return (
                  <div
                    key={stepItem.key}
                    className={`flex items-start gap-3.5 rounded-xl border p-3.5 sm:p-4 transition-colors ${
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
                        <span className="text-sm font-extrabold text-[#252525]">
                          {stepItem.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-bold text-[#1B4D3E] whitespace-nowrap">
                            Saat Ini
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#64625C] leading-relaxed">
                        {stepItem.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payment & Cashier Status Row */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E6DF] pt-4 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={order.paymentStatus} />
                <CashierStatusBadge status={order.cashierStatus} />
              </div>
              <span className="font-semibold text-[#252525]">
                {getPaymentMethodLabel(order.paymentMethod, order.paymentSubMethod)}
              </span>
            </div>

            {order.paymentStatus === 'BELUM_DIBAYAR' && (
              <div className="mt-3 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-4 py-3 text-xs text-[#7C4106]">
                Silakan tunjukkan nomor pesanan <strong className="font-mono">{order.id}</strong> dan lakukan pembayaran di kasir.
              </div>
            )}
          </div>
        </section>

        {/* Order Detail Receipt Card */}
        <section className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="w-full flex items-center justify-between px-5 sm:px-6 py-4 text-left hover:bg-[#FAF9F6] transition-colors"
          >
            <div>
              <h2 className="text-sm font-bold text-[#252525]">Detail Menu Pesanan</h2>
              <p className="text-xs text-[#64625C]">
                {order.items.reduce((s, i) => s + i.quantity, 0)} item · Total Nett{' '}
                <span className="font-mono font-semibold text-[#252525] tabular-nums">
                  {formatRupiah(order.totalAmount)}
                </span>
              </p>
            </div>
            {showDetails ? (
              <ChevronUp className="h-4 w-4 text-[#64625C] shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625C] shrink-0" />
            )}
          </button>

          {showDetails && (
            <div className="border-t border-[#E8E6DF] px-5 sm:px-6 py-4 sm:py-5 space-y-4">
              <ul className="divide-y divide-[#F0EEE8]">
                {order.items.map((item, idx) => (
                  <li key={idx} className="py-3 first:pt-0 last:pb-0 flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#252525]">
                        <span className="font-mono text-[#1B4D3E] mr-1.5 tabular-nums">
                          {item.quantity}x
                        </span>
                        {item.productName}
                      </div>
                      {(item.selectedVariants.length > 0 ||
                        item.selectedToppings.length > 0) && (
                        <p className="mt-0.5 text-xs text-[#64625C] leading-relaxed">
                          {[
                            ...item.selectedVariants.map((v) => v.optionLabel),
                            ...item.selectedToppings.map((t) => `+ ${t.name}`),
                          ].join(' · ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-0.5 text-xs italic text-[#64625C]">
                          Catatan: "{item.notes}"
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-xs sm:text-sm font-semibold text-[#252525] tabular-nums shrink-0">
                      {formatRupiah(item.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>

              {order.orderNote && (
                <div className="rounded-xl bg-[#FAF9F6] px-4 py-2.5 text-xs text-[#64625C]">
                  Catatan Pesanan:{' '}
                  <span className="font-semibold text-[#252525]">{order.orderNote}</span>
                </div>
              )}

              <div className="border-t border-[#E8E6DF] pt-4 flex items-center justify-between">
                <span className="text-sm font-bold text-[#252525]">Total Pembayaran (Nett)</span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-[#1B4D3E] tabular-nums">
                  {formatRupiah(order.totalAmount)}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Actions */}
        <Link
          to={backToMenuUrl}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-3 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Menu</span>
        </Link>

        <p className="text-center text-xs text-[#64625C] leading-relaxed">
          Status pesanan tersinkron otomatis secara real-time dengan dapur {state.cafeSettings.name}.
        </p>
      </main>
    </div>
  );
};
