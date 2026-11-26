import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X } from 'lucide-react';
import { PRODUCT_IMAGES } from '../../data/seedData';
import type { Category, Product, ToppingOption, VariantGroup } from '../../types/pos';
import { formatRupiah } from '../../utils/format';
import { ProductImage } from '../../components/ProductImage';
import { ConfirmModal } from '../../components/ConfirmModal';

const PRESET_IMAGE_OPTIONS = [
  { label: 'Espresso', url: PRODUCT_IMAGES.espresso },
  { label: 'Americano', url: PRODUCT_IMAGES.americano },
  { label: 'Cafe Latte', url: PRODUCT_IMAGES.cafeLatte },
  { label: 'Cappuccino', url: PRODUCT_IMAGES.cappuccino },
  { label: 'Es Kopi Susu', url: PRODUCT_IMAGES.esKopiSusu },
  { label: 'Matcha Latte', url: PRODUCT_IMAGES.matchaLatte },
  { label: 'Chocolate', url: PRODUCT_IMAGES.chocolate },
  { label: 'Croissant', url: PRODUCT_IMAGES.croissant },
];

interface ProductFormState {
  id?: string;
  name: string;
  categoryId: string;
  price: number;
  description: string;
  image: string;
  isActive: boolean;
  variantGroups: VariantGroup[];
  toppings: ToppingOption[];
}

export const AdminMenuPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const state = { categories, products };
  const load = async () => {
    const [categoryResponse, productResponse] = await Promise.all([fetch('/api/v1/categories'), fetch('/api/v1/products')]);
    const [categoryData, productData] = await Promise.all([categoryResponse.json(), productResponse.json()]);
    if (!categoryResponse.ok || !productResponse.ok) { setError(categoryData?.error || productData?.error || 'Menu tidak dapat dimuat.'); return; }
    const richProducts = await Promise.all(productData.map(async (product: { id: string; categoryId: string; name: string; description: string; price: number; imageUrl: string; isActive: boolean }) => { const response = await fetch(`/api/v1/products/${product.id}/customizations`); const customizations = response.ok ? await response.json() : { variants: [], addons: [] }; const groups = new Map<string, VariantGroup>(); customizations.variants.forEach((item: { id: string; groupName: string; optionName: string; priceDelta: number; required: boolean }) => { const group = groups.get(item.groupName) ?? { id: item.groupName, name: item.groupName, required: item.required, options: [] }; group.required = group.required || item.required; group.options.push({ id: item.id, label: item.optionName, priceDelta: item.priceDelta }); groups.set(item.groupName, group); }); return { ...product, image: product.imageUrl || '', variantGroups: [...groups.values()], toppings: customizations.addons.map((item: { id: string; name: string; price: number }) => ({ id: item.id, name: item.name, price: item.price })) } as Product; }));
    setCategories(categoryData); setProducts(richProducts); setError('');
  };
  useEffect(() => { void load(); }, []);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    state.categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [state.categories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.products.filter((prod) => {
      if (categoryFilter !== 'ALL' && prod.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        prod.name.toLowerCase().includes(q) ||
        prod.description.toLowerCase().includes(q)
      );
    });
  }, [state.products, categoryFilter, search]);

  const openCreateModal = () => {
    setForm({
      name: '',
      categoryId: state.categories[0]?.id ?? 'cat-coffee',
      price: 22000,
      description: '',
      image: PRODUCT_IMAGES.cafeLatte,
      isActive: true,
      variantGroups: [
        {
          id: `vg-${Date.now()}`,
          name: 'Ukuran',
          required: true,
          options: [
            { id: `opt-${Date.now()}-1`, label: 'Regular', priceDelta: 0 },
            { id: `opt-${Date.now()}-2`, label: 'Large', priceDelta: 5000 },
          ],
        },
      ],
      toppings: [{ id: `top-${Date.now()}-1`, name: 'Extra Espresso Shot', price: 6000 }],
    });
    setEditorOpen(true);
  };

  const openEditModal = (product: Product) => {
    setForm({
      id: product.id,
      name: product.name,
      categoryId: product.categoryId,
      price: product.price,
      description: product.description,
      image: product.image,
      isActive: product.isActive,
      variantGroups: JSON.parse(JSON.stringify(product.variantGroups)),
      toppings: JSON.parse(JSON.stringify(product.toppings)),
    });
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError('Nama produk wajib diisi.');
      return;
    }

    const cleanedVariants = form.variantGroups
      .filter((g) => g.name.trim() && g.options.some((o) => o.label.trim()))
      .map((g) => ({
        ...g,
        name: g.name.trim(),
        options: g.options
          .filter((o) => o.label.trim())
          .map((o) => ({
            ...o,
            label: o.label.trim(),
            priceDelta: Math.max(0, Number(o.priceDelta) || 0),
          })),
      }));

    const cleanedToppings = form.toppings
      .filter((t) => t.name.trim())
      .map((t) => ({
        ...t,
        name: t.name.trim(),
        price: Math.max(0, Number(t.price) || 0),
      }));

    const payload = {
      name: trimmedName,
      categoryId: form.categoryId,
      price: Math.max(0, Number(form.price) || 0),
      description: form.description.trim(),
      imageUrl: form.image.trim(),
      isActive: form.isActive,
      customizations: {
        variants: cleanedVariants.flatMap((group) => group.options.map((option) => ({ groupName: group.name, optionName: option.label, priceDelta: option.priceDelta, required: group.required }))),
        addons: cleanedToppings.map((topping) => ({ name: topping.name, price: topping.price, isActive: true })),
      },
    };
    setSaving(true);
    const response = await fetch(form.id ? `/api/v1/products/${form.id}/with-customizations` : '/api/v1/products/with-customizations', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = response.status === 204 ? null : await response.json(); setSaving(false);
    if (!response.ok) { setError(result?.error || result?.message || 'Produk tidak dapat disimpan.'); return; }
    setNotice(`Produk “${trimmedName}” ${form.id ? 'diperbarui' : 'ditambahkan'}.`); setEditorOpen(false); setForm(null); await load();
  };

  const addVariantGroup = () => {
    if (!form) return;
    const ts = Date.now();
    setForm({
      ...form,
      variantGroups: [
        ...form.variantGroups,
        {
          id: `vg-${ts}`,
          name: 'Pilihan Baru',
          required: true,
          options: [{ id: `opt-${ts}-1`, label: 'Standar', priceDelta: 0 }],
        },
      ],
    });
  };

  const removeVariantGroup = (groupId: string) => {
    if (!form) return;
    setForm({
      ...form,
      variantGroups: form.variantGroups.filter((g) => g.id !== groupId),
    });
  };

  const addVariantOption = (groupId: string) => {
    if (!form) return;
    setForm({
      ...form,
      variantGroups: form.variantGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              options: [
                ...g.options,
                { id: `opt-${Date.now()}`, label: '', priceDelta: 0 },
              ],
            }
          : g,
      ),
    });
  };

  const addTopping = () => {
    if (!form) return;
    setForm({
      ...form,
      toppings: [
        ...form.toppings,
        { id: `top-${Date.now()}`, name: '', price: 4000 },
      ],
    });
  };

  const targetDelete = state.products.find((p) => p.id === deleteTargetId);

  return (
    <div className="space-y-6">
      {notice && <div role="status" className="rounded-xl border border-[#B8E1C8] bg-[#E9F5EE] px-4 py-3 text-sm text-[#15623A]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">{error}</div>}
      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64625C]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk..."
              className="w-full rounded-xl border border-[#E8E6DF] bg-white py-2.5 pl-10 pr-4 text-sm text-[#252525] placeholder:text-[#8C8980] focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm font-medium text-[#252525] focus:border-[#1B4D3E] focus:outline-none"
          >
            <option value="ALL">Semua Kategori</option>
            {state.categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Produk</span>
        </button>
      </div>

      {/* Product List: Mobile Cards (< md) + Desktop Table (md+) */}
      <div className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#64625C]">
            Tidak ada produk yang cocok dengan pencarian Anda.
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-[#E8E6DF]">
              {filteredProducts.map((product) => (
                <div key={product.id} className="p-4 flex gap-3.5">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#E8E6DF] bg-[#FAF9F6]">
                    <ProductImage src={product.image} alt={product.name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#252525] truncate">
                          {product.name}
                        </div>
                        <div className="text-xs text-[#64625C]">
                          {categoryMap.get(product.categoryId) ?? 'Lainnya'} ·{' '}
                          {product.variantGroups.length} varian · {product.toppings.length} topping
                        </div>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#1B4D3E] tabular-nums shrink-0">
                        {formatRupiah(product.price)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void fetch(`/api/v1/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !product.isActive }) }).then(async (response) => { if (!response.ok) { const data = await response.json(); setError(data?.error || 'Status produk tidak dapat disimpan.'); return; } setNotice(`${product.name} ${!product.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`); await load(); });
                        }}
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                          product.isActive
                            ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A]'
                            : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#64625C]'
                        }`}
                      >
                        {product.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white text-[#64625C] hover:text-[#252525]"
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(product.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white text-[#64625C] hover:text-[#B91C1C]"
                          aria-label={`Hapus ${product.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E6DF] bg-[#FAF9F6] text-xs font-semibold text-[#64625C]">
                    <th className="px-6 py-3.5">Produk</th>
                    <th className="px-4 py-3.5">Kategori</th>
                    <th className="px-4 py-3.5 text-right">Harga Nett</th>
                    <th className="px-4 py-3.5">Kustomisasi</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E6DF] text-sm">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-[#FAF9F6]/70 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3.5">
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-[#E8E6DF] bg-[#FAF9F6]">
                            <ProductImage src={product.image} alt={product.name} />
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <div className="font-semibold text-[#252525] truncate">
                              {product.name}
                            </div>
                            <div className="text-xs text-[#64625C] line-clamp-1">
                              {product.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-[#64625C] whitespace-nowrap">
                        {categoryMap.get(product.categoryId) ?? 'Lainnya'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-[#252525] tabular-nums whitespace-nowrap">
                        {formatRupiah(product.price)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#64625C] whitespace-nowrap">
                        <span>{product.variantGroups.length} grup varian</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{product.toppings.length} topping</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => {
                            void fetch(`/api/v1/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !product.isActive }) }).then(async (response) => { if (!response.ok) { const data = await response.json(); setError(data?.error || 'Status produk tidak dapat disimpan.'); return; } setNotice(`${product.name} ${!product.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`); await load(); });
                          }}
                          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                            product.isActive
                              ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A]'
                              : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#64625C]'
                          }`}
                        >
                          {product.isActive ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(product)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white text-[#64625C] hover:text-[#252525] hover:bg-[#FAF9F6]"
                            aria-label={`Edit ${product.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(product.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white text-[#64625C] hover:text-[#B91C1C] hover:border-[#F6C5C5]"
                            aria-label={`Hapus ${product.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Product Add/Edit Modal */}
      {editorOpen && form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[#E8E6DF] bg-white shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-[#E8E6DF] px-6 py-4">
              <h3 className="text-base font-bold text-[#252525]">
                {form.id ? 'Edit Produk' : 'Tambah Produk Baru'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setForm(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64625C] hover:bg-[#FAF9F6]"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#252525]">
                    Nama Produk
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Contoh: Es Kopi Susu Aren"
                    className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#252525]">
                    Kategori
                  </label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  >
                    {state.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#252525]">
                    Harga Dasar Nett (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#252525]">
                    Deskripsi Singkat
                  </label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Jelaskan rasa, bahan, atau keunikan menu ini..."
                    className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#252525]">
                    Foto Produk (Pilih Galeri Studio atau URL)
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PRESET_IMAGE_OPTIONS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setForm({ ...form, image: preset.url })}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          form.image === preset.url
                            ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                            : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#252525] hover:bg-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    placeholder="/src/assets/images/... atau https://..."
                    className="mt-2 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2 font-mono text-xs focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Variant Groups Editor */}
              <div className="border-t border-[#E8E6DF] pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[#252525]">Grup Varian</h4>
                    <p className="text-xs text-[#64625C]">
                      Contoh: Ukuran (Regular/Large), Penyajian (Hot/Iced), Gula, Es
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addVariantGroup}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#1B4D3E] hover:bg-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Grup Varian</span>
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {form.variantGroups.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              variantGroups: form.variantGroups.map((g) =>
                                g.id === group.id ? { ...g, name: e.target.value } : g,
                              ),
                            })
                          }
                          placeholder="Nama Grup (mis. Ukuran)"
                          className="flex-1 rounded-lg border border-[#E8E6DF] bg-white px-3 py-1.5 text-xs font-semibold focus:border-[#1B4D3E] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariantGroup(group.id)}
                          className="rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 text-xs text-[#B91C1C] hover:bg-[#FDECEC]"
                        >
                          Hapus Grup
                        </button>
                      </div>

                      <div className="space-y-2">
                        {group.options.map((opt) => (
                          <div key={opt.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt.label}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  variantGroups: form.variantGroups.map((g) =>
                                    g.id === group.id
                                      ? {
                                          ...g,
                                          options: g.options.map((o) =>
                                            o.id === opt.id
                                              ? { ...o, label: e.target.value }
                                              : o,
                                          ),
                                        }
                                      : g,
                                  ),
                                })
                              }
                              placeholder="Nama opsi (mis. Large)"
                              className="flex-1 rounded-lg border border-[#E8E6DF] bg-white px-3 py-1.5 text-xs focus:border-[#1B4D3E] focus:outline-none"
                            />
                            <input
                              type="number"
                              min={0}
                              step={500}
                              value={opt.priceDelta}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  variantGroups: form.variantGroups.map((g) =>
                                    g.id === group.id
                                      ? {
                                          ...g,
                                          options: g.options.map((o) =>
                                            o.id === opt.id
                                              ? { ...o, priceDelta: Number(e.target.value) }
                                              : o,
                                          ),
                                        }
                                      : g,
                                  ),
                                })
                              }
                              placeholder="+Harga"
                              className="w-28 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#1B4D3E] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  variantGroups: form.variantGroups.map((g) =>
                                    g.id === group.id
                                      ? {
                                          ...g,
                                          options: g.options.filter((o) => o.id !== opt.id),
                                        }
                                      : g,
                                  ),
                                })
                              }
                              className="p-1.5 text-[#64625C] hover:text-[#B91C1C]"
                              aria-label="Hapus opsi"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addVariantOption(group.id)}
                          className="text-xs font-semibold text-[#1B4D3E] hover:underline"
                        >
                          + Tambah Opsi
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Toppings Editor */}
              <div className="border-t border-[#E8E6DF] pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[#252525]">Topping Tambahan</h4>
                    <p className="text-xs text-[#64625C]">
                      Opsional dan bisa dipilih lebih dari satu oleh customer
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addTopping}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#1B4D3E] hover:bg-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Topping</span>
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {form.toppings.map((top) => (
                    <div key={top.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={top.name}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            toppings: form.toppings.map((t) =>
                              t.id === top.id ? { ...t, name: e.target.value } : t,
                            ),
                          })
                        }
                        placeholder="Nama topping (mis. Oat Milk)"
                        className="flex-1 rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-3 py-2 text-xs focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                      />
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={top.price}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            toppings: form.toppings.map((t) =>
                              t.id === top.id ? { ...t, price: Number(e.target.value) } : t,
                            ),
                          })
                        }
                        placeholder="Harga"
                        className="w-28 rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] px-2.5 py-2 font-mono text-xs tabular-nums focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            toppings: form.toppings.filter((t) => t.id !== top.id),
                          })
                        }
                        className="p-1.5 text-[#64625C] hover:text-[#B91C1C]"
                        aria-label="Hapus topping"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#E8E6DF] bg-[#FAF9F6] px-6 py-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#252525] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 rounded accent-[#1B4D3E]"
                />
                <span>Produk aktif di katalog customer</span>
              </label>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditorOpen(false);
                    setForm(null);
                  }}
                  className="rounded-xl border border-[#E8E6DF] bg-white px-4 py-2 text-sm font-semibold text-[#252525] hover:bg-[#FAF9F6]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#1B4D3E] px-5 py-2 text-sm font-semibold text-white hover:bg-[#143B2F]"
                >
                  {saving ? 'Menyimpan…' : 'Simpan Produk'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTargetId)}
        title={`Hapus "${targetDelete?.name ?? ''}"?`}
        description="Produk akan dihapus dari katalog pemesanan customer. Riwayat pesanan lama tidak akan terpengaruh."
        confirmLabel="Hapus Produk"
        destructive
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            void fetch(`/api/v1/products/${deleteTargetId}`, { method: 'DELETE' }).then(async (response) => { if (!response.ok) { const data = await response.json(); setError(data?.error || 'Produk tidak dapat diarsipkan.'); return; } setNotice('Produk diarsipkan dari menu.'); await load(); });
          }
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
};
