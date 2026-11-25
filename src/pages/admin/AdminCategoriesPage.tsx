import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { ConfirmModal } from '../../components/ConfirmModal';

export const AdminCategoriesPage: React.FC = () => {
  const { state, addCategory, updateCategory, deleteCategory, pushToast } = usePos();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const sortedCategories = [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (state.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      pushToast('Nama kategori sudah ada', 'warning');
      return;
    }
    addCategory(trimmed);
    setNewName('');
    pushToast(`Kategori "${trimmed}" ditambahkan`, 'success');
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    updateCategory(id, { name: trimmed });
    setEditingId(null);
    setEditingName('');
    pushToast('Kategori diperbarui', 'success');
  };

  const targetCategory = state.categories.find((c) => c.id === deleteTargetId);

  return (
    <div className="space-y-6 max-w-4xl">
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
                const productCount = state.products.filter((p) => p.categoryId === cat.id).length;
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
                          updateCategory(cat.id, { isActive: !cat.isActive });
                          pushToast(
                            `Kategori "${cat.name}" ${!cat.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
                            'default',
                          );
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
            deleteCategory(deleteTargetId);
            pushToast('Kategori dihapus', 'default');
          }
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
};
