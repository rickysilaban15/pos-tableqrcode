import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { CafeSettings, CafeTable } from '../../types/pos';
import { BrandMark } from '../../components/BrandMark';
import { QrCodeCanvas } from '../../components/QrCodeCanvas';
import { buildTableQrUrl } from '../../utils/format';
import { downloadTableCardPng } from '../../utils/qrExport';

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
};

export const AdminTablePrintPage: React.FC = () => {
  const { tableId } = useParams<{ tableId?: string }>();
  const { pushToast } = useToast();
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(defaultSettings);
  const [tables, setTables] = useState<CafeTable[]>([]);
  const [loadError, setLoadError] = useState('');
  const state = { cafeSettings, tables };
  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/v1/tables'), fetch('/api/v1/settings')])
      .then(async ([tRes, sRes]) => {
        const [data, sData] = await Promise.all([tRes.json(), sRes.json()]);
        if (!tRes.ok) throw Error(data?.error || 'Meja tidak dapat dimuat.');
        if (active) {
          setTables(data.map((table: { id: string; name: string; area: string; isActive: boolean; qrToken?: string }) => ({ ...table, token: table.qrToken ?? '', createdAt: '', updatedAt: '' })));
          if (sRes.ok) setCafeSettings({ ...defaultSettings, ...sData, qrBaseUrl: sData.qrBaseUrl || window.location.origin });
        }
      })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'Meja tidak dapat dimuat.'); });
    return () => { active = false; };
  }, []);

  const tablesToPrint = (tableId
    ? state.tables.filter((t) => t.id === tableId)
    : state.tables.filter((t) => t.isActive)).filter((table) => Boolean(table.token));

  const singleTable = tableId ? tablesToPrint[0] : undefined;

  const handleDownloadSingle = async () => {
    if (!singleTable) return;
    await downloadTableCardPng(state.cafeSettings, singleTable);
    pushToast(`Kartu Meja ${singleTable.name} diunduh`, 'success');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525]">
      {/* Non-printable Toolbar */}
      <header className="no-print sticky top-0 z-30 border-b border-[#E8E6DF] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/tables"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#252525] hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali ke Meja & QR</span>
            </Link>
            <div className="text-sm font-bold text-[#252525]">
              {singleTable
                ? `Halaman Cetak QR — Meja ${singleTable.name}`
                : `Halaman Cetak Semua QR Aktif (${tablesToPrint.length} Meja)`}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {singleTable && (
              <button
                type="button"
                onClick={handleDownloadSingle}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E6DF] bg-white px-4 py-2.5 text-xs font-bold text-[#252525] hover:bg-[#FAF9F6]"
              >
                <Download className="h-4 w-4" />
                <span>Download PNG</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#143B2F]"
            >
              <Printer className="h-4 w-4" />
              <span>Cetak Sekarang (Print)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Printable Table Tent Grid */}
      <main className="mx-auto max-w-5xl p-6 sm:p-10">
        {loadError && <div role="alert" className="mb-6 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-4 py-3 text-sm text-[#A62626]">{loadError}</div>}
        {tableId && !singleTable && !loadError && <div className="mb-6 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-4 py-3 text-sm text-[#7C4106]">QR cetak lama tetap dapat dipindai bila belum dicabut, tetapi token mentahnya tidak tersedia untuk dicetak ulang. Generate ulang QR dari halaman Meja & QR Code untuk membuat kartu baru.</div>}
        {tablesToPrint.length === 0 ? (
          <div className="rounded-2xl border border-[#E8E6DF] bg-white p-12 text-center">
            <p className="text-base font-bold text-[#252525]">Tidak ada meja untuk dicetak</p>
            <p className="mt-1 text-sm text-[#64625C]">
              Aktifkan minimal satu meja atau buat meja baru di halaman Meja & QR Code.
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-8 ${
              tablesToPrint.length === 1
                ? 'grid-cols-1 max-w-md mx-auto'
                : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {tablesToPrint.map((table) => {
              const qrUrl = buildTableQrUrl(
                state.cafeSettings.qrBaseUrl,
                state.cafeSettings.slug,
                table,
              );

              return (
                <article
                  key={table.id}
                  className="print-break-inside-avoid overflow-hidden rounded-3xl border-2 border-[#E8E6DF] bg-white shadow-sm"
                >
                  {/* Header */}
                  <div className="bg-[#1B4D3E] px-6 py-6 text-center text-white">
                    <div className="flex justify-center">
                      <BrandMark
                        logoUrl={state.cafeSettings.logoUrl}
                        size="md"
                        inverted
                      />
                    </div>
                    <h2 className="mt-3 text-xl font-extrabold tracking-tight">
                      {state.cafeSettings.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-white/80">
                      QR Self-Service Ordering
                    </p>
                  </div>
                  <div className="h-2 bg-[#FCD804]" />

                  {/* Body */}
                  <div className="px-6 py-7 text-center">
                    <p className="text-xs font-bold tracking-[0.14em] text-[#64625C] uppercase">
                      Nomor Meja
                    </p>
                    <div className="mt-2 inline-flex min-w-[132px] items-center justify-center rounded-2xl bg-[#FCD804] px-6 py-2.5 font-mono text-3xl font-extrabold text-[#252525] tabular-nums">
                      {table.name}
                    </div>

                    <div className="mt-6 flex justify-center">
                      <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                        <QrCodeCanvas
                          value={qrUrl}
                          size={240}
                          darkColor="#252525"
                          alt={`QR Code Meja ${table.name}`}
                        />
                      </div>
                    </div>

                    <h3 className="mt-6 text-xl font-extrabold text-[#1B4D3E]">
                      Scan untuk Memesan
                    </h3>

                    <ol className="mt-3 space-y-1 text-xs leading-relaxed text-[#64625C]">
                      <li>1. Buka kamera HP dan arahkan ke QR Code di atas</li>
                      <li>2. Pilih menu, atur varian/topping, dan selesaikan pembayaran</li>
                      <li>3. Pesanan diproses langsung tanpa antre di kasir</li>
                    </ol>

                    <div className="mt-5 border-t border-[#E8E6DF] pt-3 font-mono text-[10px] text-[#8C8980]">
                      LARIS POS · {table.area} · {table.token}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
