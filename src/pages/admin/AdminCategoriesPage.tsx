import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Category, Product } from '../../types/pos';
import { ConfirmModal } from '../../components/ConfirmModal';

export const AdminCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const load = async () => { const [categoriesResponse, productsResponse] = await Promise.all([fetch('/api/v1/categories'), fetch('/api/v1/products')]); const [categoryData, productData] = await Promise.all([categoriesResponse.json(), productsResponse.json()]); if (!categoriesResponse.ok || !productsResponse.ok) { setError(categoryData?.error || productData?.error || 'Kategori tidak dapat dimuat.'); return; } setCategories(categoryData); setProducts(productData.map((product: Product) => ({ ...product, image: product.image || '', variantGroups: [], toppings: [] }))); setError(''); };
  useEffect(() => { void load(); }, []);
  const request = async (url: string, method: string, body?: unknown) => { const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); const data = response.status === 204 ? null : await response.json(); if (!response.ok) { setError(data?.error || 'Perubahan kategori tidak dapat disimpan.'); return false; } await load(); return true; };
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Nama kategori sudah ada.');
      return;
    }
    void request('/api/v1/categories', 'POST', { name: trimmed, sortOrder: categories.length }).then((ok) => { if (ok) { setNewName(''); setNotice(`Kategori “${trimmed}” ditambahkan.`); } });
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    void request(`/api/v1/categories/${id}`, 'PATCH', { name: trimmed }).then((ok) => { if (ok) { setEditingId(null); setEditingName(''); setNotice('Kategori diperbarui.'); } });
  };

  const targetCategory = categories.find((c) => c.id === deleteTargetId);

  return (
    <div className="space-y-6 max-w-4xl">
      {notice && <div role="status" className="rounded-xl border border-[#B8E1C8] bg-[#E9F5EE] px-4 py-3 text-sm text-[#15623A]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">{error}</div>}
      {/* Add Category Bar */}
      <form
        onSubmit={handleAdd}
        className="flex flex-col sm:flex-row gap-3 rounded-2xl border border-[#E8E6DF] bg-white p-5"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nama kategori baru (mis. Seasonal, Tea, Bakery)"
          className="flex-1 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 text-sm text-[#252525] placeholder:text-[#8C8980] focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Kategori</span>
        </button>
      </form>

      {/* Category Table */}
      <div className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
        <div className="border-b border-[#E8E6DF] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#252525]">Daftar Kategori Menu</h2>
            <p className="text-xs text-[#64625C] mt-0.5">
              Kategori aktif akan muncul pada filter katalog di halaman pemesanan customer
            </p>
          </div>
          <span className="font-mono text-xs text-[#64625C] tabular-nums">
            {sortedCategories.length} kategori
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8E6DF] bg-[#FAF9F6] text-xs font-semibold text-[#64625C]">
                <th className="px-6 py-3 w-20">Urutan</th>
                <th className="px-4 py-3">Nama Kategori</th>
                <th className="px-4 py-3 text-right">Jumlah Produk</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E6DF] text-sm">
              {sortedCategories.map((cat) => {
                const productCount = products.filter((p) => p.categoryId === cat.id).length;
                const isEditing = editingId === cat.id;

                return (
                  <tr key={cat.id} className="hover:bg-[#FAF9F6]/70 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs text-[#64625C] tabular-nums">
                      #{cat.sortOrder}
                    </td>
                    <td className="px-4 py-3.5">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="rounded-lg border border-[#1B4D3E] bg-white px-3 py-1.5 text-sm text-[#252525] focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(cat.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1B4D3E] text-white hover:bg-[#143B2F]"
                            aria-label="Simpan"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] text-[#64625C] hover:bg-[#FAF9F6]"
                            aria-label="Batal"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-semibold text-[#252525]">{cat.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-[#252525] tabular-nums">
                      {productCount} produk
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          void request(`/api/v1/categories/${cat.id}`, 'PATCH', { isActive: !cat.isActive }).then((ok) => { if (ok) setNotice(`Kategori “${cat.name}” ${!cat.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`); });
                        }}
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                          cat.isActive
                            ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A]'
                            : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#64625C]'
                        }`}
                      >
                        {cat.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(cat.id);
                            setEditingName(cat.name);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white text-[#64625C] hover:text-[#252525] hover:bg-[#FAF9F6]"
                          aria-label={`Edit ${cat.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(cat.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white text-[#64625C] hover:text-[#B91C1C] hover:border-[#F6C5C5]"
                          aria-label={`Hapus ${cat.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteTargetId)}
        title={`Hapus Kategori "${targetCategory?.name ?? ''}"?`}
        description="Produk yang terhubung dengan kategori ini tetap tersimpan namun perlu dipindahkan ke kategori lain agar mudah ditemukan."
        confirmLabel="Hapus Kategori"
        destructive
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            void request(`/api/v1/categories/${deleteTargetId}`, 'DELETE').then((ok) => { if (ok) setNotice('Kategori dinonaktifkan.'); });
          }
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
};
