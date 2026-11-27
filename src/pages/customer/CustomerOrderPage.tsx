import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  ShoppingBag,
  Plus,
  Clock,
  MapPin,
  AlertTriangle,
  Receipt,
  Minus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { CartItem, Order, PosDataState, Product } from '../../types/pos';
import type { CreateOrderInput } from '../../context/PosContext';
import { formatRupiah, isValidTokenFormat } from '../../utils/format';
import { BrandMark } from '../../components/BrandMark';
import { ProductImage } from '../../components/ProductImage';
import { ProductDetailModal } from '../../components/customer/ProductDetailModal';
import { CartCheckoutDrawer } from '../../components/customer/CartCheckoutDrawer';

const defaultCustomerState: PosDataState = {
  version: 1,
  cafeSettings: {
    name: 'Outlet',
    slug: 'outlet',
    logoUrl: '',
    description: '',
    address: '',
    whatsapp: '',
    operatingHours: '',
    isOpen: true,
    qrBaseUrl: '',
    enableDineIn: true,
    enableTakeaway: true,
    enableTableService: true,
    enablePickupCounter: true,
    qrisImageUrl: '',
  },
  categories: [],
  products: [],
  tables: [],
  orders: [],
  activities: [],
  lastOrderSequence: 0,
};

export const CustomerOrderPage: React.FC = () => {
  const { storeSlug, token } = useParams<{ storeSlug: string; token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [postgresState, setPostgresState] = useState<PosDataState | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState('');
  const [entitlementInactive, setEntitlementInactive] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const cartKey = token ? `laris-cart:${token}` : '';
  const trackingStorageKey = token ? `laris-last-tracking:${token}` : '';
  const [lastTrackingToken, setLastTrackingToken] = useState<string>(() => {
    try {
      return token ? localStorage.getItem(`laris-last-tracking:${token}`) || '' : '';
    } catch {
      return '';
    }
  });
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      return token ? JSON.parse(localStorage.getItem(`laris-cart:${token}`) || '[]') : [];
    } catch {
      return [];
    }
  });
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitialStep, setDrawerInitialStep] = useState<'cart' | 'checkout'>('cart');
  const idempotencyKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const activeState = postgresState ?? defaultCustomerState;
  const settings = activeState.cafeSettings;
  const tableParam = token ? (postgresState?.tables[0]?.name ?? '') : (searchParams.get('table')?.trim() || '');
  const tokenParam = token ?? (searchParams.get('token')?.trim() || '');
  const modeParam = searchParams.get('mode')?.trim().toLowerCase() || '';
  const forceTakeawayMode = modeParam === 'takeaway';

  useEffect(() => {
    if (token) return;
    if (!tableParam || !tokenParam) {
      setLoadingCatalog(false);
      setCatalogError('QR meja tidak valid atau belum dipindai.');
      return;
    }
    let live = true;
    setLoadingCatalog(true);
    const qs = new URLSearchParams({
      slug: storeSlug || '',
      table: tableParam,
      token: tokenParam,
    });
    fetch(`/api/public/legacy-qr?${qs.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.qrToken) {
          throw new Error(data?.error || 'QR meja legacy tidak ditemukan atau sudah tidak aktif.');
        }
        if (live) navigate(`/q/${encodeURIComponent(data.qrToken)}`, { replace: true });
      })
      .catch((error) => {
        if (live) {
          setLoadingCatalog(false);
          setCatalogError(error instanceof Error ? error.message : 'QR meja tidak valid.');
        }
      });
    return () => {
      live = false;
    };
  }, [token, storeSlug, tableParam, tokenParam, navigate]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    setLoadingCatalog(true);
    Promise.all([
      fetch(`/api/public/qr/${encodeURIComponent(token)}/menu`),
      fetch(`/api/public/qr/${encodeURIComponent(token)}`),
    ])
      .then(async ([menuResponse, contextResponse]) => {
        if (!menuResponse.ok || !contextResponse.ok) {
          throw new Error('QR meja tidak valid atau sudah tidak aktif.');
        }
        const [menu, context] = await Promise.all([menuResponse.json(), contextResponse.json()]);
        const products: Product[] = (menu.products || []).map((product: any) => ({
          id: product.id,
          categoryId: product.categoryId,
          name: product.name,
          description: product.description || '',
          price: product.price,
          image: product.image || '',
          isActive: true,
          variantGroups: Object.values(
            (product.variants || []).reduce((groups: Record<string, any>, variant: any) => {
              const group = groups[variant.groupName] || {
                id: variant.groupName,
                name: variant.groupName,
                required: variant.required,
                options: [],
              };
              group.required ||= variant.required;
              group.options.push({
                id: variant.id,
                label: variant.optionName,
                priceDelta: variant.priceDelta,
              });
              groups[variant.groupName] = group;
              return groups;
            }, {}),
          ),
          toppings: (product.addons || []).map((addon: any) => ({
            id: addon.id,
            name: addon.name,
            price: addon.price,
          })),
        }));
        if (!live) return;
        const entOk = Boolean(menu.entitlements?.active && menu.entitlements?.qrOrderingEnabled);
        setEntitlementInactive(!entOk);
        setPostgresState({
          version: 1,
          cafeSettings: {
            ...defaultCustomerState.cafeSettings,
            ...(menu.settings || {}),
            name: menu.merchantName,
            slug: context.merchant_id,
          },
          categories: (menu.categories || []).map((category: any) => ({ ...category, isActive: true })),
          products,
          tables: [
            {
              id: context.table_id,
              name: context.table_name,
              area: context.area || '',
              token,
              isActive: true,
              createdAt: '',
              updatedAt: '',
            },
          ],
          orders: [],
          activities: [],
          lastOrderSequence: 0,
        });
        setCatalogError('');
        setLoadingCatalog(false);
      })
      .catch((error) => {
        if (live) {
          setCatalogError(error instanceof Error ? error.message : 'Gagal memuat menu.');
          setLoadingCatalog(false);
        }
      });
    return () => {
      live = false;
    };
  }, [token]);

  useEffect(() => {
    if (cartKey) {
      try {
        localStorage.setItem(cartKey, JSON.stringify(cart));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [cart, cartKey]);

  const tableValidation = useMemo(() => {
    if (!tableParam) {
      return { status: 'NO_TABLE' as const, table: null };
    }
    const matched = activeState.tables.find((t) => t.name.toUpperCase() === tableParam.toUpperCase());
    if (matched) {
      if (!matched.isActive) {
        return { status: 'INACTIVE_TABLE' as const, table: null };
      }
      if (!tokenParam || matched.token.toUpperCase() === tokenParam.toUpperCase()) {
        return { status: 'VALID' as const, table: { id: matched.id, name: matched.name, area: matched.area } };
      }
      return { status: 'INVALID_TOKEN' as const, table: null };
    }
    if (tokenParam && isValidTokenFormat(tokenParam)) {
      return {
        status: 'VALID' as const,
        table: { id: `qr-${tableParam.toUpperCase()}`, name: tableParam.toUpperCase(), area: 'QR Meja' },
      };
    }
    return { status: 'INVALID_TOKEN' as const, table: null };
  }, [tableParam, tokenParam, activeState.tables]);

  const activeCategories = useMemo(
    () => [...activeState.categories].filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [activeState.categories],
  );

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    activeState.categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [activeState.categories]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeState.products.filter((p) => {
      if (!p.isActive) return false;
      if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
  }, [activeState.products, selectedCategory, search]);

  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleConfirmProduct = (item: CartItem) => {
    setCart((prev) => {
      const existsIdx = prev.findIndex((c) => c.cartItemId === item.cartItemId);
      if (existsIdx >= 0) {
        const copy = [...prev];
        copy[existsIdx] = item;
        return copy;
      }
      return [...prev, item];
    });
    idempotencyKeyRef.current = null;
    pushToast(
      editingCartItem ? `${item.productName} di keranjang diperbarui` : `${item.productName} ditambahkan ke keranjang`,
      'success',
    );
    setActiveProduct(null);
    setEditingCartItem(null);
  };

  const handleUpdateCartQty = (cartItemId: string, delta: number) => {
    idempotencyKeyRef.current = null;
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartItemId !== cartItemId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...item,
            quantity: nextQty,
            subtotal: item.unitPrice * nextQty,
          };
        })
        .filter((item): item is CartItem => item !== null),
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    idempotencyKeyRef.current = null;
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleEditCartItem = (item: CartItem) => {
    const product = activeState.products.find((p) => p.id === item.productId);
    if (!product) return;
    setDrawerOpen(false);
    setEditingCartItem(item);
    setActiveProduct(product);
  };

  const handleOrderInitiated = (order: Order) => {
    const trackingTok = (order as Order & { trackingToken?: string }).trackingToken;
    setCart([]);
    idempotencyKeyRef.current = null;
    if (token && trackingTok) {
      try {
        localStorage.removeItem(cartKey);
        localStorage.setItem(trackingStorageKey, trackingTok);
        setLastTrackingToken(trackingTok);
      } catch {
        // Ignore storage error
      }
    }
  };

  const handleOrderCreated = (order: Order) => {
    const trackingTok = (order as Order & { trackingToken?: string }).trackingToken;
    handleOrderInitiated(order);
    setDrawerOpen(false);

    if (token && trackingTok) {
      navigate(`/tracking/${encodeURIComponent(trackingTok)}`);
      return;
    }
    navigate(`/order-tracking/${order.id}`);
  };

  const databaseCheckout = async (input: CreateOrderInput): Promise<Order> => {
    if (!token) throw new Error('QR meja tidak tersedia.');
    const normalizedItems = input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      variantIds: item.selectedVariants.map((variant) => variant.optionId),
      addonIds: item.selectedToppings.map((addon) => addon.id),
      notes: item.notes,
    }));
    const signature = JSON.stringify({
      customerName: input.customerName,
      paymentMethod: input.paymentMethod,
      orderType: input.orderType,
      fulfillmentMethod: input.fulfillmentMethod,
      items: normalizedItems,
    });
    if (!idempotencyKeyRef.current || idempotencyKeyRef.current.signature !== signature) {
      idempotencyKeyRef.current = { signature, key: crypto.randomUUID() };
    }

    const apiMethod =
      input.paymentMethod === 'CASHIER'
        ? 'CASH'
        : input.paymentMethod === 'QRIS_DYNAMIC'
          ? 'QRIS_DYNAMIC'
          : 'QRIS';

    const response = await fetch(`/api/public/qr/${encodeURIComponent(token)}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: input.customerName,
        idempotencyKey: idempotencyKeyRef.current.key,
        paymentMethod: apiMethod,
        orderType: input.orderType,
        fulfillmentMethod: input.fulfillmentMethod,
        items: normalizedItems,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Pesanan belum dapat dibuat.');
    return {
      id: payload.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customerName: input.customerName,
      orderType: input.orderType,
      fulfillmentMethod: input.fulfillmentMethod,
      tableId: tableValidation.table?.id,
      tableName: tableValidation.table?.name,
      items: input.items,
      totalAmount: payload.totalAmount,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'BELUM_DIBAYAR',
      orderStatus: 'ORDER_BARU',
      cashierStatus: 'AKTIF',
      dynamicPayment: payload.payment ?? undefined,
      trackingToken: payload.trackingToken,
    } as Order & { trackingToken: string };
  };

  const openCartDrawer = (initialStep: 'cart' | 'checkout' = 'cart') => {
    setDrawerInitialStep(initialStep);
    setDrawerOpen(true);
  };

  if (catalogError) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#FAF9F6] p-5 text-center">
        <section className="max-w-sm rounded-2xl border border-[#E8E6DF] bg-white p-7 shadow-sm space-y-3">
          <div className="flex justify-center">
            <BrandMark size="md" />
          </div>
          <h1 className="text-lg font-extrabold text-[#252525]">Menu tidak tersedia</h1>
          <p className="text-sm text-[#5C5952] leading-relaxed">{catalogError}</p>
          <p className="text-xs text-[#8C8980]">
            Silakan minta staf outlet untuk memeriksa kartu QR meja atau pindai ulang QR terbaru.
          </p>
        </section>
      </main>
    );
  }

  if (loadingCatalog) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#252525]" aria-busy="true" aria-label="Memuat katalog menu">
        <div className="h-14 border-b border-[#E8E6DF] bg-white" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5 space-y-5 animate-pulse">
          <div className="h-36 rounded-2xl bg-[#1B4D3E]/85" />
          <div className="h-11 rounded-xl bg-white border border-[#E8E6DF]" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:w-2/3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 sm:h-64 rounded-2xl bg-white border border-[#E8E6DF]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525] pb-24 lg:pb-12">
      {/* Compact Store Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark logoUrl={settings.logoUrl} size="sm" />
            <div className="min-w-0">
              <div className="text-sm font-extrabold tracking-tight text-[#1B4D3E] truncate">
                {settings.name}
              </div>
              <div className="text-[11px] font-medium text-[#5C5952] truncate">
                {tableValidation.table
                  ? `Meja ${tableValidation.table.name}${tableValidation.table.area ? ` · ${tableValidation.table.area}` : ''}`
                  : forceTakeawayMode
                    ? 'Takeaway'
                    : settings.operatingHours}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {lastTrackingToken && (
              <Link
                to={`/tracking/${encodeURIComponent(lastTrackingToken)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#1B4D3E] hover:bg-[#EEF4F1] transition-colors whitespace-nowrap"
              >
                <Receipt className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lacak Pesanan</span>
                <span className="sm:hidden">Lacak</span>
              </Link>
            )}
            <span
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${
                settings.isOpen
                  ? 'bg-[#E9F5EE] text-[#15623A]'
                  : 'bg-[#FDECEC] text-[#A62626]'
              }`}
            >
              {settings.isOpen ? 'Buka' : 'Tutup'}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-6">
        {/* Welcome & Table Context Banner */}
        <section className="rounded-2xl bg-[#1B4D3E] p-4 sm:p-6 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-xs font-semibold text-[#FCD804]">
                {tableValidation.table
                  ? `Pesanan untuk Meja ${tableValidation.table.name}`
                  : forceTakeawayMode
                    ? 'Pesanan Takeaway · Pickup Counter'
                    : 'QR Self-Service Ordering'}
              </p>
              <h1 className="mt-1 text-lg sm:text-2xl font-extrabold tracking-tight leading-snug">
                Selamat Datang di {settings.name}
              </h1>
              {settings.description && (
                <p className="mt-1.5 text-xs sm:text-sm text-white/85 max-w-2xl leading-relaxed">
                  {settings.description}
                </p>
              )}
            </div>

            {tableValidation.table && (
              <div className="rounded-xl bg-[#FCD804] px-3.5 py-2.5 text-center text-[#252525] shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Meja</div>
                <div className="font-mono text-lg sm:text-xl font-extrabold leading-tight tabular-nums">
                  {tableValidation.table.name}
                </div>
              </div>
            )}
          </div>

          {(settings.operatingHours || settings.address) && (
            <div className="mt-3.5 pt-3 border-t border-white/15 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-white/85">
              {settings.operatingHours && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#FCD804] shrink-0" />
                  <span>{settings.operatingHours}</span>
                </span>
              )}
              {settings.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#FCD804] shrink-0" />
                  <span className="line-clamp-1">{settings.address}</span>
                </span>
              )}
            </div>
          )}
        </section>

        {/* Alerts for inactive/invalid table or closed cafe */}
        {!settings.isOpen && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-xs text-[#A62626]"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>{settings.name} sedang tutup sementara.</strong>{' '}
              {entitlementInactive
                ? 'Layanan pemesanan mandiri pada outlet ini sedang tidak aktif. Silakan memesan langsung di kasir.'
                : 'Anda tetap dapat melihat katalog menu, namun checkout dinonaktifkan hingga outlet dibuka kembali.'}
            </span>
          </div>
        )}

        {(tableValidation.status === 'INACTIVE_TABLE' || tableValidation.status === 'INVALID_TOKEN') && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-4 py-3 text-xs text-[#7C4106]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#9A520A]" />
            <span>
              {tableValidation.status === 'INACTIVE_TABLE'
                ? `Meja ${tableParam} sedang tidak aktif. Anda tetap dapat memesan dengan mode Takeaway atau memilih meja lain saat checkout.`
                : 'Token QR meja tidak cocok atau sudah diperbarui. Anda tetap dapat melanjutkan pesanan melalui pilihan meja atau Takeaway saat checkout.'}
            </span>
          </div>
        )}

        {/* Main Responsive Layout: Catalog Left + Desktop Sticky Cart Right */}
        <div className="mt-5 sm:mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Menu Catalog Column */}
          <div className="lg:col-span-8 space-y-4 sm:space-y-5">
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C5952]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari kopi, matcha, croissant..."
                  aria-label="Cari menu"
                  className="w-full min-h-[44px] rounded-xl border border-[#E8E6DF] bg-white py-2.5 pl-10 pr-10 text-sm text-[#252525] placeholder:text-[#8C8980] focus:border-[#1B4D3E] focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-[#5C5952] hover:bg-[#FAF9F6]"
                    aria-label="Hapus pencarian"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`min-h-[38px] rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategory === 'ALL'
                      ? 'bg-[#1B4D3E] text-white'
                      : 'border border-[#E8E6DF] bg-white text-[#5C5952] hover:text-[#252525]'
                  }`}
                >
                  Semua Menu
                </button>
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`min-h-[38px] rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      selectedCategory === cat.id
                        ? 'bg-[#1B4D3E] text-white'
                        : 'border border-[#E8E6DF] bg-white text-[#5C5952] hover:text-[#252525]'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {visibleProducts.length === 0 ? (
              <div className="rounded-2xl border border-[#E8E6DF] bg-white p-10 text-center">
                <p className="text-sm font-bold text-[#252525]">
                  {activeState.products.length === 0 ? 'Katalog menu sedang disiapkan' : 'Menu tidak ditemukan'}
                </p>
                <p className="mt-1 text-xs text-[#5C5952]">
                  {activeState.products.length === 0
                    ? 'Outlet ini belum menambahkan produk aktif ke katalog.'
                    : 'Coba kata kunci lain atau pilih kategori "Semua Menu".'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {visibleProducts.map((product) => {
                  const inCartCount = cart
                    .filter((c) => c.productId === product.id)
                    .reduce((s, c) => s + c.quantity, 0);
                  const catName = categoryNameMap.get(product.categoryId);

                  return (
                    <article
                      key={product.id}
                      onClick={() => {
                        if (!settings.isOpen) return;
                        setEditingCartItem(null);
                        setActiveProduct(product);
                      }}
                      className={`group flex sm:flex-col overflow-hidden rounded-2xl border border-[#E8E6DF] bg-white transition-all p-3 gap-3 sm:p-0 sm:gap-0 ${
                        settings.isOpen
                          ? 'cursor-pointer hover:border-[#1B4D3E]/40 sm:hover:-translate-y-0.5'
                          : 'opacity-75'
                      }`}
                    >
                      <div className="relative h-24 w-24 sm:h-auto sm:w-full sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl sm:rounded-none bg-[#F2EFE9]">
                        <ProductImage
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        {inCartCount > 0 && (
                          <span className="absolute right-1.5 top-1.5 sm:right-2.5 sm:top-2.5 rounded-lg bg-[#FCD804] px-1.5 py-0.5 sm:px-2 font-mono text-[11px] sm:text-xs font-extrabold text-[#252525] shadow-sm tabular-nums">
                            {inCartCount}x
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col justify-between sm:p-4 min-w-0">
                        <div>
                          {catName && (
                            <p className="text-[11px] font-medium text-[#5C5952] truncate">{catName}</p>
                          )}
                          <h3 className="text-sm sm:text-base font-bold text-[#252525] leading-snug truncate">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="mt-0.5 sm:mt-1 text-xs text-[#5C5952] line-clamp-2 leading-relaxed">
                              {product.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-2.5 sm:mt-3.5 flex items-center justify-between gap-2">
                          <span className="font-mono text-sm sm:text-base font-extrabold text-[#1B4D3E] tabular-nums">
                            {formatRupiah(product.price)}
                          </span>
                          <button
                            type="button"
                            disabled={!settings.isOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCartItem(null);
                              setActiveProduct(product);
                            }}
                            className="inline-flex min-h-[36px] sm:min-h-[38px] items-center gap-1 rounded-xl bg-[#1B4D3E] px-3 sm:px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#143B2F] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Tambah</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop Sticky Cart Panel */}
          <aside className="hidden lg:flex lg:col-span-4 lg:sticky lg:top-20 flex-col rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
            <div className="border-b border-[#E8E6DF] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-[#1B4D3E]" />
                <h2 className="text-sm font-extrabold text-[#252525]">Keranjang Pesanan</h2>
              </div>
              <span className="font-mono text-xs font-semibold text-[#5C5952] tabular-nums">{totalQty} item</span>
            </div>

            {cart.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-[#252525]">Belum ada item dipilih</p>
                <p className="mt-1 text-xs text-[#5C5952] leading-relaxed">
                  Klik tombol Tambah pada produk untuk mengatur varian dan topping favorit Anda.
                </p>
              </div>
            ) : (
              <>
                <ul className="max-h-[420px] overflow-y-auto divide-y divide-[#E8E6DF] px-5">
                  {cart.map((item) => (
                    <li key={item.cartItemId} className="py-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#252525] truncate">{item.productName}</p>
                          <p className="text-[11px] text-[#5C5952] line-clamp-2">
                            {[
                              ...item.selectedVariants.map((v) => v.optionLabel),
                              ...item.selectedToppings.map((t) => `+ ${t.name}`),
                            ].join(' · ')}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#252525] tabular-nums shrink-0">
                          {formatRupiah(item.subtotal)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditCartItem(item)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B4D3E] hover:underline"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Ubah</span>
                          </button>
                          <span className="text-[#D9D6CD]">·</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCartItem(item.cartItemId)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5C5952] hover:text-[#B91C1C]"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Hapus</span>
                          </button>
                        </div>

                        <div className="flex items-center rounded-lg border border-[#E8E6DF] bg-[#FAF9F6]">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(item.cartItemId, -1)}
                            aria-label={`Kurangi ${item.productName}`}
                            className="flex h-7 w-7 items-center justify-center text-[#252525] hover:bg-[#EDEAE2] rounded-l-lg"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center font-mono text-xs font-bold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(item.cartItemId, 1)}
                            aria-label={`Tambah ${item.productName}`}
                            className="flex h-7 w-7 items-center justify-center text-[#252525] hover:bg-[#EDEAE2] rounded-r-lg"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-[#E8E6DF] bg-[#FAF9F6] p-5 space-y-3">
                  <div className="flex items-center justify-between text-sm font-bold text-[#252525]">
                    <span>Total Nett</span>
                    <span className="font-mono text-base text-[#1B4D3E] tabular-nums">
                      {formatRupiah(totalAmount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!settings.isOpen}
                    onClick={() => openCartDrawer('checkout')}
                    className="w-full min-h-[44px] rounded-xl bg-[#1B4D3E] px-4 py-3 text-sm font-bold text-white hover:bg-[#143B2F] disabled:opacity-50 transition-colors"
                  >
                    Checkout Sekarang
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* Mobile Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-3.5 pt-2 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/95 to-transparent">
          <button
            type="button"
            onClick={() => openCartDrawer('cart')}
            className="w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl bg-[#1B4D3E] px-4 py-3 text-white shadow-xl active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-[#FCD804] px-1.5 font-mono text-xs font-extrabold text-[#252525] tabular-nums">
                {totalQty}
              </span>
              <span className="text-sm font-bold truncate">Lihat Keranjang</span>
            </div>
            <span className="font-mono text-sm font-extrabold text-[#FCD804] tabular-nums shrink-0">
              {formatRupiah(totalAmount)}
            </span>
          </button>
        </div>
      )}

      <ProductDetailModal
        product={activeProduct}
        editingItem={editingCartItem}
        onClose={() => {
          setActiveProduct(null);
          setEditingCartItem(null);
        }}
        onConfirm={handleConfirmProduct}
      />

      <CartCheckoutDrawer
        open={drawerOpen}
        initialStep={drawerInitialStep}
        cart={cart}
        scannedTable={tableValidation.table}
        forceTakeawayMode={forceTakeawayMode}
        onClose={() => setDrawerOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onEditItem={handleEditCartItem}
        onOrderCreated={handleOrderCreated}
        onOrderInitiated={handleOrderInitiated}
        onDatabaseCheckout={token ? databaseCheckout : undefined}
        settingsOverride={postgresState?.cafeSettings}
        tablesOverride={postgresState?.tables}
      />
    </div>
  );
};
