import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, X, Check } from 'lucide-react';
import type {
  CartItem,
  Product,
  SelectedTopping,
  SelectedVariant,
} from '../../types/pos';
import { formatRupiah } from '../../utils/format';
import { ProductImage } from '../ProductImage';

interface ProductDetailModalProps {
  product: Product | null;
  editingItem?: CartItem | null;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  editingItem,
  onClose,
  onConfirm,
}) => {
  const [selectedVariantMap, setSelectedVariantMap] = useState<Record<string, string>>({});
  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  useEffect(() => {
    if (!product) return;

    if (editingItem && editingItem.productId === product.id) {
      const vMap: Record<string, string> = {};
      product.variantGroups.forEach((group) => {
        const match = editingItem.selectedVariants.find((v) => v.groupId === group.id);
        vMap[group.id] = match?.optionId ?? group.options[0]?.id ?? '';
      });
      setSelectedVariantMap(vMap);
      setSelectedToppingIds(editingItem.selectedToppings.map((t) => t.id));
      setQuantity(editingItem.quantity);
      setNotes(editingItem.notes || '');
    } else {
      const defaults: Record<string, string> = {};
      product.variantGroups.forEach((group) => {
        if (group.options[0]) {
          defaults[group.id] = group.options[0].id;
        }
      });
      setSelectedVariantMap(defaults);
      setSelectedToppingIds([]);
      setQuantity(1);
      setNotes('');
    }
  }, [product, editingItem]);

  const selectedVariants: SelectedVariant[] = useMemo(() => {
    if (!product) return [];
    const list: SelectedVariant[] = [];
    product.variantGroups.forEach((group) => {
      const optId = selectedVariantMap[group.id];
      const opt = group.options.find((o) => o.id === optId) ?? group.options[0];
      if (opt) {
        list.push({
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionLabel: opt.label,
          priceDelta: opt.priceDelta,
        });
      }
    });
    return list;
  }, [product, selectedVariantMap]);

  const selectedToppings: SelectedTopping[] = useMemo(() => {
    if (!product) return [];
    return product.toppings
      .filter((t) => selectedToppingIds.includes(t.id))
      .map((t) => ({ id: t.id, name: t.name, price: t.price }));
  }, [product, selectedToppingIds]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    const variantExtra = selectedVariants.reduce((sum, v) => sum + v.priceDelta, 0);
    const toppingExtra = selectedToppings.reduce((sum, t) => sum + t.price, 0);
    return product.price + variantExtra + toppingExtra;
  }, [product, selectedVariants, selectedToppings]);

  const totalPrice = unitPrice * quantity;

  if (!product) return null;

  const toggleTopping = (id: string) => {
    setSelectedToppingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    const cartItem: CartItem = {
      cartItemId: editingItem?.cartItemId ?? `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      productName: product.name,
      productImage: product.image,
      basePrice: product.price,
      selectedVariants,
      selectedToppings,
      quantity,
      notes: notes.trim(),
      unitPrice,
      subtotal: totalPrice,
    };
    onConfirm(cartItem);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E8E6DF] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab indicator */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 bg-white">
          <div className="h-1.5 w-10 rounded-full bg-[#D9D6CD]" />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="relative aspect-[16/10] w-full bg-[#F2EFE9]">
            <ProductImage src={product.image} alt={product.name} />
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3.5 top-3.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#252525] shadow-md hover:bg-white"
              aria-label="Tutup detail produk"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <h2 id="product-modal-title" className="text-xl font-extrabold tracking-tight text-[#252525]">
                  {product.name}
                </h2>
                <span className="font-mono text-base font-bold text-[#1B4D3E] tabular-nums shrink-0">
                  {formatRupiah(product.price)}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[#64625C]">
                {product.description}
              </p>
            </div>

            {/* Variant Groups */}
            {product.variantGroups.map((group) => (
              <div key={group.id} className="space-y-2.5 border-t border-[#E8E6DF] pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#252525]">{group.name}</h3>
                  <span className="text-xs text-[#64625C]">Pilih 1</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.options.map((opt) => {
                    const selected = selectedVariantMap[group.id] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setSelectedVariantMap((prev) => ({
                            ...prev,
                            [group.id]: opt.id,
                          }))
                        }
                        className={`min-h-[44px] flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-[#1B4D3E] bg-[#EEF4F1] text-[#1B4D3E]'
                            : 'border-[#E8E6DF] bg-white text-[#252525] hover:bg-[#FAF9F6]'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {opt.priceDelta > 0 && (
                          <span className="font-mono text-[11px] tabular-nums shrink-0">
                            +{formatRupiah(opt.priceDelta)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Toppings */}
            {product.toppings.length > 0 && (
              <div className="space-y-2.5 border-t border-[#E8E6DF] pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#252525]">Topping Tambahan</h3>
                  <span className="text-xs text-[#64625C]">Opsional</span>
                </div>
                <div className="space-y-2">
                  {product.toppings.map((top) => {
                    const checked = selectedToppingIds.includes(top.id);
                    return (
                      <button
                        key={top.id}
                        type="button"
                        onClick={() => toggleTopping(top.id)}
                        className={`min-h-[44px] w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                          checked
                            ? 'border-[#1B4D3E] bg-[#EEF4F1]'
                            : 'border-[#E8E6DF] bg-white hover:bg-[#FAF9F6]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 text-sm font-medium text-[#252525]">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              checked
                                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                                : 'border-[#CFCBC0] bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <span>{top.name}</span>
                        </span>
                        <span className="font-mono text-xs font-semibold text-[#1B4D3E] tabular-nums">
                          +{formatRupiah(top.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="border-t border-[#E8E6DF] pt-4">
              <label className="block text-sm font-bold text-[#252525]">
                Catatan Khusus <span className="font-normal text-xs text-[#64625C]">(Opsional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: pisahkan es, tanpa sedotan, extra panas..."
                className="mt-2 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-3 text-sm text-[#252525] placeholder:text-[#8C8980] focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Sticky Purchase Footer */}
        <div className="border-t border-[#E8E6DF] bg-white px-5 py-4 flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-[#E8E6DF] bg-[#FAF9F6]">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-11 w-11 items-center justify-center text-[#252525] hover:bg-[#EDEAE2] rounded-l-xl transition-colors"
              aria-label="Kurangi jumlah"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-9 text-center font-mono text-sm font-bold text-[#252525] tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-11 w-11 items-center justify-center text-[#252525] hover:bg-[#EDEAE2] rounded-r-xl transition-colors"
              aria-label="Tambah jumlah"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 min-h-[44px] flex items-center justify-between gap-2 rounded-xl bg-[#1B4D3E] px-4 py-3 text-sm font-bold text-white hover:bg-[#143B2F] active:scale-[0.99] transition-all"
          >
            <span className="truncate">
              {editingItem ? 'Simpan Perubahan' : 'Tambah ke Keranjang'}
            </span>
            <span className="font-mono text-sm font-bold text-[#FCD804] tabular-nums shrink-0">
              {formatRupiah(totalPrice)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
