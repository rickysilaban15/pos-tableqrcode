import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Minus,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  QrCode,
  Wallet,
  Landmark,
  Store,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  UtensilsCrossed,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import type {
  CafeTable,
  CartItem,
  FulfillmentMethod,
  Order,
  OrderType,
  PaymentMethod,
} from '../../types/pos';
import { formatRupiah, getFulfillmentLabel, getOrderTypeLabel } from '../../utils/format';
import { ProductImage } from '../ProductImage';
import { QrCodeCanvas } from '../QrCodeCanvas';

type DrawerStep = 'cart' | 'checkout' | 'payment' | 'payment_failed';

interface CartCheckoutDrawerProps {
  open: boolean;
  initialStep?: 'cart' | 'checkout';
  cart: CartItem[];
  scannedTable: { id?: string; name: string; token?: string } | null;
  forceTakeawayMode: boolean;
  onClose: () => void;
  onUpdateQty: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onEditItem: (item: CartItem) => void;
  onOrderCreated: (order: Order) => void;
}

const EWALLET_PROVIDERS = ['GoPay', 'OVO', 'DANA', 'ShopeePay'];
const BANK_PROVIDERS = [
  { name: 'BCA Virtual Account', va: '8801 0812 8890 4410' },
  { name: 'Mandiri Virtual Account', va: '8902 0812 8890 4410' },
  { name: 'BNI Virtual Account', va: '8810 0812 8890 4410' },
  { name: 'BRI Virtual Account', va: '8821 0812 8890 4410' },
];

export const CartCheckoutDrawer: React.FC<CartCheckoutDrawerProps> = ({
  open,
  initialStep = 'cart',
  cart,
  scannedTable,
  forceTakeawayMode,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onEditItem,
  onOrderCreated,
}) => {
  const { state, createOrder, pushToast } = usePos();
  const settings = state.cafeSettings;

  const [step, setStep] = useState<DrawerStep>(initialStep);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('TABLE_SERVICE');
  const [manualTableId, setManualTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState<string>('');
  const [orderNote, setOrderNote] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [ewalletProvider, setEwalletProvider] = useState<string>(EWALLET_PROVIDERS[0]);
  const [bankProvider, setBankProvider] = useState<string>(BANK_PROVIDERS[0].name);
  const [copiedVa, setCopiedVa] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeTables: CafeTable[] = state.tables.filter((t) => t.isActive);
  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const prevOpenRef = useRef<boolean>(false);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    setStep(initialStep);
    setFormError('');
    setIsSubmitting(false);

    const canDineIn = settings.enableDineIn && !forceTakeawayMode;
    const canTakeaway = settings.enableTakeaway;

    let defaultType: OrderType = 'DINE_IN';
    if (forceTakeawayMode && canTakeaway) {
      defaultType = 'TAKEAWAY';
    } else if (scannedTable && canDineIn) {
      defaultType = 'DINE_IN';
    } else if (!canDineIn && canTakeaway) {
      defaultType = 'TAKEAWAY';
    } else if (canDineIn) {
      defaultType = 'DINE_IN';
    }
    setOrderType(defaultType);

    if (defaultType === 'TAKEAWAY') {
      setFulfillmentMethod('PICKUP_COUNTER');
    } else if (settings.enableTableService) {
      setFulfillmentMethod('TABLE_SERVICE');
    } else {
      setFulfillmentMethod('PICKUP_COUNTER');
    }

    if (!scannedTable && activeTables[0]) {
      setManualTableId(activeTables[0].id);
    }
  }, [
    open,
    initialStep,
    scannedTable,
    forceTakeawayMode,
    activeTables,
    settings.enableDineIn,
    settings.enableTakeaway,
    settings.enableTableService,
    settings.enablePickupCounter,
  ]);

  useEffect(() => {
    if (orderType === 'TAKEAWAY') {
      setFulfillmentMethod('PICKUP_COUNTER');
    } else if (
      fulfillmentMethod === 'TABLE_SERVICE' &&
      !settings.enableTableService &&
      settings.enablePickupCounter
    ) {
      setFulfillmentMethod('PICKUP_COUNTER');
    } else if (
      fulfillmentMethod === 'PICKUP_COUNTER' &&
      !settings.enablePickupCounter &&
      settings.enableTableService
    ) {
      setFulfillmentMethod('TABLE_SERVICE');
    }
  }, [orderType, fulfillmentMethod, settings.enableTableService, settings.enablePickupCounter]);

  if (!open) return null;

  const resolvedTable =
    orderType === 'DINE_IN'
      ? scannedTable
        ? scannedTable
        : (() => {
            const found = activeTables.find((t) => t.id === manualTableId);
            return found ? { id: found.id, name: found.name, token: found.token } : null;
          })()
      : null;

  const paymentSubMethod =
    paymentMethod === 'E_WALLET'
      ? ewalletProvider
      : paymentMethod === 'BANK_TRANSFER'
        ? bankProvider
        : undefined;

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (cart.length === 0) {
      setFormError('Keranjang masih kosong.');
      return;
    }
    if (!customerName.trim()) {
      setFormError('Nama customer wajib diisi untuk panggilan pesanan.');
      return;
    }
    if (orderType === 'DINE_IN' && !resolvedTable) {
      setFormError('Pilih nomor meja atau beralih ke mode Takeaway.');
      return;
    }
    setFormError('');

    if (paymentMethod === 'CASHIER') {
      setIsSubmitting(true);
      try {
        const created = await createOrder({
          customerName: customerName.trim(),
          customerWhatsapp: customerWhatsapp.trim() || undefined,
          orderNote: orderNote.trim() || undefined,
          orderType,
          fulfillmentMethod: orderType === 'TAKEAWAY' ? 'PICKUP_COUNTER' : fulfillmentMethod,
          tableId: resolvedTable?.id,
          tableName: resolvedTable?.name,
          tableToken: resolvedTable?.token,
          items: cart.map(({ cartItemId: _ignore, ...snapshot }) => snapshot),
          totalAmount,
          paymentMethod: 'CASHIER',
          paymentStatus: 'BELUM_DIBAYAR',
        });
        pushToast(`Pesanan ${created.id} terkirim ke dapur (Bayar di Kasir)`, 'success');
        onOrderCreated(created);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Pesanan belum dapat dikirim. Coba lagi.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setStep('payment');
  };

  const handleConfirmPaymentInstruction = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const created = await createOrder({
        customerName: customerName.trim(),
        customerWhatsapp: customerWhatsapp.trim() || undefined,
        orderNote: orderNote.trim() || undefined,
        orderType,
        fulfillmentMethod: orderType === 'TAKEAWAY' ? 'PICKUP_COUNTER' : fulfillmentMethod,
        tableId: resolvedTable?.id,
        tableName: resolvedTable?.name,
        tableToken: resolvedTable?.token,
        items: cart.map(({ cartItemId: _ignore, ...snapshot }) => snapshot),
        totalAmount,
        paymentMethod,
        paymentSubMethod,
        paymentStatus: 'BELUM_DIBAYAR',
      });
      pushToast(`Pesanan ${created.id} dibuat. Selesaikan pembayaran sesuai instruksi.`, 'success');
      onOrderCreated(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Pesanan belum dapat dikirim. Coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatePaymentFailed = () => {
    setStep('payment_failed');
  };

  const activeBankObj =
    BANK_PROVIDERS.find((b) => b.name === bankProvider) ?? BANK_PROVIDERS[0];

  const handleCopyVa = async () => {
    try {
      await navigator.clipboard.writeText(activeBankObj.va.replace(/\s+/g, ''));
      setCopiedVa(true);
      pushToast('Nomor Virtual Account disalin', 'success');
      window.setTimeout(() => setCopiedVa(false), 1800);
    } catch {
      pushToast('Gagal menyalin VA', 'warning');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-[440px] h-[94dvh] sm:h-full flex flex-col rounded-t-3xl sm:rounded-none bg-white shadow-2xl overflow-hidden">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-0.5 bg-white">
          <div className="h-1.5 w-10 rounded-full bg-[#D9D6CD]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E8E6DF] px-4 sm:px-5 py-3.5 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            {(step === 'checkout' || step === 'payment' || step === 'payment_failed') && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  if (step === 'checkout') setStep('cart');
                  else setStep('checkout');
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E6DF] text-[#252525] hover:bg-[#FAF9F6]"
                aria-label="Kembali"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[#252525] truncate">
                {step === 'cart' && `Keranjang (${totalQty})`}
                {step === 'checkout' && 'Checkout Pesanan'}
                {step === 'payment' && 'Simulasi Pembayaran'}
                {step === 'payment_failed' && 'Pembayaran Gagal'}
              </h2>
              {scannedTable && orderType === 'DINE_IN' && (
                <p className="text-xs font-medium text-[#1B4D3E] truncate">
                  Meja {scannedTable.name} · {settings.name}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#64625C] hover:bg-[#FAF9F6] hover:text-[#252525]"
            aria-label="Tutup keranjang"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* STEP 1: CART */}
        {step === 'cart' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <ShoppingBag className="h-10 w-10 text-[#CFCBC0]" />
                  <p className="mt-3 text-base font-bold text-[#252525]">Keranjang masih kosong</p>
                  <p className="mt-1 text-xs text-[#64625C] max-w-xs">
                    Pilih kopi atau pastry favorit Anda dari menu untuk mulai memesan.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#E8E6DF]">
                  {cart.map((item) => (
                    <li key={item.cartItemId} className="py-4 first:pt-0">
                      <div className="flex gap-3">
                        <div className="h-16 w-16 sm:h-16 sm:w-20 shrink-0 overflow-hidden rounded-xl border border-[#E8E6DF] bg-[#F2EFE9]">
                          <ProductImage src={item.productImage} alt={item.productName} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-[#252525] leading-snug">
                              {item.productName}
                            </h3>
                            <span className="font-mono text-sm font-bold text-[#252525] tabular-nums shrink-0">
                              {formatRupiah(item.subtotal)}
                            </span>
                          </div>

                          {(item.selectedVariants.length > 0 ||
                            item.selectedToppings.length > 0) && (
                            <p className="mt-1 text-xs text-[#64625C] leading-relaxed">
                              {[
                                ...item.selectedVariants.map((v) => v.optionLabel),
                                ...item.selectedToppings.map((t) => `+ ${t.name}`),
                              ].join(' · ')}
                            </p>
                          )}

                          {item.notes && (
                            <p className="mt-1 text-xs italic text-[#64625C]">
                              Catatan: "{item.notes}"
                            </p>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onEditItem(item)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#E8E6DF] px-2.5 py-1 text-xs font-semibold text-[#1B4D3E] hover:bg-[#EEF4F1]"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Ubah</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveItem(item.cartItemId)}
                                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E8E6DF] text-[#64625C] hover:text-[#B91C1C] hover:border-[#F6C5C5]"
                                aria-label="Hapus item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center rounded-lg border border-[#E8E6DF] bg-[#FAF9F6]">
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.cartItemId, -1)}
                                className="flex h-[34px] w-[34px] items-center justify-center text-[#252525] hover:bg-[#EDEAE2] rounded-l-lg"
                                aria-label="Kurangi"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-7 text-center font-mono text-xs font-bold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.cartItemId, 1)}
                                className="flex h-[34px] w-[34px] items-center justify-center text-[#252525] hover:bg-[#EDEAE2] rounded-r-lg"
                                aria-label="Tambah"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-[#E8E6DF] bg-[#FAF9F6] p-4 sm:p-5 space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-[#64625C]">
                    <span>Subtotal ({totalQty} item)</span>
                    <span className="font-mono tabular-nums">{formatRupiah(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#252525] text-base pt-1.5 border-t border-[#E8E6DF]">
                    <span>Total Nett</span>
                    <span className="font-mono text-[#1B4D3E] tabular-nums">
                      {formatRupiah(totalAmount)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('checkout')}
                  className="w-full min-h-[48px] rounded-xl bg-[#1B4D3E] px-5 py-3 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors"
                >
                  Lanjut ke Checkout
                </button>
              </div>
            )}
          </>
        )}

        {/* STEP 2: CHECKOUT */}
        {step === 'checkout' && (
          <form onSubmit={handleProceedToPayment} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
              {/* Order Type */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64625C]">
                  1. Jenis Pesanan
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {settings.enableDineIn && (
                    <button
                      type="button"
                      onClick={() => setOrderType('DINE_IN')}
                      className={`min-h-[54px] flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        orderType === 'DINE_IN'
                          ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                          : 'border-[#E8E6DF] bg-white text-[#252525] hover:bg-[#FAF9F6]'
                      }`}
                    >
                      <UtensilsCrossed className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold leading-tight truncate">Dine In</div>
                        <div className="text-[11px] text-[#64625C] truncate">Di tempat</div>
                      </div>
                    </button>
                  )}

                  {settings.enableTakeaway && (
                    <button
                      type="button"
                      onClick={() => setOrderType('TAKEAWAY')}
                      className={`min-h-[54px] flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        orderType === 'TAKEAWAY'
                          ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                          : 'border-[#E8E6DF] bg-white text-[#252525] hover:bg-[#FAF9F6]'
                      }`}
                    >
                      <ShoppingBag className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold leading-tight truncate">Takeaway</div>
                        <div className="text-[11px] text-[#64625C] truncate">Bawa pulang</div>
                      </div>
                    </button>
                  )}
                </div>

                {orderType === 'DINE_IN' && (
                  <div className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-3.5">
                    {scannedTable ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs text-[#64625C]">Meja Terdeteksi dari QR</div>
                          <div className="mt-0.5 text-sm font-extrabold text-[#1B4D3E]">
                            Meja {scannedTable.name}
                          </div>
                        </div>
                        <span className="rounded-lg bg-[#FCD804] px-2.5 py-1 font-mono text-xs font-extrabold text-[#252525] shrink-0">
                          {scannedTable.name}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-[#252525]">
                          Pilih Nomor Meja
                        </label>
                        <select
                          value={manualTableId}
                          onChange={(e) => setManualTableId(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2.5 text-sm font-semibold focus:border-[#1B4D3E] focus:outline-none"
                        >
                          {activeTables.map((t) => (
                            <option key={t.id} value={t.id}>
                              Meja {t.name} — {t.area}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fulfillment Method */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64625C]">
                  2. Metode Penyerahan
                </h3>
                {orderType === 'TAKEAWAY' ? (
                  <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#EEF4F1] px-4 py-3 text-xs font-semibold text-[#1B4D3E]">
                    Pickup Counter — Pesanan Takeaway diambil di counter saat siap.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {settings.enableTableService && (
                      <button
                        type="button"
                        onClick={() => setFulfillmentMethod('TABLE_SERVICE')}
                        className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          fulfillmentMethod === 'TABLE_SERVICE'
                            ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                            : 'border-[#E8E6DF] bg-white text-[#252525]'
                        }`}
                      >
                        <div className="text-xs font-bold">Antar ke Meja</div>
                        <div className="text-[11px] text-[#64625C]">Diantar staf</div>
                      </button>
                    )}

                    {settings.enablePickupCounter && (
                      <button
                        type="button"
                        onClick={() => setFulfillmentMethod('PICKUP_COUNTER')}
                        className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          fulfillmentMethod === 'PICKUP_COUNTER'
                            ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                            : 'border-[#E8E6DF] bg-white text-[#252525]'
                        }`}
                      >
                        <div className="text-xs font-bold">Pickup Counter</div>
                        <div className="text-[11px] text-[#64625C]">Ambil di bar</div>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Customer Info */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64625C]">
                  3. Data Customer
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-[#252525]">
                    Nama Pemesan <span className="text-[#B91C1C]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="mt-1 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#252525]">
                    Nomor WhatsApp <span className="font-normal text-[#64625C]">(Opsional)</span>
                  </label>
                  <input
                    type="tel"
                    value={customerWhatsapp}
                    onChange={(e) => setCustomerWhatsapp(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="mt-1 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 font-mono text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#252525]">
                    Catatan Pesanan <span className="font-normal text-[#64625C]">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Mis. minta tisu lebih atau sedotan kertas"
                    className="mt-1 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64625C]">
                  4. Metode Pembayaran (Simulasi)
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'QRIS' as const, label: 'QRIS', sub: 'Scan instan', icon: QrCode },
                    { id: 'E_WALLET' as const, label: 'E-Wallet', sub: 'GoPay / OVO', icon: Wallet },
                    { id: 'BANK_TRANSFER' as const, label: 'Transfer Bank', sub: 'Virtual Account', icon: Landmark },
                    { id: 'CASHIER' as const, label: 'Bayar di Kasir', sub: 'Tunai / EDC', icon: Store },
                  ].map((m) => {
                    const Icon = m.icon;
                    const active = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`min-h-[52px] flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                            : 'border-[#E8E6DF] bg-white text-[#252525] hover:bg-[#FAF9F6]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{m.label}</div>
                          <div className="text-[10px] text-[#64625C] truncate">{m.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {paymentMethod === 'E_WALLET' && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {EWALLET_PROVIDERS.map((prov) => (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setEwalletProvider(prov)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          ewalletProvider === prov
                            ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                            : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#252525]'
                        }`}
                      >
                        {prov}
                      </button>
                    ))}
                  </div>
                )}

                {paymentMethod === 'BANK_TRANSFER' && (
                  <select
                    value={bankProvider}
                    onChange={(e) => setBankProvider(e.target.value)}
                    className="w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-2.5 text-xs font-semibold text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
                  >
                    {BANK_PROVIDERS.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Order Summary */}
              <div className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 space-y-2 text-xs">
                <div className="font-bold text-[#252525]">Ringkasan ({totalQty} item)</div>
                {cart.map((it) => (
                  <div key={it.cartItemId} className="flex justify-between gap-2 text-[#64625C]">
                    <span className="truncate">
                      {it.quantity}x {it.productName}
                    </span>
                    <span className="font-mono text-[#252525] tabular-nums shrink-0">
                      {formatRupiah(it.subtotal)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-[#E8E6DF] pt-2 flex justify-between text-sm font-bold text-[#252525]">
                  <span>Total Bayar (Nett)</span>
                  <span className="font-mono text-[#1B4D3E] tabular-nums">
                    {formatRupiah(totalAmount)}
                  </span>
                </div>
              </div>

              {formError && (
                <p className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-3.5 py-2.5 text-xs font-semibold text-[#A62626]">
                  {formError}
                </p>
              )}
            </div>

            <div className="border-t border-[#E8E6DF] bg-white p-4 sm:p-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-3 text-sm font-bold text-white hover:bg-[#143B2F] disabled:opacity-60 transition-colors"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {isSubmitting
                    ? 'Mengirim Pesanan...'
                    : paymentMethod === 'CASHIER'
                      ? `Buat Pesanan · ${formatRupiah(totalAmount)}`
                      : `Lanjut Pembayaran · ${formatRupiah(totalAmount)}`}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: PAYMENT SIMULATION */}
        {step === 'payment' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 text-center">
                <p className="text-xs font-medium text-[#64625C]">Total Pembayaran (Nett)</p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-[#1B4D3E] tabular-nums">
                  {formatRupiah(totalAmount)}
                </p>
                <p className="mt-1 text-xs text-[#64625C]">
                  {getOrderTypeLabel(orderType)}
                  {resolvedTable ? ` · Meja ${resolvedTable.name}` : ''} ·{' '}
                  {getFulfillmentLabel(
                    orderType === 'TAKEAWAY' ? 'PICKUP_COUNTER' : fulfillmentMethod,
                  )}
                </p>
              </div>

              {paymentMethod === 'QRIS' && (
                <div className="flex flex-col items-center rounded-2xl border border-[#E8E6DF] bg-white p-5">
                  <span className="text-xs font-bold tracking-wider text-[#1B4D3E] uppercase">
                    QRIS Simulasi — {settings.name}
                  </span>
                  <div className="mt-3 rounded-xl border border-[#E8E6DF] p-3 bg-white">
                    <QrCodeCanvas
                      value={`SIMULASI-QRIS|${settings.name}|${totalAmount}|${customerName}`}
                      size={180}
                      darkColor="#252525"
                      alt="QRIS Simulasi Pembayaran"
                    />
                  </div>
                  <p className="mt-3 text-center text-xs text-[#64625C] leading-relaxed">
                    Kode ini hanya simulasi. Pesanan akan dibuat dengan status menunggu pembayaran sampai pembayaran terverifikasi.
                  </p>
                </div>
              )}

              {paymentMethod === 'E_WALLET' && (
                <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-2 text-center">
                  <Wallet className="h-8 w-8 text-[#1B4D3E] mx-auto" />
                  <h3 className="text-sm font-bold text-[#252525]">
                    Instruksi E-Wallet ({ewalletProvider})
                  </h3>
                  <p className="text-xs text-[#64625C] leading-relaxed">
                    Selesaikan pembayaran sebesar{' '}
                    <strong className="font-mono text-[#252525]">{formatRupiah(totalAmount)}</strong>{' '}
                    atas nama <strong className="text-[#252525]">{customerName}</strong> siap diproses.
                  </p>
                </div>
              )}

              {paymentMethod === 'BANK_TRANSFER' && (
                <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-3">
                  <div className="text-xs font-bold text-[#64625C]">{activeBankObj.name}</div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FAF9F6] border border-[#E8E6DF] px-3.5 py-3">
                    <span className="font-mono text-sm font-bold text-[#252525] tabular-nums">
                      {activeBankObj.va}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyVa}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#E8E6DF] px-2.5 py-1 text-xs font-semibold text-[#1B4D3E]"
                    >
                      {copiedVa ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedVa ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-[#64625C]">
                    Nomor Virtual Account bersifat simulasi demo. Pesanan dibuat sebagai menunggu pembayaran; status lunas hanya dapat dikonfirmasi sistem pembayaran atau kasir.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-[#E8E6DF] bg-white p-4 sm:p-5 space-y-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmPaymentInstruction}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-3 text-sm font-bold text-white hover:bg-[#143B2F] disabled:opacity-60 transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#FCD804]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[#FCD804]" />
                )}
                <span>
                  {isSubmitting ? 'Membuat Pesanan...' : 'Buat Pesanan'}
                </span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSimulatePaymentFailed}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-2.5 text-xs font-bold text-[#A62626] hover:bg-[#FADADA] disabled:opacity-60 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                <span>Batalkan Simulasi Pembayaran</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: PAYMENT FAILED */}
        {step === 'payment_failed' && (
          <div className="flex-1 flex flex-col justify-between p-6">
            <div className="my-auto text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDECEC] text-[#B91C1C]">
                <XCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-extrabold text-[#252525]">
                Simulasi Pembayaran Gagal
              </h3>
              <p className="text-sm text-[#64625C] leading-relaxed max-w-xs mx-auto">
                Pesanan belum dibuat dan tidak dikirim ke dapur. Anda dapat mencoba kembali atau mengganti metode pembayaran.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStep('payment')}
                className="w-full min-h-[48px] rounded-xl bg-[#1B4D3E] px-5 py-3 text-sm font-bold text-white hover:bg-[#143B2F]"
              >
                Coba Bayar Lagi
              </button>
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full min-h-[44px] rounded-xl border border-[#E8E6DF] bg-white px-5 py-2.5 text-sm font-semibold text-[#252525] hover:bg-[#FAF9F6]"
              >
                Ganti Metode Pembayaran
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
