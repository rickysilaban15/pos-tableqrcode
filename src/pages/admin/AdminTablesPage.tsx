import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Download,
  Printer,
  RefreshCw,
  Copy,
  Check,
  Pencil,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Eye,
  X,
  Globe,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { CafeSettings, CafeTable } from '../../types/pos';
import { buildTableQrUrl, getQrUrlWarning, normalizeBaseUrl } from '../../utils/format';
import { downloadCleanQrPng, downloadTableCardPng } from '../../utils/qrExport';
import { QrCodeCanvas } from '../../components/QrCodeCanvas';
import { ConfirmModal } from '../../components/ConfirmModal';

const defaultSettings: CafeSettings = {
  name: 'Outlet',
  slug: 'outlet',
  logoUrl: '',
  description: '',
  address: '',
  whatsapp: '',
  operatingHours: '',
  isOpen: true,
  qrBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  enableDineIn: true,
  enableTakeaway: true,
  enableTableService: true,
  enablePickupCounter: true,
  qrisImageUrl: '',
};

export const AdminTablesPage: React.FC = () => {
  const { pushToast } = useToast();
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(defaultSettings);
  const [tables, setTables] = useState<CafeTable[]>([]);
  const [tableError, setTableError] = useState('');
  const state = { cafeSettings, tables };
  const loadTables = async () => {
    const [tablesRes, settingsRes] = await Promise.all([fetch('/api/v1/tables'), fetch('/api/v1/settings')]);
    const [data, settingsData] = await Promise.all([tablesRes.json(), settingsRes.json()]);
    if (!tablesRes.ok) { setTableError(data?.error || 'Meja tidak dapat dimuat.'); return; }
    setTables(data.map((table: { id: string; name: string; area: string; isActive: boolean; qrToken?: string }) => ({ ...table, token: table.qrToken ?? '', createdAt: '', updatedAt: '' })));
    if (settingsRes.ok) {
      setCafeSettings({ ...defaultSettings, ...settingsData, qrBaseUrl: settingsData.qrBaseUrl || window.location.origin });
    }
    setTableError('');
  };
  useEffect(() => { void loadTables(); }, []);
  const updateCafeSettings = async (partial: Partial<CafeSettings>) => {
    const merged = { ...cafeSettings, ...partial };
    const response = await fetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    });
    const data = await response.json();
    if (!response.ok) {
      setTableError(data?.error || 'Base URL tidak dapat disimpan.');
      return;
    }
    setCafeSettings({ ...merged, ...data, qrBaseUrl: data.qrBaseUrl || window.location.origin });
  };
  const addTable = async (name: string, area: string) => { const response = await fetch('/api/v1/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, area }) }); const data = await response.json(); if (!response.ok) throw Error(data?.error || 'Meja tidak dapat dibuat.'); const table = { id: data.id, name: data.name, area: data.area, isActive: data.isActive, token: data.qrToken, createdAt: '', updatedAt: '' }; setTables((current) => [...current, table]); return table; };
  const updateTable = async (id: string, value: Partial<CafeTable>) => { const response = await fetch(`/api/v1/tables/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value.name, area: value.area, isActive: value.isActive }) }); const data = await response.json(); if (!response.ok) { setTableError(data?.error || 'Meja tidak dapat diperbarui.'); return; } setTables((current) => current.map((table) => table.id === id ? { ...table, ...data } : table)); };
  const deleteTable = async (id: string) => { const response = await fetch(`/api/v1/tables/${id}`, { method: 'DELETE' }); if (!response.ok) { const data = await response.json(); setTableError(data?.error || 'Meja tidak dapat diarsipkan.'); return; } await loadTables(); };
  const regenerateTableToken = async (id: string) => { const response = await fetch(`/api/v1/tables/${id}/regenerate-qr`, { method: 'POST' }); const data = await response.json(); if (!response.ok) { setTableError(data?.error || 'QR tidak dapat dibuat ulang.'); return; } setTables((current) => current.map((table) => table.id === id ? { ...table, token: data.qrToken } : table)); };

  const [baseUrlInput, setBaseUrlInput] = useState(state.cafeSettings.qrBaseUrl);
  const [newTableName, setNewTableName] = useState('');
  const [newTableArea, setNewTableArea] = useState('Indoor Main');
  const [previewTableId, setPreviewTableId] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<CafeTable | null>(null);
  const [editName, setEditName] = useState('');
  const [editArea, setEditArea] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const qrWarning = getQrUrlWarning(state.cafeSettings.qrBaseUrl);
  const previewTable = state.tables.find((t) => t.id === previewTableId);
  const deleteTarget = state.tables.find((t) => t.id === deleteTargetId);

  React.useEffect(() => {
    setBaseUrlInput(state.cafeSettings.qrBaseUrl);
  }, [state.cafeSettings.qrBaseUrl]);

  const handleSaveBaseUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeBaseUrl(baseUrlInput);
    setBaseUrlInput(clean);
    await updateCafeSettings({ qrBaseUrl: clean });
    pushToast('Base URL QR Code diperbarui untuk semua meja', 'success');
  };

  const handleUseCurrentOrigin = async () => {
    const current = window.location.origin;
    setBaseUrlInput(current);
    await updateCafeSettings({ qrBaseUrl: current });
    pushToast(`Base URL diatur ke ${current}`, 'success');
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTableName.trim().toUpperCase();
    if (!clean) {
      pushToast('Masukkan nomor atau nama meja terlebih dahulu', 'warning');
      return;
    }
    if (state.tables.some((t) => t.name.toUpperCase() === clean)) {
      pushToast(`Meja ${clean} sudah terdaftar`, 'warning');
      return;
    }
    try { const created = await addTable(clean, newTableArea); setNewTableName(''); setPreviewTableId(created.id); pushToast(`Meja ${created.name} berhasil dibuat dengan QR unik`, 'success'); } catch (error) { setTableError(error instanceof Error ? error.message : 'Meja tidak dapat dibuat.'); }
  };

  const handleSaveEditTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable) return;
    const clean = editName.trim().toUpperCase();
    if (!clean) return;
    if (
      state.tables.some(
        (t) => t.id !== editingTable.id && t.name.toUpperCase() === clean,
      )
    ) {
      pushToast(`Nama meja ${clean} sudah digunakan`, 'warning');
      return;
    }
    updateTable(editingTable.id, { name: clean, area: editArea.trim() || 'Indoor Main' });
    setEditingTable(null);
    pushToast(`Meja ${clean} diperbarui`, 'success');
  };

  const handleCopyUrl = async (table: CafeTable) => {
    const url = buildTableQrUrl(state.cafeSettings.qrBaseUrl, state.cafeSettings.slug, table);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(table.id);
      pushToast(`URL Meja ${table.name} disalin`, 'success');
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      pushToast('Gagal menyalin URL', 'warning');
    }
  };

  const handleDownloadCard = async (table: CafeTable) => {
    try {
      await downloadTableCardPng(state.cafeSettings, table);
      pushToast(`Kartu QR Meja ${table.name} (.png) diunduh`, 'success');
    } catch {
      pushToast('Gagal membuat file PNG', 'error');
    }
  };

  const handleDownloadCleanQr = async (table: CafeTable) => {
    try {
      await downloadCleanQrPng(state.cafeSettings, table);
      pushToast(`QR Polos Meja ${table.name} (.png) diunduh`, 'success');
    } catch {
      pushToast('Gagal mengunduh QR PNG', 'error');
    }
  };

  const handleRegenerate = (table: CafeTable) => {
    regenerateTableToken(table.id);
    pushToast(`Token & QR Code Meja ${table.name} di-generate ulang`, 'success');
  };

  return (
    <div className="space-y-6">
      {tableError && <div role="alert" className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">{tableError}</div>}
      {/* Base URL Configuration for Real Mobile Phone Testing */}
      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-[#252525]">
                Pengaturan Base URL QR Code (Pengujian HP)
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#64625C]">
              Seluruh QR Code meja otomatis menggunakan Base URL ini. Untuk memindai lewat kamera HP di jaringan Wi-Fi lokal, masukkan IP LAN komputer Anda (contoh:{' '}
              <span className="font-mono text-[#252525]">http://192.168.1.10:3000</span>) atau gunakan URL publik aplikasi ini.
            </p>
          </div>

          <Link
            to="/admin/tables/print"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1B4D3E] bg-white px-4 py-2.5 text-xs font-bold text-[#1B4D3E] hover:bg-[#EEF4F1] transition-colors whitespace-nowrap shrink-0 self-start"
          >
            <Printer className="h-4 w-4" />
            <span>Cetak Semua QR Aktif</span>
          </Link>
        </div>

        <form onSubmit={handleSaveBaseUrl} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={baseUrlInput}
            onChange={(e) => setBaseUrlInput(e.target.value)}
            placeholder="https://domain-demo.com atau http://192.168.1.10:3000"
            className="flex-1 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 font-mono text-sm text-[#252525] focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={handleUseCurrentOrigin}
            className="rounded-xl border border-[#E8E6DF] bg-white px-4 py-2.5 text-xs font-semibold text-[#252525] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap shrink-0"
          >
            Gunakan URL Saat Ini
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap shrink-0"
          >
            Simpan Base URL
          </button>
        </form>

        {qrWarning && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-4 py-3 text-xs leading-relaxed text-[#7C4106]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#9A520A]" />
            <div>
              <span className="font-bold">Peringatan: {qrWarning.title}</span>{' '}
              {qrWarning.detail}
            </div>
          </div>
        )}
      </section>

      {/* Add Table Form */}
      <form
        onSubmit={handleCreateTable}
        className="rounded-2xl border border-[#E8E6DF] bg-white p-5 flex flex-col gap-3 md:flex-row md:items-end"
      >
        <div className="flex-1">
          <label className="block text-xs font-semibold text-[#252525]">
            Nomor / Nama Meja
          </label>
          <input
            type="text"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            placeholder="Contoh: C01, VIP-1, BAR-02"
            className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm uppercase text-[#252525] focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-[#252525]">
            Area / Zona
          </label>
          <input
            type="text"
            value={newTableArea}
            onChange={(e) => setNewTableArea(e.target.value)}
            placeholder="Contoh: Indoor Window, Semi Outdoor"
            className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#252525] focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap shrink-0 h-[42px]"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Meja & Generate QR</span>
        </button>
      </form>

      {/* Tables QR Grid */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {state.tables.map((table) => {
          const qrUrl = buildTableQrUrl(
            state.cafeSettings.qrBaseUrl,
            state.cafeSettings.slug,
            table,
          );
          const hasPrintableToken = Boolean(table.token);
          const localOrderPath = `/q/${encodeURIComponent(table.token)}`;

          return (
            <article
              key={table.id}
              className={`rounded-2xl border bg-white p-5 flex flex-col justify-between transition-colors ${
                table.isActive ? 'border-[#E8E6DF]' : 'border-[#E8E6DF] opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-lg bg-[#FCD804] px-2.5 py-1 font-mono text-sm font-extrabold text-[#252525] tabular-nums">
                        {table.name}
                      </span>
                      <span className="text-xs font-medium text-[#64625C]">{table.area}</span>
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] text-[#64625C]">
                      Token: {table.token}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      updateTable(table.id, { isActive: !table.isActive });
                      pushToast(
                        `Meja ${table.name} ${!table.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
                        'default',
                      );
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                      table.isActive
                        ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A]'
                        : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#64625C]'
                    }`}
                  >
                    {table.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>

                {/* Real Scannable QR Preview */}
                <div className="mt-4 flex flex-col items-center rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4">
                  {!hasPrintableToken ? <div className="py-10 text-center text-xs leading-relaxed text-[#7C4106]">QR lama masih dapat digunakan jika telah dicetak, namun tidak dapat dipreview dari hash. Pilih “Ulang QR” untuk menerbitkan kartu baru.</div> : <>
                  <button
                    type="button"
                    onClick={() => setPreviewTableId(table.id)}
                    className="rounded-xl bg-white p-2.5 border border-[#E8E6DF] hover:border-[#1B4D3E]/40 transition-colors cursor-pointer"
                    title="Klik untuk memperbesar QR"
                  >
                    <QrCodeCanvas
                      value={qrUrl}
                      size={156}
                      darkColor="#1B4D3E"
                      alt={`QR Code Meja ${table.name}`}
                    />
                  </button>
                  <p className="mt-2.5 w-full truncate text-center font-mono text-[11px] text-[#64625C]">
                    {qrUrl}
                  </p>
                  </>}
                </div>
              </div>

              {/* Action Controls */}
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTableId(table.id)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-2 text-xs font-semibold text-[#252525] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5 text-[#1B4D3E]" />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadCard(table)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#1B4D3E] px-2.5 py-2 text-xs font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>PNG</span>
                  </button>
                  <Link
                    to={`/admin/tables/print/${table.id}`}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-2 text-xs font-semibold text-[#252525] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
                  >
                    <Printer className="h-3.5 w-3.5 text-[#1B4D3E]" />
                    <span>Print</span>
                  </Link>
                </div>

                <div className="flex items-center justify-between border-t border-[#E8E6DF] pt-2.5 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(table)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#64625C] hover:bg-[#FAF9F6] hover:text-[#252525]"
                      title="Salin URL"
                    >
                      {copiedId === table.id ? (
                        <Check className="h-3.5 w-3.5 text-[#1B4D3E]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>Salin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerate(table)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#64625C] hover:bg-[#FAF9F6] hover:text-[#252525]"
                      title="Generate Ulang Token QR"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Ulang QR</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Link
                      to={localOrderPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#1B4D3E] hover:bg-[#EEF4F1]"
                      title="Buka halaman pemesanan meja ini"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTable(table);
                        setEditName(table.name);
                        setEditArea(table.area);
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#64625C] hover:bg-[#FAF9F6] hover:text-[#252525]"
                      title="Edit meja"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(table.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#64625C] hover:bg-[#FDECEC] hover:text-[#B91C1C]"
                      title="Hapus meja"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* Large Scannable QR Preview Modal */}
      {previewTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden shadow-2xl">
            <div className="bg-[#1B4D3E] px-6 py-5 text-white flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white/75">{state.cafeSettings.name}</p>
                <h3 className="text-lg font-extrabold tracking-tight">
                  QR Code Meja {previewTable.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTableId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                aria-label="Tutup preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-1.5 bg-[#FCD804]" />

            <div className="p-6 flex flex-col items-center">
              <div className="rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-4">
                <QrCodeCanvas
                  value={buildTableQrUrl(
                    state.cafeSettings.qrBaseUrl,
                    state.cafeSettings.slug,
                    previewTable,
                  )}
                  size={240}
                  darkColor="#1B4D3E"
                  alt={`QR Code Besar Meja ${previewTable.name}`}
                />
              </div>

              <p className="mt-4 text-base font-extrabold text-[#1B4D3E]">
                Scan untuk Memesan
              </p>
              <p className="mt-1 text-center font-mono text-[11px] text-[#64625C] break-all">
                {buildTableQrUrl(
                  state.cafeSettings.qrBaseUrl,
                  state.cafeSettings.slug,
                  previewTable,
                )}
              </p>

              <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownloadCard(previewTable)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#143B2F]"
                >
                  <Download className="h-4 w-4" />
                  <span>Kartu Meja PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadCleanQr(previewTable)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-xs font-bold text-[#252525] hover:bg-[#FAF9F6]"
                >
                  <Download className="h-4 w-4" />
                  <span>QR Polos PNG</span>
                </button>
                <Link
                  to={`/admin/tables/print/${previewTable.id}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-xs font-bold text-[#252525] hover:bg-[#FAF9F6]"
                >
                  <Printer className="h-4 w-4" />
                  <span>Halaman Cetak</span>
                </Link>
                <Link
                  to={`/q/${encodeURIComponent(previewTable.token)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FCD804] px-3.5 py-2.5 text-xs font-bold text-[#252525] hover:bg-[#E5C400]"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Buka Menu Meja</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {editingTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEditTable}
            className="w-full max-w-md rounded-2xl border border-[#E8E6DF] bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#252525]">
                Edit Meja {editingTable.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTable(null)}
                className="p-1 text-[#64625C] hover:text-[#252525]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#252525]">
                Nama / Nomor Meja
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm uppercase focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#252525]">
                Area / Zona
              </label>
              <input
                type="text"
                value={editArea}
                onChange={(e) => setEditArea(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2.5 text-sm focus:border-[#1B4D3E] focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTable(null)}
                className="rounded-xl border border-[#E8E6DF] bg-white px-4 py-2 text-sm font-semibold text-[#252525]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#1B4D3E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#143B2F]"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTargetId)}
        title={`Hapus Meja ${deleteTarget?.name ?? ''}?`}
        description="QR Code yang sudah dicetak untuk meja ini tidak akan terdaftar lagi di sistem."
        confirmLabel="Hapus Meja"
        destructive
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            deleteTable(deleteTargetId);
            pushToast('Meja berhasil dihapus', 'default');
          }
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
};
