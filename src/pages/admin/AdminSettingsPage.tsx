import React, { useEffect, useState } from 'react';
import { Save, Upload, AlertTriangle } from 'lucide-react';
import type { CafeSettings } from '../../types/pos';
import { getQrUrlWarning, normalizeBaseUrl } from '../../utils/format';
import { BrandMark } from '../../components/BrandMark';

export const AdminSettingsPage: React.FC = () => {
  const [form, setForm] = useState<CafeSettings | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; fetch('/api/v1/settings').then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || 'Pengaturan tidak dapat dimuat.'); if (active) setForm({ ...data, qrBaseUrl: data.qrBaseUrl ?? '' }); }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Pengaturan tidak dapat dimuat.')); return () => { active = false; }; }, []);
  if (!form) return <div className="grid min-h-56 place-items-center rounded-2xl border border-[#E8E6DF] bg-white text-sm text-[#64625C]">{error || 'Memuat pengaturan cafe…'}</div>;

  const handleToggleOrderType = (key: 'enableDineIn' | 'enableTakeaway') => {
    const nextVal = !form[key];
    const otherKey = key === 'enableDineIn' ? 'enableTakeaway' : 'enableDineIn';
    if (!nextVal && !form[otherKey]) {
      setError('Minimal satu jenis pesanan (Dine In atau Takeaway) harus aktif');
      return;
    }
    setForm({ ...form, [key]: nextVal });
  };

  const handleToggleFulfillment = (key: 'enableTableService' | 'enablePickupCounter') => {
    const nextVal = !form[key];
    const otherKey =
      key === 'enableTableService' ? 'enablePickupCounter' : 'enableTableService';
    if (!nextVal && !form[otherKey]) {
      setError('Minimal satu metode penyerahan harus aktif');
      return;
    }
    setForm({ ...form, [key]: nextVal });
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_200_000) {
      setError('Ukuran logo maksimal 1.2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm({ ...form, logoUrl: reader.result as string });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQrisFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_200_000) {
      setError('Ukuran gambar QRIS maksimal 1.2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm({ ...form, qrisImageUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug =
      form.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || 'laris-coffee';

    setSaving(true); setError(''); setNotice('');
    try { const response = await fetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ...form,
      name: form.name.trim() || 'LARIS Coffee',
      slug: cleanSlug,
      qrBaseUrl: form.qrBaseUrl?.trim() ? normalizeBaseUrl(form.qrBaseUrl) : '',
    }) }); const data = await response.json(); if (!response.ok) throw new Error(data?.error || 'Pengaturan tidak dapat disimpan.'); setForm((current) => current ? { ...current, ...data } : current); setNotice('Pengaturan cafe berhasil disimpan.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pengaturan tidak dapat disimpan.'); } finally { setSaving(false); }
  };

  const qrWarning = form.qrBaseUrl ? getQrUrlWarning(form.qrBaseUrl) : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {notice && <p role="status" className="rounded-xl border border-[#B8E1C8] bg-[#E9F5EE] px-4 py-3 text-sm font-semibold text-[#15623A]">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-[#FDECEC] px-4 py-3 text-sm font-semibold text-[#A62626]">{error}</p>}
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
                  onClick={() => setForm({ ...form, logoUrl: '' })}
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

            <div className="sm:col-span-2 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label htmlFor="qris-image-url" className="block text-xs font-semibold text-[#252525]">Gambar QRIS Statis Merchant</label>
                  <p className="mt-0.5 text-xs text-[#64625C]">Tampilkan hanya kode QRIS merchant yang benar-benar telah dikonfigurasi. Jika kosong, metode QRIS dinonaktifkan di Customer & POS.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-white px-3 py-1.5 text-xs font-semibold text-[#252525] hover:bg-[#FAF9F6] cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Unggah QRIS</span>
                    <input type="file" accept="image/*" onChange={handleQrisFileUpload} className="hidden" />
                  </label>
                  {form.qrisImageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, qrisImageUrl: '' })}
                      className="rounded-xl border border-[#E8E6DF] bg-white px-3 py-1.5 text-xs font-semibold text-[#64625C] hover:text-[#B91C1C]"
                    >
                      Hapus QRIS
                    </button>
                  )}
                </div>
              </div>
              <input id="qris-image-url" type="text" value={form.qrisImageUrl ?? ''} onChange={(e) => setForm({ ...form, qrisImageUrl: e.target.value })} placeholder="https://…/qris.png atau unggah gambar QRIS" className="w-full rounded-xl border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:outline-none" />
              {form.qrisImageUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-[#E8E6DF] bg-white p-3">
                  <img src={form.qrisImageUrl} alt="Pratinjau QRIS statis" className="h-20 w-20 rounded-lg border border-[#E8E6DF] object-contain bg-white" />
                  <div className="text-xs text-[#15623A] font-semibold">QRIS statis aktif — tersedia di Customer QR Ordering dan Manual POS.</div>
                </div>
              ) : (
                <div className="text-xs text-[#9A520A]">QRIS belum dikonfigurasi — opsi QRIS otomatis disembunyikan untuk mencegah pembayaran gagal.</div>
              )}
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
              disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        </section>
      </form>

    </div>
  );
};
