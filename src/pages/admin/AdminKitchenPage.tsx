/**
 * Kitchen Display — Read-only view for the kitchen/bar team.
 * Shows NEW_ORDER and IN_PROGRESS orders.
 * Auto-refreshes via SSE.
 * No authentication or controls — just the queue.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChefHat, RefreshCw, Coffee } from 'lucide-react';
import { formatTime, formatRupiah } from '../../utils/format';

type KitchenOrder = {
  id: string;
  customerName: string;
  totalAmount: number;
  orderStatus: 'NEW_ORDER' | 'IN_PROGRESS';
  orderType: 'DINE_IN' | 'TAKEAWAY';
  fulfillmentMethod: 'TABLE_SERVICE' | 'PICKUP_COUNTER';
  tableName?: string;
  createdAt: string;
  items?: { productName: string; quantity: number; selections?: { variants?: { optionName?: string }[]; addons?: { name: string }[]; note?: string } }[];
};

const STATUS_STYLES = {
  NEW_ORDER:   { label: 'Pesanan Masuk',   cls: 'border-[#FCD804] bg-[#FFFDE7]', badge: 'bg-[#1B4D3E] text-white' },
  IN_PROGRESS: { label: 'Sedang Diproses', cls: 'border-[#1B4D3E] bg-[#EEF4F1]', badge: 'bg-[#FCD804] text-[#252525]' },
};

export const AdminKitchenPage: React.FC = () => {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const hasConnected = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/orders');
      if (!r.ok) throw new Error('Gagal memuat antrian dapur');
      const data: KitchenOrder[] = await r.json();
      setOrders(data.filter((o) => o.orderStatus === 'NEW_ORDER' || o.orderStatus === 'IN_PROGRESS'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Tick counter to show elapsed time
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/v1/events');
    const refresh = () => void load();
    es.addEventListener('connected', () => {
      if (hasConnected.current) refresh();
      hasConnected.current = true;
    });
    ['order:created', 'payment:confirmed', 'order:updated', 'order:cancelled'].forEach(
      (ev) => es.addEventListener(ev, refresh),
    );
    return () => es.close();
  }, [load]);

  const newOrders = orders.filter((o) => o.orderStatus === 'NEW_ORDER');
  const inProgress = orders.filter((o) => o.orderStatus === 'IN_PROGRESS');

  function elapsed(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'Baru';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}j ${mins % 60}m`;
  }

  const OrderCard: React.FC<{ order: KitchenOrder }> = ({ order }) => {
    const style = STATUS_STYLES[order.orderStatus];
    const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000);
    const urgent = mins >= 10;
    return (
      <article className={`rounded-2xl border-2 p-4 ${style.cls} ${urgent ? 'ring-2 ring-red-400' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${style.badge}`}>
              {style.label}
            </span>
            <p className="mt-1.5 text-sm font-extrabold text-[#252525]">{order.customerName}</p>
            <p className="text-xs text-[#64625C]">
              {order.orderType === 'DINE_IN' ? `Dine In${order.tableName ? ` · Meja ${order.tableName}` : ''}` : 'Takeaway'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`font-mono text-sm font-bold tabular-nums ${urgent ? 'text-red-600' : 'text-[#64625C]'}`}>
              {elapsed(order.createdAt)}
            </p>
            <p className="font-mono text-xs text-[#64625C] tabular-nums">{formatTime(order.createdAt)}</p>
          </div>
        </div>
        {order.items && order.items.length > 0 && (
          <ul className="space-y-2 border-t border-[#E8E6DF] pt-3">
            {order.items.map((item, idx) => {
              const details = [
                ...(item.selections?.variants ?? []).map((v) => v.optionName ?? ''),
                ...(item.selections?.addons ?? []).map((a) => `+ ${a.name}`),
              ].filter(Boolean);
              return (
                <li key={idx} className="text-sm">
                  <span className="font-mono font-bold text-[#1B4D3E]">{item.quantity}x </span>
                  <span className="font-semibold">{item.productName}</span>
                  {details.length > 0 && <span className="text-xs text-[#64625C]"> · {details.join(', ')}</span>}
                  {item.selections?.note && <p className="text-xs italic text-[#64625C]">"{item.selections.note}"</p>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-xs font-semibold text-[#252525] tabular-nums">{order.id.slice(0, 8)}</span>
          <span className="font-mono text-sm font-bold text-[#1B4D3E] tabular-nums">{formatRupiah(order.totalAmount)}</span>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/95 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1B4D3E]">
            <ChefHat className="h-5 w-5 text-[#FCD804]" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-[#252525]">Kitchen Display</div>
            <div className="text-xs text-[#64625C]">{orders.length} aktif · Auto-refresh via SSE</div>
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] px-3 py-1.5 text-xs font-semibold text-[#64625C] hover:bg-[#FAF9F6]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        {error && (
          <div className="mb-4 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {[0, 1, 2].map((i) => <div key={i} className="h-48 rounded-2xl bg-[#E8E6DF]" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-20 text-center">
            <Coffee className="h-12 w-12 mx-auto text-[#D3D0C7] mb-4" />
            <p className="text-lg font-bold text-[#252525]">Antrian dapur kosong</p>
            <p className="text-sm text-[#64625C] mt-1">Menunggu pesanan baru dari QR Ordering atau Kasir POS.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* New Orders first */}
            {newOrders.map((o) => <OrderCard key={o.id} order={o} />)}
            {/* Then In Progress */}
            {inProgress.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        )}

        {/* Tick to force re-render for elapsed time */}
        <span className="sr-only">{tick}</span>
      </main>
    </div>
  );
};
