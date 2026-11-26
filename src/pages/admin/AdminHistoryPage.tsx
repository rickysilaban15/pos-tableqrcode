import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, QrCode, ReceiptText, RefreshCw, Search, Store, Download } from 'lucide-react';
import { formatDateTime, formatRupiah } from '../../utils/format';
import { ReceiptModal, type ReceiptData } from '../../components/ReceiptModal';

type HistoryOrder = {
  id: string;
  customerName: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  fulfillmentMethod: 'TABLE_SERVICE' | 'PICKUP_COUNTER';
  orderSource: 'QR' | 'POS';
  tableName: string | null;
  method: 'CASH' | 'QRIS';
  cashReceived: number | null;
  changeAmount: number | null;
  paidAt: string | null;
  createdAt: string;
  completedAt: string | null;
  itemCount: number;
};

type PaymentRow = {
  id: string;
  orderId: string;
  customerName: string;
  orderSource: 'QR' | 'POS';
  orderStatus: string;
  method: 'CASH' | 'QRIS';
  status: string;
  amount: number;
  cashReceived: number | null;
  changeAmount: number | null;
  createdAt: string;
  paidAt: string | null;
  verifiedByName: string | null;
};

type Summary = {
  paidOrders: number;
  paidRevenue: number;
  qrOrders: number;
  qrRevenue: number;
  posOrders: number;
  posRevenue: number;
  cashRevenue: number;
  qrisRevenue: number;
};

const defaultSummary: Summary = {
  paidOrders: 0,
  paidRevenue: 0,
  qrOrders: 0,
  qrRevenue: 0,
  posOrders: 0,
  posRevenue: 0,
  cashRevenue: 0,
  qrisRevenue: 0,
};

const statusLabel: Record<string, string> = {
  AWAITING_PAYMENT: 'Menunggu Bayar',
  NEW_ORDER: 'Pesanan Masuk',
  IN_PROGRESS: 'Diproses',
  READY_TO_SERVE: 'Pesanan Siap',
  CANCELLED: 'Dibatalkan',
  EXPIRED: 'Kedaluwarsa',
};

const paymentStatusLabel: Record<string, string> = {
  PAID: 'Lunas',
  PENDING_VERIFICATION: 'Menunggu Verifikasi',
  UNPAID: 'Belum Dibayar',
  REFUNDED: 'Dikembalikan',
  EXPIRED: 'Kedaluwarsa',
};

export const AdminHistoryPage: React.FC = () => {
  const [tab, setTab] = useState<'orders' | 'payments'>('orders');
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<Summary>(defaultSummary);
  const [statusFilter, setStatusFilter] = useState('READY_TO_SERVE');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orderParams = new URLSearchParams({
        status: statusFilter,
        source: sourceFilter,
        method: methodFilter,
        page: String(page),
        pageSize: '50',
      });
      if (search.trim()) orderParams.set('q', search.trim());
      if (dateFrom) orderParams.set('dateFrom', dateFrom);
      if (dateTo) orderParams.set('dateTo', dateTo);

      const payParams = new URLSearchParams({
        source: sourceFilter,
        method: methodFilter,
        paginated: '1',
        page: String(page),
        pageSize: '50',
      });
      if (search.trim()) payParams.set('q', search.trim());
      if (dateFrom) payParams.set('dateFrom', dateFrom);
      if (dateTo) payParams.set('dateTo', dateTo);

      const [histRes, payRes] = await Promise.all([
        fetch(`/api/v1/orders/history?${orderParams.toString()}`),
        fetch(`/api/v1/payments?${payParams.toString()}`),
      ]);
      const [histData, payData] = await Promise.all([histRes.json(), payRes.json()]);
      if (!histRes.ok || !payRes.ok) {
        throw new Error(histData?.error || payData?.error || 'Riwayat transaksi tidak dapat dimuat.');
      }
      setOrders(histData.orders ?? []);
      setPagination(tab === 'orders' ? histData.pagination : payData.pagination);
      setSummary(histData.summary ?? defaultSummary);
      setPayments(Array.isArray(payData) ? payData : (payData.payments ?? []));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Riwayat transaksi tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, methodFilter, search, dateFrom, dateTo, page, tab]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sourceFilter, methodFilter, search, dateFrom, dateTo, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReceipt = async (orderId: string) => {
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/receipt`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Struk tidak dapat dimuat.');
      setReceipt(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Struk tidak dapat dimuat.');
    }
  };

  const totalRevenueSafe = summary.paidRevenue || 1;
  const qrShare = Math.round((summary.qrRevenue / totalRevenueSafe) * 100);
  const posShare = summary.paidRevenue > 0 ? 100 - qrShare : 0;

  const formatWibDate = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);

  const applyDatePreset = (preset: 'today' | '7d' | 'month' | 'all') => {
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const now = new Date();
    const todayWib = formatWibDate(now);
    if (preset === 'today') {
      setDateFrom(todayWib);
      setDateTo(todayWib);
    } else if (preset === '7d') {
      const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setDateFrom(formatWibDate(weekAgo));
      setDateTo(todayWib);
    } else if (preset === 'month') {
      setDateFrom(`${todayWib.slice(0, 8)}01`);
      setDateTo(todayWib);
    }
  };

  const exportCsv = () => {
    const params = new URLSearchParams({ source: sourceFilter, method: methodFilter });
    if (tab === 'orders') params.set('status', statusFilter);
    if (search.trim()) params.set('q', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    // Server-side export is complete (no 200-row cap), WIB-formatted and formula-injection safe.
    const path = tab === 'orders' ? '/api/v1/orders/history/export.csv' : '/api/v1/payments/export.csv';
    window.location.assign(`${path}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* KPI & Source Breakdown */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#1B4D3E] bg-[#1B4D3E] p-5 text-white">
          <p className="text-xs font-medium text-white/75">Total Omzet Terverifikasi</p>
          <p className="mt-2 font-mono text-2xl font-extrabold text-[#FCD804] tabular-nums">
            {formatRupiah(summary.paidRevenue)}
          </p>
          <p className="mt-1 text-xs text-white/75">{summary.paidOrders} transaksi lunas</p>
        </div>

        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[#64625C]">Sumber: QR Ordering</p>
            <QrCode className="h-4 w-4 text-[#1B4D3E]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#252525] tabular-nums">
            {formatRupiah(summary.qrRevenue)}
          </p>
          <p className="mt-1 text-xs text-[#64625C]">{summary.qrOrders} pesanan ({qrShare}%)</p>
        </div>

        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[#64625C]">Sumber: Kasir POS</p>
            <Store className="h-4 w-4 text-[#1B4D3E]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#252525] tabular-nums">
            {formatRupiah(summary.posRevenue)}
          </p>
          <p className="mt-1 text-xs text-[#64625C]">{summary.posOrders} pesanan ({posShare}%)</p>
        </div>

        <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[#64625C]">Metode Bayar Lunas</p>
            <Banknote className="h-4 w-4 text-[#1B4D3E]" />
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[#64625C]">Tunai</span>
              <span className="font-mono font-bold text-[#252525] tabular-nums">{formatRupiah(summary.cashRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64625C]">QRIS</span>
              <span className="font-mono font-bold text-[#1B4D3E] tabular-nums">{formatRupiah(summary.qrisRevenue)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Channel Proportion Bar */}
      {summary.paidRevenue > 0 && (
        <section className="rounded-2xl border border-[#E8E6DF] bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#252525]">
            <span>Proporsi Kanal Penjualan (QR Meja vs Kasir POS)</span>
            <span className="font-mono text-[#64625C]">{qrShare}% QR · {posShare}% POS</span>
          </div>
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-[#F2EFE9]">
            <div className="bg-[#1B4D3E] transition-all" style={{ width: `${qrShare}%` }} />
            <div className="bg-[#FCD804] transition-all" style={{ width: `${posShare}%` }} />
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">
          {error}
        </div>
      )}

      {/* Tabs & Filters */}
      <section className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#E8E6DF] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-1 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-1">
            <button
              type="button"
              onClick={() => setTab('orders')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                tab === 'orders' ? 'bg-[#1B4D3E] text-white' : 'text-[#64625C] hover:text-[#252525]'
              }`}
            >
              Riwayat Pesanan
            </button>
            <button
              type="button"
              onClick={() => setTab('payments')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                tab === 'payments' ? 'bg-[#1B4D3E] text-white' : 'text-[#64625C] hover:text-[#252525]'
              }`}
            >
              Riwayat Pembayaran
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'orders' && (
              <select
                aria-label="Filter status pesanan"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
              >
                <option value="READY_TO_SERVE">Selesai (Pesanan Siap)</option>
                <option value="ALL">Semua Status</option>
                <option value="AWAITING_PAYMENT">Menunggu Bayar</option>
                <option value="CANCELLED">Dibatalkan</option>
                <option value="EXPIRED">Kedaluwarsa</option>
              </select>
            )}
            <select
              aria-label="Filter sumber transaksi"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
            >
              <option value="ALL">Semua Sumber</option>
              <option value="QR">QR Ordering</option>
              <option value="POS">Manual POS</option>
            </select>
            <select
              aria-label="Filter metode pembayaran"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
            >
              <option value="ALL">Semua Metode</option>
              <option value="CASH">Tunai</option>
              <option value="QRIS">QRIS</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64625C]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari pelanggan / ID..."
                className="w-48 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] py-2 pl-8 pr-3 text-xs text-[#252525] focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => applyDatePreset('today')}
                  className="rounded-lg px-2 py-1 text-[#5C5952] hover:bg-white hover:text-[#1B4D3E]"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('7d')}
                  className="rounded-lg px-2 py-1 text-[#5C5952] hover:bg-white hover:text-[#1B4D3E]"
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('month')}
                  className="rounded-lg px-2 py-1 text-[#5C5952] hover:bg-white hover:text-[#1B4D3E]"
                >
                  Bulan Ini
                </button>
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-2 py-2 text-xs text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
                aria-label="Dari tanggal"
                title="Dari tanggal"
              />
              <span className="text-xs text-[#64625C]">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-2 py-2 text-xs text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
                aria-label="Sampai tanggal"
                title="Sampai tanggal"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => applyDatePreset('all')}
                  className="text-xs text-[#64625C] hover:text-[#A62626]"
                  title="Hapus filter tanggal"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-white px-3 py-2 text-xs font-semibold text-[#252525] hover:bg-[#FAF9F6]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-white px-3 py-2 text-xs font-semibold text-[#1B4D3E] hover:bg-[#EEF4F1]"
              title="Ekspor data ke CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-[#64625C]">Memuat riwayat transaksi…</div>
        ) : tab === 'orders' ? (
          orders.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#64625C]">Belum ada pesanan pada filter ini.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E8E6DF] bg-[#FAF9F6] text-xs font-semibold text-[#64625C]">
                    <th className="px-6 py-3">Order & Waktu</th>
                    <th className="px-4 py-3">Pelanggan</th>
                    <th className="px-4 py-3">Sumber</th>
                    <th className="px-4 py-3">Metode</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-6 py-3 text-right">Struk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6DF] text-sm">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#FAF9F6]/70">
                      <td className="px-6 py-3.5">
                        <div className="font-mono text-xs font-bold text-[#252525]">{order.id.slice(0, 8).toUpperCase()}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#64625C]">
                          {formatDateTime(order.completedAt || order.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-[#252525]">{order.customerName}</div>
                        <div className="text-xs text-[#64625C]">
                          {order.orderType === 'TAKEAWAY' ? 'Takeaway' : `Dine In${order.tableName ? ` · Meja ${order.tableName}` : ''}`}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            order.orderSource === 'POS'
                              ? 'border-[#F6D3AE] bg-[#FEF3E6] text-[#9A520A]'
                              : 'border-[#1B4D3E]/20 bg-[#EEF4F1] text-[#1B4D3E]'
                          }`}
                        >
                          {order.orderSource === 'POS' ? 'POS' : 'QR'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-[#252525]">
                        {order.method === 'CASH' ? 'Tunai' : 'QRIS'}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-[#15623A]">
                        {statusLabel[order.orderStatus] ?? order.orderStatus}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-[#252525] tabular-nums">
                        {formatRupiah(order.totalAmount)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => void openReceipt(order.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1B4D3E] hover:bg-[#EEF4F1]"
                        >
                          <ReceiptText className="h-3.5 w-3.5" />
                          <span>Struk</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64625C]">Belum ada data pembayaran pada filter ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E8E6DF] bg-[#FAF9F6] text-xs font-semibold text-[#64625C]">
                  <th className="px-6 py-3">Waktu Bayar</th>
                  <th className="px-4 py-3">Pelanggan & Order</th>
                  <th className="px-4 py-3">Kanal</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6DF] text-sm">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-[#FAF9F6]/70">
                    <td className="px-6 py-3.5 font-mono text-xs text-[#64625C]">
                      {formatDateTime(pay.paidAt || pay.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-[#252525]">{pay.customerName}</div>
                      <div className="font-mono text-[11px] text-[#64625C]">
                        {pay.orderId.slice(0, 8).toUpperCase()}
                        {pay.verifiedByName ? ` · Verifikator: ${pay.verifiedByName}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold">{pay.orderSource}</td>
                    <td className="px-4 py-3.5 text-xs font-semibold">
                      {pay.method === 'CASH' ? 'Tunai' : 'QRIS'}
                      {pay.cashReceived != null && (
                        <div className="font-mono text-[11px] font-normal text-[#64625C]">
                          Diterima {formatRupiah(pay.cashReceived)} · Kembali {formatRupiah(pay.changeAmount ?? 0)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold">
                      {paymentStatusLabel[pay.status] ?? pay.status}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-[#252525] tabular-nums">
                      {formatRupiah(pay.amount)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => void openReceipt(pay.orderId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1B4D3E] hover:bg-[#EEF4F1]"
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        <span>Struk</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pagination.totalPages > 1 && (
        <nav aria-label="Paginasi riwayat" className="flex items-center justify-between rounded-2xl border border-[#E8E6DF] bg-white px-4 py-3 text-xs">
          <span className="text-[#5C5952]">{pagination.total.toLocaleString('id-ID')} data · Halaman {pagination.page} dari {pagination.totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#E8E6DF] px-3 py-1.5 font-semibold disabled:opacity-40">Sebelumnya</button>
            <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[#E8E6DF] px-3 py-1.5 font-semibold disabled:opacity-40">Berikutnya</button>
          </div>
        </nav>
      )}

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
};
