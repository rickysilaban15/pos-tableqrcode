import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Minus, Plus, ReceiptText, Search, ShoppingBag, X } from 'lucide-react';
import { ProductImage } from '../../components/ProductImage';
import { ReceiptModal, type ReceiptData } from '../../components/ReceiptModal';
import { formatRupiah } from '../../utils/format';

type Product = { id: string; name: string; description: string; price: number; imageUrl: string; categoryId: string | null; isActive: boolean };
type Category = { id: string; name: string; isActive: boolean };
type Table = { id: string; name: string; isActive: boolean };
type Variant = { id: string; groupName: string; optionName: string; priceDelta: number; required: boolean };
type Addon = { id: string; name: string; price: number; isActive: boolean };
type Customizations = { variants: Variant[]; addons: Addon[] };
type CartItem = { key: string; product: Product; quantity: number; variantIds: string[]; addonIds: string[]; summaryLabel: string; notes: string; unitPrice: number };
type Receipt = { id: string; totalAmount: number; orderStatus: string; paymentStatus: string; paymentMethod: 'CASH' | 'QRIS'; change?: number };
type PosSettings = {
  name: string;
  isOpen: boolean;
  enableDineIn: boolean;
  enableTakeaway: boolean;
  enableTableService: boolean;
  enablePickupCounter: boolean;
  qrisImageUrl: string;
};

const defaultSettings: PosSettings = {
  name: 'Outlet',
  isOpen: true,
  enableDineIn: true,
  enableTakeaway: true,
  enableTableService: true,
  enablePickupCounter: true,
  qrisImageUrl: '',
};
const emptyCustomizations: Customizations = { variants: [], addons: [] };
const unique = <T,>(values: T[]) => [...new Set(values)];

type PosEntitlements = {
  effectiveActive: boolean;
  status: string;
  planName: string;
  posEnabled: boolean;
};

export const AdminPosPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [settings, setSettings] = useState<PosSettings>(defaultSettings);
  const [entitlements, setEntitlements] = useState<PosEntitlements>({ effectiveActive: true, status: 'ACTIVE', planName: 'Basic', posEnabled: true });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('ALL');
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [fulfillment, setFulfillment] = useState<'TABLE_SERVICE' | 'PICKUP_COUNTER'>('TABLE_SERVICE');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customizations, setCustomizations] = useState<Customizations>(emptyCustomizations);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptModal, setReceiptModal] = useState<ReceiptData | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch('/api/v1/products'),
        fetch('/api/v1/categories'),
        fetch('/api/v1/tables'),
        fetch('/api/v1/settings'),
        fetch('/api/v1/orders/entitlements'),
      ]);
      const data = await Promise.all(responses.map((response) => response.json()));
      if (responses.some((response) => !response.ok)) {
        throw new Error(data.find((value) => value?.error)?.error || 'Katalog POS tidak dapat dimuat.');
      }
      setEntitlements(data[4]);
      const nextSettings: PosSettings = {
        name: data[3].name ?? 'Outlet',
        isOpen: data[3].isOpen ?? true,
        enableDineIn: data[3].enableDineIn ?? true,
        enableTakeaway: data[3].enableTakeaway ?? true,
        enableTableService: data[3].enableTableService ?? true,
        enablePickupCounter: data[3].enablePickupCounter ?? true,
        qrisImageUrl: data[3].qrisImageUrl ?? '',
      };
      setProducts(data[0].filter((product: Product) => product.isActive));
      setCategories(data[1].filter((category: Category) => category.isActive));
      setTables(data[2].filter((table: Table) => table.isActive));
      setSettings(nextSettings);
      if (!nextSettings.enableDineIn && nextSettings.enableTakeaway) {
        setOrderType('TAKEAWAY');
        setFulfillment('PICKUP_COUNTER');
      } else if (!nextSettings.enableTableService && nextSettings.enablePickupCounter) {
        setFulfillment('PICKUP_COUNTER');
      }
      if (!nextSettings.qrisImageUrl) {
        setPaymentMethod('CASH');
      }
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Katalog POS tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedProduct(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedProduct]);

  useEffect(() => {
    if (orderType === 'TAKEAWAY') {
      setFulfillment('PICKUP_COUNTER');
      setTableId('');
    } else if (fulfillment === 'TABLE_SERVICE' && !settings.enableTableService && settings.enablePickupCounter) {
      setFulfillment('PICKUP_COUNTER');
      setTableId('');
    } else if (fulfillment === 'PICKUP_COUNTER' && !settings.enablePickupCounter && settings.enableTableService) {
      setFulfillment('TABLE_SERVICE');
    }
  }, [orderType, fulfillment, settings.enableTableService, settings.enablePickupCounter]);

  const shownProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return products.filter(
      (product) =>
        (categoryId === 'ALL' || product.categoryId === categoryId) &&
        (!needle || `${product.name} ${product.description}`.toLocaleLowerCase().includes(needle)),
    );
  }, [products, categoryId, search]);

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);
  const change = Math.max(0, Number(cashReceived || 0) - total);

  const groups = useMemo(() => {
    const grouped = new Map<string, Variant[]>();
    customizations.variants.forEach((variant) =>
      grouped.set(variant.groupName, [...(grouped.get(variant.groupName) ?? []), variant]),
    );
    return [...grouped.entries()];
  }, [customizations]);

  const selectedUnitPrice =
    (selectedProduct?.price ?? 0) +
    customizations.variants.filter((variant) => variantIds.includes(variant.id)).reduce((sum, variant) => sum + variant.priceDelta, 0) +
    customizations.addons.filter((addon) => addonIds.includes(addon.id)).reduce((sum, addon) => sum + addon.price, 0);

  const openProduct = async (product: Product) => {
    setError('');
    setSelectedProduct(product);
    setCustomizations(emptyCustomizations);
    setVariantIds([]);
    setAddonIds([]);
    setNotes('');
    try {
      const response = await fetch(`/api/v1/products/${product.id}/customizations`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Kustomisasi produk tidak dapat dimuat.');
      setCustomizations(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kustomisasi produk tidak dapat dimuat.');
      setSelectedProduct(null);
    }
  };

  const addSelected = () => {
    if (!selectedProduct) return;
    const missing = groups.find(
      ([, values]) => values.some((value) => value.required) && !values.some((value) => variantIds.includes(value.id)),
    );
    if (missing) {
      setError(`Pilih satu opsi untuk ${missing[0]}.`);
      return;
    }
    const summaryParts = [
      ...customizations.variants.filter((v) => variantIds.includes(v.id)).map((v) => v.optionName),
      ...customizations.addons.filter((a) => addonIds.includes(a.id)).map((a) => `+ ${a.name}`),
    ];
    const summaryLabel = summaryParts.join(' · ');
    const key = `${selectedProduct.id}:${[...variantIds].sort().join(',')}:${[...addonIds].sort().join(',')}:${notes.trim()}`;
    setCart((current) => {
      const old = current.find((line) => line.key === key);
      return old
        ? current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, { key, product: selectedProduct, quantity: 1, variantIds, addonIds, summaryLabel, notes: notes.trim(), unitPrice: selectedUnitPrice }];
    });
    idempotencyKey.current = null;
    setSelectedProduct(null);
    setError('');
  };

  const submit = async () => {
    if (!settings.isOpen) return setError('Outlet sedang tutup sementara. Aktifkan kembali di Pengaturan Cafe.');
    if (!cart.length) return setError('Keranjang masih kosong.');
    if (orderType === 'DINE_IN' && fulfillment === 'TABLE_SERVICE' && !tableId) {
      return setError('Pilih meja untuk layanan antar ke meja.');
    }
    if (paymentMethod === 'QRIS' && !settings.qrisImageUrl) {
      return setError('QRIS belum dikonfigurasi pada Pengaturan Cafe.');
    }
    if (paymentMethod === 'CASH' && (!cashReceived || Number(cashReceived) < total)) {
      return setError('Nominal tunai kurang dari total tagihan.');
    }
    setBusy(true);
    setError('');
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    try {
      const response = await fetch('/api/v1/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim() || 'Kasir',
          idempotencyKey: key,
          paymentMethod,
          orderType,
          fulfillmentMethod: orderType === 'TAKEAWAY' ? 'PICKUP_COUNTER' : fulfillment,
          tableId: orderType === 'DINE_IN' && fulfillment === 'TABLE_SERVICE' ? tableId || undefined : undefined,
          cashReceived: paymentMethod === 'CASH' ? Number(cashReceived) : undefined,
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            variantIds: line.variantIds,
            addonIds: line.addonIds,
            notes: line.notes,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Transaksi tidak dapat dibuat.');
      setReceipt({ ...data, paymentMethod });
      setCart([]);
      setCashReceived('');
      setCustomerName('');
      idempotencyKey.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Transaksi tidak dapat dibuat.');
    } finally {
      setBusy(false);
    }
  };

  const verifyQrisReceipt = async () => {
    if (!receipt) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/payments/${receipt.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Pembayaran QRIS tidak dapat diverifikasi.');
      setReceipt({ ...receipt, orderStatus: data.orderStatus, paymentStatus: data.paymentStatus });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pembayaran QRIS tidak dapat diverifikasi.');
    } finally {
      setBusy(false);
    }
  };

  const openReceiptModal = async (orderId: string) => {
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/receipt`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Struk tidak dapat dimuat.');
      setReceiptModal(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Struk tidak dapat dimuat.');
    }
  };

  const qrisAvailable = Boolean(settings.qrisImageUrl.trim());
  const dineInAllowed = settings.enableDineIn;
  const takeawayAllowed = settings.enableTakeaway && settings.enablePickupCounter;

  const posBlockedReason = !entitlements.effectiveActive
    ? `Langganan (${entitlements.planName}) berstatus ${entitlements.status}. Transaksi baru dinonaktifkan, namun pesanan lunas tetap dapat diproses di menu Pesanan.`
    : !entitlements.posEnabled
      ? `Akses Kasir POS belum aktif untuk paket ${entitlements.planName}.`
      : '';

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        {posBlockedReason && (
          <div role="status" className="mb-4 flex items-start gap-2.5 rounded-2xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{posBlockedReason}</span>
          </div>
        )}
        {!settings.isOpen && (
          <div role="status" className="mb-4 flex items-start gap-2.5 rounded-2xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Outlet sedang tutup sementara.</strong> Transaksi kasir POS dinonaktifkan hingga status toko dibuka di Pengaturan Cafe.
            </span>
          </div>
        )}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[#64625C]" />
            <span className="sr-only">Cari menu</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari menu kasir…"
              className="w-full rounded-xl border border-[#E8E6DF] bg-white py-3 pl-10 pr-3 text-base outline-none transition focus:border-[#1B4D3E] focus:ring-2 focus:ring-[#1B4D3E]/15"
            />
          </label>
          <select
            aria-label="Filter kategori"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="rounded-xl border border-[#E8E6DF] bg-white px-3 py-3 text-base outline-none focus:border-[#1B4D3E]"
          >
            <option value="ALL">Semua kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#D9D5CD] text-sm text-[#64625C]">
            Memuat katalog kasir…
          </div>
        ) : shownProducts.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shownProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => void openProduct(product)}
                className="group overflow-hidden rounded-2xl border border-[#E8E6DF] bg-white text-left shadow-[0_5px_18px_rgba(37,37,37,0.05)] transition hover:-translate-y-0.5 hover:border-[#1B4D3E] focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:ring-offset-2"
              >
                <div className="aspect-[4/3] bg-[#F2EFE9]">
                  <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="min-w-0 p-3">
                  <strong className="block truncate text-sm text-[#252525]">{product.name}</strong>
                  <span className="mt-1 block text-sm font-bold tabular-nums text-[#1B4D3E]">{formatRupiah(product.price)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#D9D5CD] px-6 text-center">
            <div>
              <strong className="block">Menu tidak ditemukan</strong>
              <p className="mt-1 text-sm text-[#64625C]">Ubah pencarian atau filter kategori untuk melihat menu lain.</p>
            </div>
          </div>
        )}
      </section>

      <aside className="h-fit rounded-2xl border border-[#E8E6DF] bg-white p-5 shadow-[0_8px_24px_rgba(37,37,37,0.06)] xl:sticky xl:top-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ShoppingBag className="h-5 w-5 text-[#1B4D3E]" />
            Kasir POS
          </h2>
          <span className="rounded-lg bg-[#EEF4F1] px-2.5 py-1 text-xs font-bold text-[#1B4D3E]">
            {cart.reduce((sum, line) => sum + line.quantity, 0)} item
          </span>
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-[#FDECEC] p-3 text-sm text-[#8A1F1F]">
            <span>{error}</span>
            <button aria-label="Tutup pesan" onClick={() => setError('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
          {cart.length ? (
            cart.map((line) => (
              <div key={line.key} className="border-b border-[#E8E6DF] pb-3">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{line.product.name}</strong>
                    {line.summaryLabel && <span className="block truncate text-xs text-[#1B4D3E] font-medium">{line.summaryLabel}</span>}
                    {line.notes && <span className="block truncate text-xs text-[#64625C]">{line.notes}</span>}
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{formatRupiah(line.unitPrice * line.quantity)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 rounded-lg bg-[#FAF9F6] p-1">
                    <button
                      aria-label={`Kurangi ${line.product.name}`}
                      onClick={() =>
                        setCart((current) =>
                          current.flatMap((item) =>
                            item.key !== line.key ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [],
                          ),
                        )
                      }
                      className="grid h-8 w-8 place-items-center rounded-md hover:bg-white"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
                    <button
                      aria-label={`Tambah ${line.product.name}`}
                      onClick={() =>
                        setCart((current) =>
                          current.map((item) => (item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item)),
                        )
                      }
                      className="grid h-8 w-8 place-items-center rounded-md hover:bg-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}
                    className="text-xs font-semibold text-[#A62626] hover:underline"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-[#64625C]">Pilih produk untuk mulai membuat transaksi.</p>
          )}
        </div>

        <label className="mt-4 block text-xs font-bold text-[#64625C]">
          Nama pelanggan (opsional)
          <input
            type="text"
            maxLength={80}
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Kosongkan untuk 'Kasir'"
            className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-white px-3 py-2.5 text-sm text-[#252525] outline-none focus:border-[#1B4D3E]"
          />
        </label>

        <fieldset className="mt-3 grid grid-cols-2 gap-2">
          <legend className="mb-2 text-xs font-bold text-[#64625C]">Jenis pesanan</legend>
          {dineInAllowed && (
            <button
              type="button"
              onClick={() => setOrderType('DINE_IN')}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                orderType === 'DINE_IN' ? 'bg-[#1B4D3E] text-white' : 'bg-[#FAF9F6] text-[#4B4944] hover:bg-[#F2EFE9]'
              }`}
            >
              Dine in
            </button>
          )}
          {takeawayAllowed && (
            <button
              type="button"
              onClick={() => {
                setOrderType('TAKEAWAY');
                setFulfillment('PICKUP_COUNTER');
                setTableId('');
              }}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                orderType === 'TAKEAWAY' ? 'bg-[#1B4D3E] text-white' : 'bg-[#FAF9F6] text-[#4B4944] hover:bg-[#F2EFE9]'
              }`}
            >
              Takeaway
            </button>
          )}
        </fieldset>

        {orderType === 'DINE_IN' && (
          <>
            <label className="mt-3 block text-xs font-bold text-[#64625C]">
              Penyerahan
              <select
                value={fulfillment}
                onChange={(event) => setFulfillment(event.target.value as 'TABLE_SERVICE' | 'PICKUP_COUNTER')}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-white px-3 py-3 text-base text-[#252525] outline-none focus:border-[#1B4D3E]"
              >
                {settings.enableTableService && <option value="TABLE_SERVICE">Antar ke meja</option>}
                {settings.enablePickupCounter && <option value="PICKUP_COUNTER">Pickup counter</option>}
              </select>
            </label>
            {fulfillment === 'TABLE_SERVICE' && (
              <label className="mt-3 block text-xs font-bold text-[#64625C]">
                Meja
                <select
                  value={tableId}
                  onChange={(event) => setTableId(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-white px-3 py-3 text-base text-[#252525] outline-none focus:border-[#1B4D3E]"
                >
                  <option value="">Pilih meja</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <label className="mt-3 block text-xs font-bold text-[#64625C]">
          Pembayaran
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as 'CASH' | 'QRIS')}
            className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-white px-3 py-3 text-base text-[#252525] outline-none focus:border-[#1B4D3E]"
          >
            <option value="CASH">Tunai</option>
            {qrisAvailable && <option value="QRIS">QRIS — verifikasi manual</option>}
          </select>
        </label>

        {!qrisAvailable && (
          <p className="mt-2 text-xs text-[#64625C]">QRIS belum dikonfigurasi di Pengaturan Cafe; hanya pembayaran tunai yang tersedia.</p>
        )}

        {paymentMethod === 'QRIS' && qrisAvailable && (
          <div className="mt-3 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-3 text-center">
            <img src={settings.qrisImageUrl} alt={`QRIS ${settings.name}`} className="mx-auto h-36 w-36 rounded-lg border border-[#E8E6DF] bg-white object-contain p-1" />
            <p className="mt-2 text-xs text-[#64625C]">Tunjukkan kode QRIS statis ini ke pelanggan, lalu verifikasi setelah dana masuk.</p>
          </div>
        )}

        {paymentMethod === 'CASH' && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-bold text-[#64625C]">
              Tunai diterima
              <input
                inputMode="numeric"
                value={cashReceived}
                onChange={(event) => setCashReceived(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Contoh: 50000"
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-white px-3 py-3 text-base tabular-nums outline-none focus:border-[#1B4D3E]"
              />
            </label>
            {total > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Uang Pas', amount: total },
                  ...(50000 >= total ? [{ label: 'Rp50.000', amount: 50000 }] : []),
                  ...(100000 >= total ? [{ label: 'Rp100.000', amount: 100000 }] : []),
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCashReceived(String(preset.amount))}
                    className="rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-2.5 py-1 text-xs font-semibold text-[#1B4D3E] hover:bg-white"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-[#E8E6DF] pt-4">
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatRupiah(total)}</span>
          </div>
          {paymentMethod === 'CASH' && cashReceived && (
            <p className="mt-1 text-right text-sm font-semibold text-[#1B4D3E]">Kembalian {formatRupiah(change)}</p>
          )}
        </div>

        <button
          disabled={busy || !cart.length || !settings.isOpen || Boolean(posBlockedReason)}
          onClick={() => void submit()}
          className="mt-4 w-full rounded-xl bg-[#1B4D3E] px-4 py-3 text-sm font-bold text-white shadow-[0_6px_14px_rgba(27,77,62,0.22)] transition hover:bg-[#143c30] focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Memproses transaksi…' : paymentMethod === 'CASH' ? 'Konfirmasi pembayaran tunai' : 'Buat tagihan QRIS'}
        </button>

        {receipt && (
          <div className={`mt-4 rounded-xl p-4 text-sm ${receipt.paymentStatus === 'PAID' ? 'bg-[#EEF4F1] text-[#1B4D3E]' : 'border border-[#F6D3AE] bg-[#FEF3E6] text-[#7C4106]'}`}>
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <strong className="block">
                  {receipt.paymentStatus === 'PAID' ? 'Transaksi berhasil dibuat' : 'Tagihan QRIS menunggu verifikasi'}
                </strong>
                <span className="mt-1 block break-all text-xs">#{receipt.id}</span>
                {receipt.change !== undefined && <span className="mt-1 block">Kembalian: {formatRupiah(receipt.change)}</span>}
              </div>
            </div>
            {receipt.paymentMethod === 'QRIS' && receipt.paymentStatus !== 'PAID' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void verifyQrisReceipt()}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3 py-2 text-xs font-bold text-white hover:bg-[#143B2F] disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Verifikasi Pembayaran QRIS
              </button>
            )}
            <button type="button" onClick={() => void openReceiptModal(receipt.id)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4">
              <ReceiptText className="h-4 w-4" />
              Cetak struk
            </button>
          </div>
        )}
      </aside>

      <ReceiptModal receipt={receiptModal} onClose={() => setReceiptModal(null)} />

      {selectedProduct && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-5" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="pos-product-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E8E6DF] bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 id="pos-product-title" className="truncate text-lg font-bold">{selectedProduct.name}</h2>
                <p className="mt-0.5 text-sm text-[#64625C]">{formatRupiah(selectedProduct.price)}</p>
              </div>
              <button aria-label="Tutup pilihan produk" onClick={() => setSelectedProduct(null)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[#F2EFE9]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-5">
              {groups.map(([group, values]) => (
                <fieldset key={group}>
                  <legend className="text-sm font-bold">
                    {group} {values.some((value) => value.required) && <span className="text-[#A62626]">*</span>}
                  </legend>
                  <div className="mt-2 grid gap-2">
                    {values.map((value) => (
                      <button
                        type="button"
                        key={value.id}
                        onClick={() =>
                          setVariantIds((current) =>
                            unique([...current.filter((id) => !values.some((item) => item.id === id)), value.id]),
                          )
                        }
                        className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm ${
                          variantIds.includes(value.id)
                            ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                            : 'border-[#E8E6DF] hover:border-[#1B4D3E]'
                        }`}
                      >
                        <span>{value.optionName}</span>
                        <span className="font-bold tabular-nums">{value.priceDelta ? `+${formatRupiah(value.priceDelta)}` : 'Termasuk'}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              {customizations.addons.filter((addon) => addon.isActive).length > 0 && (
                <fieldset>
                  <legend className="text-sm font-bold">Tambahan</legend>
                  <div className="mt-2 grid gap-2">
                    {customizations.addons
                      .filter((addon) => addon.isActive)
                      .map((addon) => (
                        <label
                          key={addon.id}
                          className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 text-sm ${
                            addonIds.includes(addon.id)
                              ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                              : 'border-[#E8E6DF]'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={addonIds.includes(addon.id)}
                              onChange={() =>
                                setAddonIds((current) =>
                                  current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id],
                                )
                              }
                              className="h-4 w-4 accent-[#1B4D3E]"
                            />
                            {addon.name}
                          </span>
                          <span className="font-bold tabular-nums">+{formatRupiah(addon.price)}</span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}
              <label className="block text-sm font-bold">
                Catatan pesanan
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Contoh: kurang manis"
                  className="mt-2 w-full rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-base font-normal outline-none focus:border-[#1B4D3E]"
                />
              </label>
            </div>
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#E8E6DF] bg-white p-5">
              <span className="text-sm font-bold tabular-nums">{formatRupiah(selectedUnitPrice)}</span>
              <button onClick={addSelected} className="rounded-xl bg-[#1B4D3E] px-4 py-3 text-sm font-bold text-white">
                Tambah ke keranjang
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
