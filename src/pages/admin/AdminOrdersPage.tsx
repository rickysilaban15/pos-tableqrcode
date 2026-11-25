import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ChefHat,
  CheckCircle2,
  Banknote,
  ExternalLink,
  Info,
  RefreshCw,
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import type { Order, OrderStatus } from '../../types/pos';
import {
  formatDateTime,
  formatRupiah,
  getFulfillmentLabel,
  getOrderTypeLabel,
  getPaymentMethodLabel,
} from '../../utils/format';
import {
  CashierStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from '../../components/StatusBadge';

type FilterTab = 'ALL' | OrderStatus;

export const AdminOrdersPage: React.FC = () => {
  const { state, updateOrderStatus, markOrderPaid, refreshFromServer, pushToast } = usePos();
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return {
      ALL: state.orders.length,
      ORDER_BARU: state.orders.filter((o) => o.orderStatus === 'ORDER_BARU').length,
      MEMASAK: state.orders.filter((o) => o.orderStatus === 'MEMASAK').length,
      DISAJIKAN: state.orders.filter((o) => o.orderStatus === 'DISAJIKAN').length,
    };
  }, [state.orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.orders.filter((order) => {
      if (filter !== 'ALL' && order.orderStatus !== filter) return false;
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        (order.tableName?.toLowerCase().includes(q) ?? false) ||
        order.items.some((it) => it.productName.toLowerCase().includes(q))
      );
    });
  }, [state.orders, filter, search]);

  const selectedOrder: Order | undefined = state.orders.find(
    (o) => o.id === selectedOrderId,
  );

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    await updateOrderStatus(orderId, nextStatus);
    if (nextStatus === 'MEMASAK') {
      pushToast(`Pesanan ${orderId} dikonfirmasi & mulai dimasak`, 'success');
    } else if (nextStatus === 'DISAJIKAN') {
      pushToast(`Pesanan ${orderId} disajikan — Transaksi Kasir Selesai`, 'success');
    }
  };

  const handleConfirmCashierPayment = async (orderId: string) => {
    await markOrderPaid(orderId);
    pushToast(`Pembayaran kasir untuk ${orderId} ditandai Lunas`, 'success');
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'ALL', label: 'Semua' },
    { key: 'ORDER_BARU', label: 'Order Baru' },
    { key: 'MEMASAK', label: 'Memasak' },
    { key: 'DISAJIKAN', label: 'Disajikan' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Live Cross-Device Sync Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#E8E6DF] bg-white px-4 sm:px-5 py-3.5 text-xs text-[#64625C]">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-semibold text-[#252525]">Sinkronisasi Real-Time Lintas Perangkat Aktif:</span>{' '}
            Pesanan yang dibuat dari kamera HP customer langsung masuk otomatis ke daftar ini, dan setiap perubahan status langsung memperbarui halaman tracking di HP customer.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await refreshFromServer();
            pushToast('Data pesanan disegarkan dari server', 'default');
          }}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#252525] hover:bg-white transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Segarkan</span>
        </button>
      </div>

      {/* Controls Row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-[#E8E6DF] bg-white p-1">
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#1B4D3E] text-white'
                    : 'text-[#64625C] hover:text-[#252525] hover:bg-[#FAF9F6]'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? 'text-[#FCD804]' : 'text-[#64625C]'
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64625C]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Order ID, nama, meja..."
            className="w-full rounded-xl border border-[#E8E6DF] bg-white py-2.5 pl-10 pr-4 text-sm text-[#252525] placeholder:text-[#8C8980] focus:border-[#1B4D3E] focus:outline-none"
          />
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-12 text-center">
          <p className="text-base font-bold text-[#252525]">Tidak ada pesanan ditemukan</p>
          <p className="mt-1 text-sm text-[#64625C]">
            Ubah filter pencarian atau buat pesanan baru melalui halaman Customer Web.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-[#E8E6DF] bg-white p-5 sm:p-6 transition-colors hover:border-[#D3D0C7]"
            >
              {/* Header Strip */}
              <div className="flex flex-col gap-3 border-b border-[#E8E6DF] pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-mono text-sm font-bold text-[#252525] tabular-nums">
                    {order.id}
                  </span>
                  <span className="text-[#D3D0C7]" aria-hidden="true">·</span>
                  <span className="text-sm font-bold text-[#252525]">{order.customerName}</span>
                  {order.customerWhatsapp && (
                    <>
                      <span className="text-[#D3D0C7]" aria-hidden="true">·</span>
                      <span className="font-mono text-xs text-[#64625C]">{order.customerWhatsapp}</span>
                    </>
                  )}
                  <span className="text-[#D3D0C7]" aria-hidden="true">·</span>
                  <span className="font-mono text-xs text-[#64625C] tabular-nums">
                    {formatDateTime(order.createdAt)}
                  </span>
                </div>

                {/* 3 Separated Statuses: Payment, Order, Cashier */}
                <div className="flex flex-wrap items-center gap-2">
                  <PaymentStatusBadge status={order.paymentStatus} />
                  <OrderStatusBadge status={order.orderStatus} />
                  <CashierStatusBadge status={order.cashierStatus} />
                </div>
              </div>

              {/* Body */}
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                {/* Order Context & Items */}
                <div className="lg:col-span-8 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#64625C]">
                    <span>
                      Jenis:{' '}
                      <strong className="font-semibold text-[#252525]">
                        {getOrderTypeLabel(order.orderType)}
                      </strong>
                    </span>
                    {order.orderType === 'DINE_IN' && order.tableName && (
                      <span>
                        Meja:{' '}
                        <strong className="font-mono font-bold text-[#1B4D3E]">
                          {order.tableName}
                        </strong>
                      </span>
                    )}
                    <span>
                      Penyerahan:{' '}
                      <strong className="font-semibold text-[#252525]">
                        {getFulfillmentLabel(order.fulfillmentMethod)}
                      </strong>
                    </span>
                    <span>
                      Pembayaran:{' '}
                      <strong className="font-semibold text-[#252525]">
                        {getPaymentMethodLabel(order.paymentMethod, order.paymentSubMethod)}
                      </strong>
                    </span>
                  </div>

                  <ul className="divide-y divide-[#F0EEE8] rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4">
                    {order.items.map((item, idx) => (
                      <li key={`${order.id}-item-${idx}`} className="py-2.5 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#252525]">
                            <span className="font-mono text-[#1B4D3E] mr-1.5 tabular-nums">
                              {item.quantity}x
                            </span>
                            {item.productName}
                          </div>
                          {(item.selectedVariants.length > 0 || item.selectedToppings.length > 0) && (
                            <p className="mt-0.5 text-xs text-[#64625C]">
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
                        <div className="font-mono text-xs font-semibold text-[#252525] tabular-nums shrink-0">
                          {formatRupiah(item.subtotal)}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {order.orderNote && (
                    <p className="text-xs text-[#64625C]">
                      Catatan Pesanan:{' '}
                      <span className="font-medium text-[#252525]">{order.orderNote}</span>
                    </p>
                  )}
                </div>

                {/* Right Summary & Actions */}
                <div className="lg:col-span-4 flex flex-col justify-between gap-4 lg:border-l lg:border-[#E8E6DF] lg:pl-5">
                  <div>
                    <p className="text-xs text-[#64625C]">Total Pesanan (Nett)</p>
                    <p className="mt-0.5 font-mono text-xl font-bold text-[#252525] tabular-nums">
                      {formatRupiah(order.totalAmount)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {order.paymentStatus === 'BELUM_DIBAYAR' && (
                      <button
                        type="button"
                        onClick={() => handleConfirmCashierPayment(order.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#1B4D3E] bg-white px-4 py-2.5 text-xs font-bold text-[#1B4D3E] hover:bg-[#EEF4F1] transition-colors whitespace-nowrap"
                      >
                        <Banknote className="h-4 w-4" />
                        <span>Konfirmasi Bayar di Kasir (Lunas)</span>
                      </button>
                    )}

                    {order.orderStatus === 'ORDER_BARU' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(order.id, 'MEMASAK')}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap"
                      >
                        <ChefHat className="h-4 w-4" />
                        <span>Konfirmasi & Mulai Memasak</span>
                      </button>
                    )}

                    {order.orderStatus === 'MEMASAK' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(order.id, 'DISAJIKAN')}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FCD804] px-4 py-2.5 text-xs font-bold text-[#252525] hover:bg-[#E5C400] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Tandai Disajikan</span>
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="text-xs font-semibold text-[#64625C] hover:text-[#252525]"
                      >
                        Detail Struk
                      </button>
                      <Link
                        to={`/order-tracking/${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B4D3E] hover:underline"
                      >
                        <span>Halaman Tracking</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#E8E6DF] bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E6DF] pb-4">
              <div>
                <p className="font-mono text-xs font-semibold text-[#1B4D3E]">
                  {selectedOrder.id}
                </p>
                <h3 className="mt-0.5 text-lg font-bold text-[#252525]">
                  Detail Pesanan — {selectedOrder.customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="rounded-lg border border-[#E8E6DF] px-3 py-1.5 text-xs font-semibold text-[#64625C] hover:bg-[#FAF9F6]"
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[#FAF9F6] p-3">
                <span className="text-[#64625C]">Status Pesanan</span>
                <div className="mt-1.5">
                  <OrderStatusBadge status={selectedOrder.orderStatus} />
                </div>
              </div>
              <div className="rounded-xl bg-[#FAF9F6] p-3">
                <span className="text-[#64625C]">Status Pembayaran & Kasir</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <PaymentStatusBadge status={selectedOrder.paymentStatus} />
                  <CashierStatusBadge status={selectedOrder.cashierStatus} />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs text-[#64625C]">
              <div className="flex justify-between">
                <span>Waktu Order</span>
                <span className="font-mono text-[#252525] tabular-nums">
                  {formatDateTime(selectedOrder.createdAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Jenis & Penyerahan</span>
                <span className="font-semibold text-[#252525]">
                  {getOrderTypeLabel(selectedOrder.orderType)}
                  {selectedOrder.tableName ? ` (Meja ${selectedOrder.tableName})` : ''} ·{' '}
                  {getFulfillmentLabel(selectedOrder.fulfillmentMethod)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Metode Pembayaran</span>
                <span className="font-semibold text-[#252525]">
                  {getPaymentMethodLabel(
                    selectedOrder.paymentMethod,
                    selectedOrder.paymentSubMethod,
                  )}
                </span>
              </div>
            </div>

            <div className="mt-4 border-t border-[#E8E6DF] pt-4 space-y-2.5">
              {selectedOrder.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-[#252525]">
                      {item.quantity}x {item.productName}
                    </p>
                    <p className="text-xs text-[#64625C]">
                      {[
                        ...item.selectedVariants.map((v) => v.optionLabel),
                        ...item.selectedToppings.map((t) => `+ ${t.name}`),
                      ].join(' · ')}
                    </p>
                    {item.notes && (
                      <p className="text-xs italic text-[#64625C]">"{item.notes}"</p>
                    )}
                  </div>
                  <span className="font-mono text-sm font-semibold text-[#252525] tabular-nums shrink-0">
                    {formatRupiah(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-[#E8E6DF] pt-4 flex items-center justify-between">
              <span className="text-sm font-bold text-[#252525]">Total Nett</span>
              <span className="font-mono text-lg font-extrabold text-[#1B4D3E] tabular-nums">
                {formatRupiah(selectedOrder.totalAmount)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
