import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  MapPin,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Banknote,
  X,
} from 'lucide-react';
import { createSeedData } from '../data/seedData';
import { useToast } from '../context/ToastContext';
import type { CreateOrderInput } from '../context/PosContext';
import type { CartItem, Order, Product } from '../types/pos';
import { formatDateTime, formatRupiah, getFulfillmentLabel, getOrderTypeLabel } from '../utils/format';
import { BrandMark } from '../components/BrandMark';
import { ProductImage } from '../components/ProductImage';
import { QrCodeCanvas } from '../components/QrCodeCanvas';
import { ProductDetailModal } from '../components/customer/ProductDetailModal';
import { CartCheckoutDrawer } from '../components/customer/CartCheckoutDrawer';
import { ReceiptModal, type ReceiptData } from '../components/ReceiptModal';

type SandboxTab = 'customer' | 'merchant' | 'qr';

const DEMO_QRIS_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="220" height="220" rx="16" fill="#ffffff"/><rect x="20" y="20" width="56" height="56" rx="8" fill="#1B4D3E"/><rect x="32" y="32" width="32" height="32" rx="4" fill="#ffffff"/><rect x="40" y="40" width="16" height="16" fill="#1B4D3E"/><rect x="144" y="20" width="56" height="56" rx="8" fill="#1B4D3E"/><rect x="156" y="32" width="32" height="32" rx="4" fill="#ffffff"/><rect x="164" y="40" width="16" height="16" fill="#1B4D3E"/><rect x="20" y="144" width="56" height="56" rx="8" fill="#1B4D3E"/><rect x="32" y="156" width="32" height="32" rx="4" fill="#ffffff"/><rect x="40" y="164" width="16" height="16" fill="#1B4D3E"/><rect x="92" y="92" width="36" height="36" rx="6" fill="#FCD804"/><text x="110" y="115" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#252525">DEMO</text></svg>',
  );

export const DemoPortalPage: React.FC = () => {
  const { pushToast } = useToast();
  const [sandboxState, setSandboxState] = useState(() => {
    const initial = createSeedData();
    return {
      ...initial,
      cafeSettings: {
        ...initial.cafeSettings,
        qrisImageUrl: DEMO_QRIS_SVG,
      },
      // Normalize demo seed orders so only LUNAS orders sit in active barista queue (Pay-First!)
      orders: initial.orders.filter((o) => o.paymentStatus === 'LUNAS' || o.orderStatus === 'ORDER_BARU'),
    };
  });

  const [activeTab, setActiveTab] = useState<SandboxTab>('customer');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastSandboxOrderId, setLastSandboxOrderId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptData | null>(null);

  const settings = sandboxState.cafeSettings;
  const demoTable = sandboxState.tables[0] ?? { id: 'tbl-a01', name: 'A01', area: 'Indoor Window', token: 'DEMO-A01', isActive: true, createdAt: '', updatedAt: '' };

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sandboxState.products.filter((p) => {
      if (!p.isActive) return false;
      if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
  }, [sandboxState.products, selectedCategory, search]);

  const totalQty = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + c.subtotal, 0);

  const trackedOrder = useMemo(
    () => (lastSandboxOrderId ? sandboxState.orders.find((o) => o.id === lastSandboxOrderId) ?? null : null),
    [lastSandboxOrderId, sandboxState.orders],
  );

  const handleSandboxCheckout = async (input: CreateOrderInput): Promise<Order> => {
    const seq = sandboxState.lastOrderSequence + 1;
    const nowIso = new Date().toISOString();
    const newOrder: Order = {
      id: `DEMO-${String(seq).padStart(4, '0')}`,
      createdAt: nowIso,
      updatedAt: nowIso,
      customerName: input.customerName,
      customerWhatsapp: input.customerWhatsapp,
      orderNote: input.orderNote,
      orderType: input.orderType,
      fulfillmentMethod: input.fulfillmentMethod,
      tableId: input.tableId ?? demoTable.id,
      tableName: input.orderType === 'DINE_IN' ? input.tableName ?? demoTable.name : undefined,
      items: input.items,
      totalAmount: input.totalAmount,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'BELUM_DIBAYAR',
      orderStatus: 'ORDER_BARU',
      cashierStatus: 'AKTIF',
    };
    setSandboxState((prev) => ({
      ...prev,
      lastOrderSequence: seq,
      orders: [newOrder, ...prev.orders],
    }));
    setLastSandboxOrderId(newOrder.id);
    return newOrder;
  };

  const handleVerifySandboxPayment = (orderId: string) => {
    setSandboxState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId ? { ...o, paymentStatus: 'LUNAS', orderStatus: 'ORDER_BARU', updatedAt: new Date().toISOString() } : o,
      ),
    }));
    pushToast(`Pembayaran ${orderId} terverifikasi (Sandbox). Pesanan masuk antrean barista.`, 'success');
  };

  const handleAdvanceSandboxOrder = (orderId: string, nextStatus: 'MEMASAK' | 'DISAJIKAN') => {
    setSandboxState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              orderStatus: nextStatus,
              cashierStatus: nextStatus === 'DISAJIKAN' ? 'SELESAI' : 'AKTIF',
              updatedAt: new Date().toISOString(),
            }
          : o,
      ),
    }));
    pushToast(
      nextStatus === 'MEMASAK' ? `${orderId} mulai disiapkan barista.` : `${orderId} siap disajikan ke pelanggan!`,
      'success',
    );
  };

  const openOrderReceipt = (order: Order) => {
    setReceiptPreview({
      id: order.id,
      merchantName: `${settings.name} (Sandbox Demo)`,
      outletName: 'Cabang Kemang Demo',
      address: settings.address,
      whatsapp: settings.whatsapp,
      customerName: order.customerName,
      orderType: order.orderType,
      fulfillmentMethod: order.fulfillmentMethod,
      orderSource: 'QR',
      tableName: order.tableName ?? null,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus === 'LUNAS' ? 'PAID' : 'UNPAID',
      method: order.paymentMethod === 'CASHIER' ? 'CASH' : 'QRIS',
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      paidAt: order.paymentStatus === 'LUNAS' ? order.updatedAt : null,
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
    });
  };

  const resetSandbox = () => {
    const fresh = createSeedData();
    setSandboxState({
      ...fresh,
      cafeSettings: { ...fresh.cafeSettings, qrisImageUrl: DEMO_QRIS_SVG },
      orders: fresh.orders.filter((o) => o.paymentStatus === 'LUNAS' || o.orderStatus === 'ORDER_BARU'),
    });
    setCart([]);
    setLastSandboxOrderId(null);
    pushToast('Data sandbox demo berhasil direset.', 'default');
  };

  const unpaidOrders = sandboxState.orders.filter((o) => o.paymentStatus !== 'LUNAS');
  const paidOrders = sandboxState.orders.filter((o) => o.paymentStatus === 'LUNAS');

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525] flex flex-col pb-24 lg:pb-12">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-base sm:text-lg font-extrabold tracking-tight text-[#1B4D3E] whitespace-nowrap shrink-0"
            >
              <BrandMark logoUrl={settings.logoUrl} size="sm" />
              <span>LARIS POS</span>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#F6D3AE] bg-[#FEF3E6] px-3 py-1 text-[11px] font-bold text-[#7C4106]">
              <ShieldAlert className="h-3.5 w-3.5 text-[#9A520A]" />
              Sandbox Demo Terisolasi
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetSandbox}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#252525] hover:bg-white transition-colors"
              title="Reset data simulasi demo"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>
            <Link
              to="/?register=1"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap"
            >
              <span>Daftar Akun Asli</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 pt-5 sm:pt-7 space-y-6">
        {/* Sandbox Notice + Surface Switcher */}
        <section className="rounded-2xl border border-[#E8E6DF] bg-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#252525]">
              Demo Interaktif LARIS Coffee — Alur QR Meja ke Antrean Kasir & Barista
            </h1>
            <p className="text-xs sm:text-sm text-[#5C5952]">
              Seluruh pesanan di halaman ini berjalan pada memori browser terisolasi dan tidak menyentuh database merchant produksi.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Mode simulasi demo"
            className="inline-flex rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-1 self-start shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'customer'}
              onClick={() => setActiveTab('customer')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === 'customer' ? 'bg-[#1B4D3E] text-white' : 'text-[#5C5952] hover:text-[#252525]'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>1. HP Pelanggan (Meja A01)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'merchant'}
              onClick={() => setActiveTab('merchant')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === 'merchant' ? 'bg-[#1B4D3E] text-white' : 'text-[#5C5952] hover:text-[#252525]'
              }`}
            >
              <ChefHat className="h-3.5 w-3.5" />
              <span>2. Antrean Kasir & Barista</span>
              {unpaidOrders.length > 0 && (
                <span className="rounded-md bg-[#FCD804] px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#252525]">
                  {unpaidOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'qr'}
              onClick={() => setActiveTab('qr')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === 'qr' ? 'bg-[#1B4D3E] text-white' : 'text-[#5C5952] hover:text-[#252525]'
              }`}
            >
              <QrCode className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">3. Kartu QR Meja</span>
              <span className="sm:hidden">3. QR</span>
            </button>
          </div>
        </section>

        {/* Live Tracked Order Strip when customer placed a sandbox order */}
        {trackedOrder && (
          <section className="rounded-2xl border border-[#1B4D3E]/30 bg-[#EEF4F1] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-extrabold text-[#1B4D3E]">{trackedOrder.id}</span>
                <span className="text-xs font-bold text-[#252525]">· {trackedOrder.customerName}</span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                    trackedOrder.paymentStatus === 'LUNAS'
                      ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A]'
                      : 'border-[#F6D3AE] bg-[#FEF3E6] text-[#9A520A]'
                  }`}
                >
                  {trackedOrder.paymentStatus === 'LUNAS'
                    ? trackedOrder.orderStatus === 'DISAJIKAN'
                      ? 'Pesanan Siap Disajikan!'
                      : trackedOrder.orderStatus === 'MEMASAK'
                        ? 'Sedang Diproses Barista'
                        : 'Lunas · Pesanan Masuk'
                    : 'Menunggu Verifikasi Pembayaran Kasir'}
                </span>
              </div>
              <p className="text-xs text-[#5C5952]">
                {trackedOrder.paymentStatus !== 'LUNAS'
                  ? 'Buka tab "2. Antrean Kasir & Barista" untuk mensimulasikan verifikasi pembayaran kasir.'
                  : 'Status pesanan Anda diperbarui langsung saat kasir/barista memproses pesanan.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openOrderReceipt(trackedOrder)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1B4D3E]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#1B4D3E] hover:bg-[#FAF9F6]"
              >
                <ReceiptText className="h-3.5 w-3.5" />
                <span>Struk Digital</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('merchant')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#143B2F]"
              >
                <span>Buka Layar Kasir</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </section>
        )}

        {/* TAB 1: CUSTOMER QR MENU SANDBOX */}
        {activeTab === 'customer' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-8 space-y-5">
              {/* LARIS Coffee Hero Banner */}
              <div className="rounded-2xl bg-[#1B4D3E] p-5 sm:p-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-[#FCD804]">Pesanan untuk Meja {demoTable.name}</p>
                    <h2 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight">
                      Selamat Datang di {settings.name}
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-white/80 max-w-xl leading-relaxed">
                      {settings.description}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#FCD804] px-3.5 py-2 text-center text-[#252525] shrink-0">
                    <div className="text-[10px] font-bold uppercase">Meja</div>
                    <div className="font-mono text-lg font-extrabold tabular-nums">{demoTable.name}</div>
                  </div>
                </div>
                <div className="mt-3.5 pt-3 border-t border-white/15 flex flex-wrap gap-4 text-xs text-white/80">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#FCD804]" />
                    {settings.operatingHours}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#FCD804]" />
                    {settings.address}
                  </span>
                </div>
              </div>

              {/* Search & Category Pills */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C5952]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari espresso, kopi susu, matcha, croissant..."
                    className="w-full rounded-xl border border-[#E8E6DF] bg-white py-2.5 pl-10 pr-9 text-sm focus:border-[#1B4D3E] focus:outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Hapus pencarian"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C5952]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap ${
                      selectedCategory === 'ALL'
                        ? 'bg-[#1B4D3E] text-white'
                        : 'border border-[#E8E6DF] bg-white text-[#5C5952]'
                    }`}
                  >
                    Semua Menu
                  </button>
                  {sandboxState.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap ${
                        selectedCategory === cat.id
                          ? 'bg-[#1B4D3E] text-white'
                          : 'border border-[#E8E6DF] bg-white text-[#5C5952]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {visibleProducts.map((product) => {
                  const inCart = cart.filter((c) => c.productId === product.id).reduce((s, c) => s + c.quantity, 0);
                  return (
                    <article
                      key={product.id}
                      onClick={() => {
                        setEditingItem(null);
                        setActiveProduct(product);
                      }}
                      className="group cursor-pointer flex sm:flex-col overflow-hidden rounded-2xl border border-[#E8E6DF] bg-white hover:border-[#1B4D3E]/40 transition-all p-3 gap-3 sm:p-0 sm:gap-0"
                    >
                      <div className="relative h-24 w-24 sm:h-auto sm:w-full sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl sm:rounded-none bg-[#F2EFE9]">
                        <ProductImage
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        {inCart > 0 && (
                          <span className="absolute right-2 top-2 rounded-lg bg-[#FCD804] px-2 py-0.5 font-mono text-xs font-extrabold text-[#252525]">
                            {inCart}x
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between sm:p-4 min-w-0">
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-[#252525] truncate">{product.name}</h3>
                          <p className="mt-1 text-xs text-[#5C5952] line-clamp-2">{product.description}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="font-mono text-sm sm:text-base font-extrabold text-[#1B4D3E] tabular-nums">
                            {formatRupiah(product.price)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem(null);
                              setActiveProduct(product);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#1B4D3E] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#143B2F]"
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
            </div>

            {/* Desktop Sandbox Cart */}
            <aside className="hidden lg:flex lg:col-span-4 lg:sticky lg:top-20 flex-col rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
              <div className="border-b border-[#E8E6DF] px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-[#1B4D3E]" />
                  <h2 className="text-sm font-extrabold text-[#252525]">Keranjang Demo</h2>
                </div>
                <span className="font-mono text-xs font-semibold text-[#5C5952] tabular-nums">{totalQty} item</span>
              </div>
              {cart.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-bold text-[#252525]">Keranjang masih kosong</p>
                  <p className="mt-1 text-xs text-[#5C5952]">
                    Pilih menu di samping untuk mencoba kustomisasi varian, topping, dan checkout Pay-First.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="max-h-80 overflow-y-auto divide-y divide-[#E8E6DF] px-5">
                    {cart.map((it) => (
                      <li key={it.cartItemId} className="py-3 flex justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold text-[#252525] truncate">
                            {it.quantity}x {it.productName}
                          </div>
                          <div className="text-[#5C5952] truncate">
                            {[
                              ...it.selectedVariants.map((v) => v.optionLabel),
                              ...it.selectedToppings.map((t) => `+ ${t.name}`),
                            ].join(' · ')}
                          </div>
                        </div>
                        <span className="font-mono font-bold tabular-nums shrink-0">{formatRupiah(it.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-[#E8E6DF] bg-[#FAF9F6] p-5 space-y-3">
                    <div className="flex justify-between text-sm font-extrabold">
                      <span>Total Nett</span>
                      <span className="font-mono text-[#1B4D3E] tabular-nums">{formatRupiah(totalAmount)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="w-full rounded-xl bg-[#1B4D3E] py-3 text-sm font-bold text-white hover:bg-[#143B2F]"
                    >
                      Checkout Simulasi
                    </button>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        {/* TAB 2: MERCHANT QUEUE SANDBOX */}
        {activeTab === 'merchant' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column A: Pending Payment Verification */}
            <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E8E6DF] pb-3.5">
                <div>
                  <h2 className="text-base font-extrabold text-[#252525]">Menunggu Verifikasi Pembayaran</h2>
                  <p className="text-xs text-[#5C5952]">Pesanan belum dibayar tertahan sebelum masuk dapur</p>
                </div>
                <span className="rounded-lg bg-[#FEF3E6] border border-[#F6D3AE] px-2.5 py-1 font-mono text-xs font-bold text-[#9A520A]">
                  {unpaidOrders.length}
                </span>
              </div>

              {unpaidOrders.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#5C5952]">
                  Tidak ada pesanan yang menunggu pembayaran. Buat pesanan baru di tab HP Pelanggan!
                </p>
              ) : (
                <div className="space-y-3">
                  {unpaidOrders.map((o) => (
                    <article key={o.id} className="rounded-xl border border-[#F6D3AE] bg-[#FEF3E6]/40 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-extrabold text-[#252525]">{o.id}</span>
                          <span className="ml-2 text-sm font-bold text-[#252525]">{o.customerName}</span>
                        </div>
                        <span className="font-mono text-sm font-extrabold text-[#1B4D3E] tabular-nums">
                          {formatRupiah(o.totalAmount)}
                        </span>
                      </div>
                      <div className="text-xs text-[#5C5952]">
                        {getOrderTypeLabel(o.orderType)}
                        {o.tableName ? ` · Meja ${o.tableName}` : ''} · {getFulfillmentLabel(o.fulfillmentMethod)} ·{' '}
                        <strong>{o.paymentMethod === 'CASHIER' ? 'Tunai di Kasir' : 'QRIS Statis'}</strong>
                      </div>
                      <ul className="rounded-lg bg-white border border-[#E8E6DF] p-2.5 space-y-1 text-xs">
                        {o.items.map((it, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>
                              <strong className="font-mono text-[#1B4D3E]">{it.quantity}x</strong> {it.productName}
                            </span>
                            <span className="font-mono tabular-nums">{formatRupiah(it.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => handleVerifySandboxPayment(o.id)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] py-2.5 text-xs font-bold text-white hover:bg-[#143B2F]"
                      >
                        <Banknote className="h-4 w-4 text-[#FCD804]" />
                        <span>Verifikasi Pembayaran (Lunas)</span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Column B: Active Paid Queue */}
            <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E8E6DF] pb-3.5">
                <div>
                  <h2 className="text-base font-extrabold text-[#252525]">Antrean Aktif & Selesai (Lunas)</h2>
                  <p className="text-xs text-[#5C5952]">Hanya pesanan lunas terverifikasi yang diproses barista</p>
                </div>
                <span className="rounded-lg bg-[#E9F5EE] border border-[#B8E1C8] px-2.5 py-1 font-mono text-xs font-bold text-[#15623A]">
                  {paidOrders.length}
                </span>
              </div>

              <div className="space-y-3">
                {paidOrders.map((o) => (
                  <article key={o.id} className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-extrabold text-[#1B4D3E]">{o.id}</span>
                        <span className="ml-2 text-sm font-bold text-[#252525]">{o.customerName}</span>
                        <span className="ml-2 font-mono text-[11px] text-[#5C5952]">{formatDateTime(o.updatedAt)}</span>
                      </div>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                          o.orderStatus === 'DISAJIKAN'
                            ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A]'
                            : o.orderStatus === 'MEMASAK'
                              ? 'border-[#D9B800]/40 bg-[#FCD804]/30 text-[#252525]'
                              : 'border-[#1B4D3E]/25 bg-white text-[#1B4D3E]'
                        }`}
                      >
                        {o.orderStatus === 'DISAJIKAN'
                          ? 'Pesanan Siap'
                          : o.orderStatus === 'MEMASAK'
                            ? 'Sedang Diproses'
                            : 'Pesanan Masuk'}
                      </span>
                    </div>

                    <ul className="rounded-lg bg-white border border-[#E8E6DF] p-2.5 space-y-1 text-xs">
                      {o.items.map((it, idx) => (
                        <li key={idx} className="flex justify-between">
                          <span>
                            <strong className="font-mono text-[#1B4D3E]">{it.quantity}x</strong> {it.productName}
                          </span>
                          <span className="font-mono tabular-nums">{formatRupiah(it.subtotal)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openOrderReceipt(o)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#1B4D3E] hover:underline"
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        <span>Lihat Struk</span>
                      </button>

                      {o.orderStatus === 'ORDER_BARU' && (
                        <button
                          type="button"
                          onClick={() => handleAdvanceSandboxOrder(o.id, 'MEMASAK')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#143B2F]"
                        >
                          <ChefHat className="h-3.5 w-3.5" />
                          <span>Proses Pesanan</span>
                        </button>
                      )}
                      {o.orderStatus === 'MEMASAK' && (
                        <button
                          type="button"
                          onClick={() => handleAdvanceSandboxOrder(o.id, 'DISAJIKAN')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#FCD804] px-3.5 py-2 text-xs font-bold text-[#252525] hover:bg-[#E5C400]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Tandai Siap</span>
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: BRANDED QR CARD PREVIEW */}
        {activeTab === 'qr' && (
          <section className="max-w-md mx-auto rounded-3xl border border-[#E8E6DF] bg-white overflow-hidden shadow-[0_16px_40px_rgba(37,37,37,0.08)]">
            <div className="bg-[#1B4D3E] px-6 py-6 text-center text-white">
              <div className="flex justify-center">
                <BrandMark logoUrl={settings.logoUrl} size="md" inverted />
              </div>
              <h2 className="mt-3 text-xl font-extrabold">{settings.name}</h2>
              <p className="text-xs text-white/80 mt-0.5">QR Self-Service Ordering</p>
            </div>
            <div className="h-2 bg-[#FCD804]" />
            <div className="p-6 text-center space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#5C5952]">Nomor Meja</p>
                <div className="mt-2 inline-flex rounded-2xl bg-[#FCD804] px-6 py-2 font-mono text-3xl font-extrabold text-[#252525]">
                  {demoTable.name}
                </div>
              </div>
              <div className="flex justify-center">
                <div className="rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-4">
                  <QrCodeCanvas
                    value={`${typeof window !== 'undefined' ? window.location.origin : 'https://warkopos.id'}/demo`}
                    size={210}
                    darkColor="#1B4D3E"
                    alt="Contoh Kartu QR Meja LARIS Coffee"
                  />
                </div>
              </div>
              <p className="text-xs text-[#5C5952] leading-relaxed">
                Pada akun merchant aktif, kartu QR ini diunduh dalam resolusi cetak tajam dengan token unik per meja yang dapat di-generate ulang kapan saja.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('customer')}
                className="w-full rounded-xl bg-[#1B4D3E] py-3 text-xs font-bold text-white hover:bg-[#143B2F]"
              >
                Simulasikan Scan Meja {demoTable.name}
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Mobile Floating Cart Bar */}
      {activeTab === 'customer' && cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-3.5 pt-2 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/95 to-transparent">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl bg-[#1B4D3E] px-4 py-3 text-white shadow-xl"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-[#FCD804] px-1.5 font-mono text-xs font-extrabold text-[#252525] tabular-nums">
                {totalQty}
              </span>
              <span className="text-sm font-bold">Lihat Keranjang Demo</span>
            </div>
            <span className="font-mono text-sm font-extrabold text-[#FCD804] tabular-nums">
              {formatRupiah(totalAmount)}
            </span>
          </button>
        </div>
      )}

      <ProductDetailModal
        product={activeProduct}
        editingItem={editingItem}
        onClose={() => {
          setActiveProduct(null);
          setEditingItem(null);
        }}
        onConfirm={(item) => {
          setCart((prev) => {
            const idx = prev.findIndex((c) => c.cartItemId === item.cartItemId);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = item;
              return copy;
            }
            return [...prev, item];
          });
          setActiveProduct(null);
          setEditingItem(null);
          pushToast(`${item.productName} ditambahkan ke keranjang demo`, 'success');
        }}
      />

      <CartCheckoutDrawer
        open={drawerOpen}
        cart={cart}
        scannedTable={{ id: demoTable.id, name: demoTable.name, token: demoTable.token }}
        forceTakeawayMode={false}
        onClose={() => setDrawerOpen(false)}
        onUpdateQty={(cartItemId, delta) =>
          setCart((prev) =>
            prev
              .map((it) =>
                it.cartItemId !== cartItemId
                  ? it
                  : it.quantity + delta <= 0
                    ? null
                    : { ...it, quantity: it.quantity + delta, subtotal: it.unitPrice * (it.quantity + delta) },
              )
              .filter((it): it is CartItem => it !== null),
          )
        }
        onRemoveItem={(cartItemId) => setCart((prev) => prev.filter((it) => it.cartItemId !== cartItemId))}
        onEditItem={(it) => {
          const prod = sandboxState.products.find((p) => p.id === it.productId);
          if (!prod) return;
          setDrawerOpen(false);
          setEditingItem(it);
          setActiveProduct(prod);
        }}
        onOrderCreated={() => {
          setCart([]);
          setDrawerOpen(false);
          setActiveTab('merchant');
        }}
        onDatabaseCheckout={handleSandboxCheckout}
        settingsOverride={settings}
        tablesOverride={sandboxState.tables}
      />

      <ReceiptModal receipt={receiptPreview} onClose={() => setReceiptPreview(null)} />
    </div>
  );
};
