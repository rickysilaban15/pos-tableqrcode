import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createSeedData } from '../data/seedData';
import type {
  CafeSettings,
  CafeTable,
  Category,
  FulfillmentMethod,
  Order,
  OrderItemSnapshot,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PosDataState,
  Product,
} from '../types/pos';
import {
  generateOrderId,
  generateTableToken,
  isLocalhostUrl,
  isPrivateAiStudioDevUrl,
} from '../utils/format';

const STORAGE_KEY = 'laris_pos_demo_state_v1';
const CHANNEL_NAME = 'laris_pos_demo_sync_v1';

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'default' | 'success' | 'warning' | 'error';
}

export interface CreateOrderInput {
  customerName: string;
  customerWhatsapp?: string;
  orderNote?: string;
  orderType: OrderType;
  fulfillmentMethod: FulfillmentMethod;
  tableId?: string;
  tableName?: string;
  items: OrderItemSnapshot[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentSubMethod?: string;
  paymentStatus: PaymentStatus;
}

interface PosContextValue {
  state: PosDataState;
  isSynced: boolean;
  toasts: ToastMessage[];
  pushToast: (text: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
  updateCafeSettings: (partial: Partial<CafeSettings>) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addTable: (name: string, area: string) => Promise<CafeTable>;
  updateTable: (
    id: string,
    updates: Partial<Pick<CafeTable, 'name' | 'area' | 'isActive'>>,
  ) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  regenerateTableToken: (id: string) => Promise<CafeTable | undefined>;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  updateOrderStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  markOrderPaid: (orderId: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
  refreshFromServer: () => Promise<void>;
}

const PosContext = createContext<PosContextValue | null>(null);

function loadCachedState(): PosDataState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PosDataState;
      if (parsed && parsed.cafeSettings && Array.isArray(parsed.tables) && Array.isArray(parsed.products)) {
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        const cachedBase = parsed.cafeSettings.qrBaseUrl || '';
        const isCurrentPublic =
          Boolean(currentOrigin) &&
          !isLocalhostUrl(currentOrigin) &&
          !isPrivateAiStudioDevUrl(currentOrigin);
        const isCachedStale =
          !cachedBase || isLocalhostUrl(cachedBase) || isPrivateAiStudioDevUrl(cachedBase);
        if (isCurrentPublic && isCachedStale) {
          return {
            ...parsed,
            cafeSettings: {
              ...parsed.cafeSettings,
              qrBaseUrl: currentOrigin,
            },
          };
        }
        return parsed;
      }
    }
  } catch {
    // Fallback to seed
  }
  return createSeedData();
}

function saveCache(next: PosDataState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota issues
  }
}

function playSubtleChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Browser autoplay policy may block audio until first click — safely ignore
  }
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) errMsg = data.error;
    } catch {
      // Ignore
    }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PosDataState>(() => loadCachedState());
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set(state.orders.map((o) => o.id)));
  const initialSyncDoneRef = useRef<boolean>(false);
  const lastSerializedRef = useRef<string>('');

  const pushToast = useCallback((text: string, tone: ToastMessage['tone'] = 'default') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const applyServerState = useCallback(
    (next: PosDataState, notifyIncomingOrder = false) => {
      const serialized = JSON.stringify(next);
      if (initialSyncDoneRef.current && serialized === lastSerializedRef.current) {
        return;
      }

      if (notifyIncomingOrder && initialSyncDoneRef.current) {
        const isAdminRoute = window.location.pathname.startsWith('/admin');
        const brandNewOrders = next.orders.filter(
          (o) => !knownOrderIdsRef.current.has(o.id) && o.orderStatus === 'ORDER_BARU',
        );
        if (isAdminRoute && brandNewOrders.length > 0) {
          const latest = brandNewOrders[0];
          const source =
            latest.orderType === 'DINE_IN' && latest.tableName
              ? `Meja ${latest.tableName}`
              : 'Takeaway';
          pushToast(`Pesanan baru ${latest.id} masuk dari ${source} (${latest.customerName})`, 'success');
          playSubtleChime();
        }
      }

      lastSerializedRef.current = serialized;
      knownOrderIdsRef.current = new Set(next.orders.map((o) => o.id));
      initialSyncDoneRef.current = true;
      setState(next);
      setIsSynced(true);
      saveCache(next);
    },
    [pushToast],
  );

  const refreshFromServer = useCallback(
    async (notifyIncoming = false) => {
      try {
        const serverState = await apiRequest<PosDataState>('/api/pos/state', {
          cache: 'no-store',
        });
        applyServerState(serverState, notifyIncoming);
      } catch {
        // Keep current cached state if server temporarily unreachable
      }
    },
    [applyServerState],
  );

  // Initial load + Live SSE cross-device subscription + 3s fallback polling
  useEffect(() => {
    void refreshFromServer(false);

    let eventSource: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      eventSource = new EventSource('/api/pos/events');
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (payload.type === 'state:updated') {
            void refreshFromServer(true);
          }
        } catch {
          // Ignore malformed keepalive
        }
      };
    }

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === 'STATE_UPDATED') {
          void refreshFromServer(true);
        }
      };
    }

    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshFromServer(true);
      }
    }, 3000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshFromServer(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (eventSource) {
        eventSource.close();
      }
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [refreshFromServer]);

  const notifyLocalTabs = useCallback(() => {
    try {
      channelRef.current?.postMessage({ type: 'STATE_UPDATED', updatedAt: Date.now() });
    } catch {
      // Ignore
    }
  }, []);

  const updateCafeSettings = useCallback(
    async (partial: Partial<CafeSettings>) => {
      setState((prev) => {
        const next = { ...prev, cafeSettings: { ...prev.cafeSettings, ...partial } };
        saveCache(next);
        return next;
      });
      try {
        await apiRequest('/api/pos/settings', {
          method: 'PATCH',
          body: JSON.stringify(partial),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const addCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await apiRequest('/api/pos/categories', {
          method: 'POST',
          body: JSON.stringify({ name: trimmed }),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal menambah kategori', 'error');
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const updateCategory = useCallback(
    async (id: string, updates: Partial<Category>) => {
      setState((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      }));
      try {
        await apiRequest(`/api/pos/categories/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal memperbarui kategori', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      setState((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== id),
      }));
      try {
        await apiRequest(`/api/pos/categories/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal menghapus kategori', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const addProduct = useCallback(
    async (product: Omit<Product, 'id'>) => {
      try {
        await apiRequest('/api/pos/products', {
          method: 'POST',
          body: JSON.stringify(product),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal menambah produk', 'error');
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<Product>) => {
      setState((prev) => ({
        ...prev,
        products: prev.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
      try {
        await apiRequest(`/api/pos/products/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal memperbarui produk', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      setState((prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.id !== id),
      }));
      try {
        await apiRequest(`/api/pos/products/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal menghapus produk', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const addTable = useCallback(
    async (name: string, area: string): Promise<CafeTable> => {
      try {
        const created = await apiRequest<CafeTable>('/api/pos/tables', {
          method: 'POST',
          body: JSON.stringify({ name, area }),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
        return created;
      } catch {
        const cleanName = name.trim().toUpperCase();
        const nowIso = new Date().toISOString();
        const fallback: CafeTable = {
          id: `tbl-${Date.now()}`,
          name: cleanName,
          area: area.trim() || 'Indoor Main',
          token: generateTableToken(cleanName),
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setState((prev) => {
          const next = { ...prev, tables: [...prev.tables, fallback] };
          saveCache(next);
          return next;
        });
        return fallback;
      }
    },
    [notifyLocalTabs, refreshFromServer],
  );

  const updateTable = useCallback(
    async (id: string, updates: Partial<Pick<CafeTable, 'name' | 'area' | 'isActive'>>) => {
      setState((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === id
            ? {
                ...t,
                ...updates,
                name: updates.name !== undefined ? updates.name.trim().toUpperCase() : t.name,
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      }));
      try {
        await apiRequest(`/api/pos/tables/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal memperbarui meja', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const deleteTable = useCallback(
    async (id: string) => {
      setState((prev) => ({
        ...prev,
        tables: prev.tables.filter((t) => t.id !== id),
      }));
      try {
        await apiRequest(`/api/pos/tables/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal menghapus meja', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const regenerateTableToken = useCallback(
    async (id: string): Promise<CafeTable | undefined> => {
      try {
        const updated = await apiRequest<CafeTable>(
          `/api/pos/tables/${encodeURIComponent(id)}/regenerate`,
          { method: 'POST' },
        );
        await refreshFromServer(false);
        notifyLocalTabs();
        return updated;
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal generate ulang QR', 'error');
        return undefined;
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const createOrder = useCallback(
    async (input: CreateOrderInput): Promise<Order> => {
      try {
        const created = await apiRequest<Order>('/api/pos/orders', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        knownOrderIdsRef.current.add(created.id);
        await refreshFromServer(false);
        notifyLocalTabs();
        return created;
      } catch {
        // Offline local fallback if server unreachable
        const nowIso = new Date().toISOString();
        const nextSeq = (state.lastOrderSequence || 0) + 1;
        const fallbackOrder: Order = {
          id: generateOrderId(nextSeq),
          createdAt: nowIso,
          updatedAt: nowIso,
          customerName: input.customerName.trim(),
          customerWhatsapp: input.customerWhatsapp?.trim() || undefined,
          orderNote: input.orderNote?.trim() || undefined,
          orderType: input.orderType,
          fulfillmentMethod: input.fulfillmentMethod,
          tableId: input.orderType === 'DINE_IN' ? input.tableId : undefined,
          tableName: input.orderType === 'DINE_IN' ? input.tableName : undefined,
          items: input.items,
          totalAmount: input.totalAmount,
          paymentMethod: input.paymentMethod,
          paymentSubMethod: input.paymentSubMethod,
          paymentStatus: input.paymentStatus,
          orderStatus: 'ORDER_BARU',
          cashierStatus: 'AKTIF',
        };
        setState((prev) => {
          const next = {
            ...prev,
            orders: [fallbackOrder, ...prev.orders],
            lastOrderSequence: nextSeq,
          };
          saveCache(next);
          return next;
        });
        return fallbackOrder;
      }
    },
    [notifyLocalTabs, refreshFromServer, state.lastOrderSequence],
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, nextStatus: OrderStatus) => {
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                orderStatus: nextStatus,
                cashierStatus: nextStatus === 'DISAJIKAN' ? 'SELESAI' : o.cashierStatus,
                updatedAt: new Date().toISOString(),
              }
            : o,
        ),
      }));
      try {
        await apiRequest(`/api/pos/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ orderStatus: nextStatus }),
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal memperbarui status', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const markOrderPaid = useCallback(
    async (orderId: string) => {
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId
            ? { ...o, paymentStatus: 'LUNAS', updatedAt: new Date().toISOString() }
            : o,
        ),
      }));
      try {
        await apiRequest(`/api/pos/orders/${encodeURIComponent(orderId)}/pay`, {
          method: 'PATCH',
        });
        await refreshFromServer(false);
        notifyLocalTabs();
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Gagal konfirmasi pembayaran', 'error');
        await refreshFromServer(false);
      }
    },
    [notifyLocalTabs, pushToast, refreshFromServer],
  );

  const resetDemoData = useCallback(async () => {
    try {
      const fresh = await apiRequest<PosDataState>('/api/pos/reset', {
        method: 'POST',
      });
      knownOrderIdsRef.current = new Set(fresh.orders.map((o) => o.id));
      setState(fresh);
      saveCache(fresh);
      notifyLocalTabs();
    } catch {
      const fresh = createSeedData();
      setState(fresh);
      saveCache(fresh);
    }
  }, [notifyLocalTabs]);

  return (
    <PosContext.Provider
      value={{
        state,
        isSynced,
        toasts,
        pushToast,
        dismissToast,
        updateCafeSettings,
        addCategory,
        updateCategory,
        deleteCategory,
        addProduct,
        updateProduct,
        deleteProduct,
        addTable,
        updateTable,
        deleteTable,
        regenerateTableToken,
        createOrder,
        updateOrderStatus,
        markOrderPaid,
        resetDemoData,
        refreshFromServer: () => refreshFromServer(false),
      }}
    >
      {children}
    </PosContext.Provider>
  );
};

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) {
    throw new Error('usePos must be used within PosProvider');
  }
  return ctx;
}
