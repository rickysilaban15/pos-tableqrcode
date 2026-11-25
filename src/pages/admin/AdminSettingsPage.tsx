import React, { useEffect, useRef, useState } from 'react';
import { Save, RotateCcw, Upload, AlertTriangle } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import type { CafeSettings } from '../../types/pos';
import { getQrUrlWarning, normalizeBaseUrl } from '../../utils/format';
import { BrandMark } from '../../components/BrandMark';
import { ConfirmModal } from '../../components/ConfirmModal';

export const AdminSettingsPage: React.FC = () => {
  const { state, updateCafeSettings, resetDemoData, pushToast } = usePos();
  const [form, setForm] = useState<CafeSettings>(state.cafeSettings);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const lastSettingsJsonRef = useRef<string>(JSON.stringify(state.cafeSettings));

  useEffect(() => {
    const nextJson = JSON.stringify(state.cafeSettings);
    if (nextJson !== lastSettingsJsonRef.current) {
      lastSettingsJsonRef.current = nextJson;
      setForm(state.cafeSettings);
    }
  }, [state.cafeSettings]);

  const handleToggleOrderType = (key: 'enableDineIn' | 'enableTakeaway') => {
    const nextVal = !form[key];
    const otherKey = key === 'enableDineIn' ? 'enableTakeaway' : 'enableDineIn';
    if (!nextVal && !form[otherKey]) {
      pushToast('Minimal satu jenis pesanan (Dine In atau Takeaway) harus aktif', 'warning');
      return;
    }
    setForm((prev) => ({ ...prev, [key]: nextVal }));
  };

  const handleToggleFulfillment = (key: 'enableTableService' | 'enablePickupCounter') => {
    const nextVal = !form[key];
    const otherKey =
      key === 'enableTableService' ? 'enablePickupCounter' : 'enableTableService';
    if (!nextVal && !form[otherKey]) {
      pushToast('Minimal satu metode penyerahan harus aktif', 'warning');
      return;
    }
    setForm((prev) => ({ ...prev, [key]: nextVal }));
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_200_000) {
      pushToast('Ukuran logo maksimal 1.2 MB', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, logoUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug =
      form.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || 'laris-coffee';

    updateCafeSettings({
      ...form,
      name: form.name.trim() || 'LARIS Coffee',
      slug: cleanSlug,
      qrBaseUrl: normalizeBaseUrl(form.qrBaseUrl),
    });
    pushToast('Pengaturan cafe disimpan dan langsung berlaku di web customer', 'success');
  };

  const qrWarning = getQrUrlWarning(form.qrBaseUrl);

  return (
    <div className="space-y-6 max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Service Configuration Toggles */}
        <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
          <h2 className="text-base font-bold text-[#252525]">
            Konfigurasi Layanan Pemesanan
          </h2>
          <p className="mt-1 text-xs text-[#64625C]">
            Opsi yang dinonaktifkan di sini otomatis disembunyikan pada halaman Checkout customer.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-start justify-between gap-4 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 cursor-pointer">
              <div>
                <div className="text-sm font-bold text-[#252525]">Dine In</div>
                <div className="mt-0.5 text-xs text-[#64625C]">
                  Pemesanan makan/minum di tempat menggunakan QR meja
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.enableDineIn}
                onChange={() => handleToggleOrderType('enableDineIn')}
                className="mt-1 h-4 w-4 accent-[#1B4D3E]"
              />
            </label>

            <label className="flex items-start justify-between gap-4 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 cursor-pointer">
              <div>
                <div className="text-sm font-bold text-[#252525]">Takeaway</div>
                <div className="mt-0.5 text-xs text-[#64625C]">
                  Pemesanan bawa pulang tanpa nomor meja (otomatis Pickup Counter)
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.enableTakeaway}
                onChange={() => handleToggleOrderType('enableTakeaway')}
                className="mt-1 h-4 w-4 accent-[#1B4D3E]"
              />
            </label>

            <label className="flex items-start justify-between gap-4 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 cursor-pointer">
              <div>
                <div className="text-sm font-bold text-[#252525]">
                  Table Service (Antar ke Meja)
                </div>
                <div className="mt-0.5 text-xs text-[#64625C]">
                  Staf mengantarkan pesanan langsung ke nomor meja customer
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.enableTableService}
                onChange={() => handleToggleFulfillment('enableTableService')}
                className="mt-1 h-4 w-4 accent-[#1B4D3E]"
              />
            </label>

            <label className="flex items-start justify-between gap-4 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 cursor-pointer">
              <div>
                <div className="text-sm font-bold text-[#252525]">Pickup Counter</div>
                <div className="mt-0.5 text-xs text-[#64625C]">
                  Customer mengambil pesanan sendiri di counter saat status Disajikan
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.enablePickupCounter}
                onChange={() => handleToggleFulfillment('enablePickupCounter')}
                className="mt-1 h-4 w-4 accent-[#1B4D3E]"
              />
            </label>
          </div>
        </section>

        {/* Cafe Profile & QR Base URL */}
        <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#252525]">Profil Cafe & QR Base URL</h2>
            <p className="mt-1 text-xs text-[#64625C]">
              Ditampilkan pada header customer web, halaman cetak QR, dan struk tracking pesanan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <BrandMark logoUrl={form.logoUrl} size="lg" />
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#252525] hover:bg-white cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Unggah Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileUpload}
                  className="hidden"
                />
              </label>
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, logoUrl: '' }))}
                  className="rounded-xl border border-[#E8E6DF] bg-white px-3 py-2 text-xs font-semibold text-[#64625C] hover:text-[#B91C1C]"
                >
                  Pakai Emblem Default
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#252525]">Nama Cafe</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252525]">
                Store Slug URL
              </label>
              <input
                type="text"
                required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 font-mono text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
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
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252525]">Alamat Cafe</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252525]">
                Nomor WhatsApp Cafe
              </label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 font-mono text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252525]">
                Jam Operasional
              </label>
              <input
                type="text"
                value={form.operatingHours}
                onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252525]">
                Status Operasional
              </label>
              <select
                value={form.isOpen ? 'OPEN' : 'CLOSED'}
                onChange={(e) => setForm({ ...form, isOpen: e.target.value === 'OPEN' })}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm font-medium focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              >
                <option value="OPEN">Buka — Menerima Pesanan</option>
                <option value="CLOSED">Tutup Sementara</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#252525]">
                Base URL QR Code
              </label>
              <input
                type="text"
                value={form.qrBaseUrl}
                onChange={(e) => setForm({ ...form, qrBaseUrl: e.target.value })}
                placeholder="https://domain-demo.com atau http://192.168.1.10:3000"
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 font-mono text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
              {qrWarning && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[#9A520A]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-semibold">{qrWarning.title}</strong> {qrWarning.detail}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-[#E8E6DF] pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </section>
      </form>

      {/* Reset Demo Data */}
      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#252525]">Reset Demo Data</h3>
          <p className="mt-1 text-xs text-[#64625C] max-w-xl">
            Kembalikan seluruh data cafe, 8 produk awal, 5 kategori, 6 meja QR, dan contoh pesanan ke kondisi awal demo LARIS Coffee.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setResetModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-2.5 text-xs font-bold text-[#A62626] hover:bg-[#FADADA] transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset Demo Data</span>
        </button>
      </section>

      <ConfirmModal
        open={resetModalOpen}
        title="Reset Seluruh Data Demo?"
        description="Semua pesanan baru, meja tambahan, dan perubahan menu pada browser ini akan dikembalikan ke data seed awal LARIS Coffee."
        confirmLabel="Ya, Reset Sekarang"
        destructive
        onCancel={() => setResetModalOpen(false)}
        onConfirm={() => {
          resetDemoData();
          setResetModalOpen(false);
          pushToast('Data demo dikembalikan ke kondisi awal', 'success');
        }}
      />
    </div>
  );
};
