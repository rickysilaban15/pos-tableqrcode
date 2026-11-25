import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, QrCode, CheckCircle2, ChefHat } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import {
  formatRupiah,
  formatTime,
  getFulfillmentLabel,
  getOrderTypeLabel,
} from '../../utils/format';
import {
  CashierStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from '../../components/StatusBadge';

export const AdminDashboardPage: React.FC = () => {
  const { state, updateOrderStatus, pushToast } = usePos();

  const totalOrders = state.orders.length;
  const newOrders = state.orders.filter((o) => o.orderStatus === 'ORDER_BARU').length;
  const cookingOrders = state.orders.filter((o) => o.orderStatus === 'MEMASAK').length;
  const servedOrders = state.orders.filter((o) => o.orderStatus === 'DISAJIKAN').length;
  const simulatedRevenue = state.orders
    .filter((o) => o.paymentStatus === 'LUNAS' || o.cashierStatus === 'SELESAI')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const recentOrders = state.orders.slice(0, 6);

  const handleQuickAdvance = async (orderId: string, nextStatus: 'MEMASAK' | 'DISAJIKAN') => {
    await updateOrderStatus(orderId, nextStatus);
    pushToast(
      nextStatus === 'MEMASAK'
        ? `${orderId} dipindahkan ke Memasak`
        : `${orderId} ditandai Disajikan & Kasir Selesai`,
      'success',
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip — Responsive 2 -> 3 -> 5 columns */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-5 sm:gap-4">
        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-[#64625C]">Total Pesanan</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#252525] tabular-nums">
            {totalOrders}
          </p>
          <p className="mt-1 text-xs text-[#64625C]">Hari ini</p>
        </div>

        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-[#64625C]">Pesanan Baru</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#1B4D3E] tabular-nums">
            {newOrders}
          </p>
          <p className="mt-1 text-xs text-[#64625C]">Perlu konfirmasi</p>
        </div>

        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-[#64625C]">Sedang Dimasak</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#252525] tabular-nums">
            {cookingOrders}
          </p>
          <p className="mt-1 text-xs text-[#64625C]">Diproses barista</p>
        </div>

        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-[#64625C]">Disajikan</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#15623A] tabular-nums">
            {servedOrders}
          </p>
          <p className="mt-1 text-xs text-[#64625C]">Kasir selesai</p>
        </div>

        <div className="col-span-2 sm:col-span-2 xl:col-span-1 rounded-2xl border border-[#1B4D3E] bg-[#1B4D3E] p-4 sm:p-5 text-white">
          <p className="text-xs font-medium text-white/75">Omzet Simulasi (Nett)</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#FCD804] tabular-nums">
            {formatRupiah(simulatedRevenue)}
          </p>
          <p className="mt-1 text-xs text-white/75">Lunas & selesai</p>
        </div>
      </section>

      {/* Main Split: Recent Orders + Activity Summary */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Recent Orders */}
        <section className="xl:col-span-8 rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[#E8E6DF] px-5 sm:px-6 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#252525]">Daftar Pesanan Terbaru</h2>
              <p className="text-xs text-[#64625C] mt-0.5">
                Pesanan dari HP customer langsung tampil otomatis di sini
              </p>
            </div>
            <Link
              to="/admin/orders"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B4D3E] hover:underline whitespace-nowrap shrink-0"
            >
              <span>Kelola Semua</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-[#252525]">Belum ada pesanan masuk</p>
              <p className="mt-1 text-xs text-[#64625C]">
                Scan QR meja atau buka halaman customer untuk membuat pesanan pertama.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card List (< md) */}
              <div className="md:hidden divide-y divide-[#E8E6DF]">
                {recentOrders.map((order) => (
                  <div key={order.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold text-[#252525] tabular-nums">
                          {order.id} · {formatTime(order.createdAt)}
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-[#252525] truncate">
                          {order.customerName}
                        </div>
                        <div className="text-xs text-[#64625C]">
                          {order.orderType === 'DINE_IN' && order.tableName
                            ? `Meja ${order.tableName}`
                            : getOrderTypeLabel(order.orderType)}
                          {' · '}
                          {getFulfillmentLabel(order.fulfillmentMethod)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-bold text-[#1B4D3E] tabular-nums">
                          {formatRupiah(order.totalAmount)}
                        </div>
                        <div className="mt-1">
                          <PaymentStatusBadge status={order.paymentStatus} />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={order.orderStatus} />
                        <CashierStatusBadge status={order.cashierStatus} />
                      </div>
                      {order.orderStatus === 'ORDER_BARU' && (
                        <button
                          type="button"
                          onClick={() => void handleQuickAdvance(order.id, 'MEMASAK')}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#143B2F]"
                        >
                          <ChefHat className="h-3.5 w-3.5" />
                          <span>Mulai Masak</span>
                        </button>
                      )}
                      {order.orderStatus === 'MEMASAK' && (
                        <button
                          type="button"
                          onClick={() => void handleQuickAdvance(order.id, 'DISAJIKAN')}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#FCD804] px-3 py-1.5 text-xs font-bold text-[#252525] hover:bg-[#E5C400]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Tandai Disajikan</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E6DF] bg-[#FAF9F6] text-xs font-semibold text-[#64625C]">
                      <th className="px-6 py-3">Order & Waktu</th>
                      <th className="px-4 py-3">Customer & Meja</th>
                      <th className="px-4 py-3 text-right">Total Nett</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E6DF] text-sm">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#FAF9F6]/70 transition-colors">
                        <td className="px-6 py-3.5 align-top">
                          <div className="font-mono text-xs font-semibold text-[#252525] tabular-nums">
                            {order.id}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-[#64625C] tabular-nums">
                            {formatTime(order.createdAt)} ·{' '}
                            {order.items.reduce((s, i) => s + i.quantity, 0)} item
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-semibold text-[#252525]">{order.customerName}</div>
                          <div className="mt-0.5 text-xs text-[#64625C]">
                            {order.orderType === 'DINE_IN' && order.tableName
                              ? `Meja ${order.tableName}`
                              : getOrderTypeLabel(order.orderType)}
                            {' · '}
                            {getFulfillmentLabel(order.fulfillmentMethod)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="font-mono text-sm font-semibold text-[#252525] tabular-nums">
                            {formatRupiah(order.totalAmount)}
                          </div>
                          <div className="mt-1 flex justify-end">
                            <PaymentStatusBadge status={order.paymentStatus} />
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-col items-start gap-1">
                            <OrderStatusBadge status={order.orderStatus} />
                            <CashierStatusBadge status={order.cashierStatus} />
                          </div>
                        </td>
                        <td className="px-6 py-3.5 align-top text-right">
                          {order.orderStatus === 'ORDER_BARU' && (
                            <button
                              type="button"
                              onClick={() => void handleQuickAdvance(order.id, 'MEMASAK')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap"
                            >
                              <ChefHat className="h-3.5 w-3.5" />
                              <span>Mulai Masak</span>
                            </button>
                          )}
                          {order.orderStatus === 'MEMASAK' && (
                            <button
                              type="button"
                              onClick={() => void handleQuickAdvance(order.id, 'DISAJIKAN')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FCD804] px-3 py-1.5 text-xs font-bold text-[#252525] hover:bg-[#E5C400] transition-colors whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Tandai Disajikan</span>
                            </button>
                          )}
                          {order.orderStatus === 'DISAJIKAN' && (
                            <Link
                              to={`/order-tracking/${order.id}`}
                              className="text-xs font-semibold text-[#64625C] hover:text-[#1B4D3E] whitespace-nowrap"
                            >
                              Lihat Tracking
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Right Column: Activity Feed & QR Shortcut */}
        <div className="xl:col-span-4 space-y-6">
          <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#252525]">Ringkasan Aktivitas</h2>
              <span className="text-xs text-[#64625C]">Terbaru</span>
            </div>

            {state.activities.length === 0 ? (
              <p className="mt-4 text-xs text-[#64625C]">Belum ada aktivitas tercatat.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[#E8E6DF]">
                {state.activities.slice(0, 7).map((act) => (
                  <li key={act.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm text-[#252525] leading-snug">{act.message}</p>
                    <p className="mt-1 font-mono text-[11px] text-[#64625C] tabular-nums">
                      {formatTime(act.timestamp)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF4F1] text-[#1B4D3E]">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#252525]">QR Meja Siap Uji</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#64625C]">
                  {state.tables.filter((t) => t.isActive).length} dari {state.tables.length} meja aktif. Atur Base URL dan unduh atau cetak kartu QR untuk pengujian HP.
                </p>
                <Link
                  to="/admin/tables"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#1B4D3E] hover:underline"
                >
                  <span>Kelola Meja & QR Code</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
