import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Copy,
  Check,
  QrCode,
  ShoppingBag,
  LayoutDashboard,
  AlertTriangle,
  Smartphone,
  UtensilsCrossed,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { BrandMark } from '../components/BrandMark';
import { QrCodeCanvas } from '../components/QrCodeCanvas';
import { buildTableQrUrl, getQrUrlWarning } from '../utils/format';

export const DemoPortalPage: React.FC = () => {
  const { state, pushToast } = usePos();
  const [copied, setCopied] = useState(false);

  const firstActiveTable =
    state.tables.find((t) => t.isActive) ?? state.tables[0];

  const qrUrl = firstActiveTable
    ? buildTableQrUrl(state.cafeSettings.qrBaseUrl, state.cafeSettings.slug, firstActiveTable)
    : `${state.cafeSettings.qrBaseUrl}/order/${state.cafeSettings.slug}`;

  const qrWarning = getQrUrlWarning(state.cafeSettings.qrBaseUrl);

  const sampleDineInPath = firstActiveTable
    ? `/order/${state.cafeSettings.slug}?table=${encodeURIComponent(firstActiveTable.name)}&token=${encodeURIComponent(firstActiveTable.token)}`
    : `/order/${state.cafeSettings.slug}`;

  const takeawayPath = `/order/${state.cafeSettings.slug}?mode=takeaway`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      pushToast('URL QR Meja disalin ke clipboard', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast('Gagal menyalin URL', 'warning');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525] flex flex-col">
      {/* Clean 3-zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-[#FAF9F6]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-[#1B4D3E] whitespace-nowrap shrink-0"
          >
            <BrandMark logoUrl={state.cafeSettings.logoUrl} size="sm" />
            <span>LARIS POS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#64625C]">
            <Link to="/admin" className="hover:text-[#1B4D3E] transition-colors whitespace-nowrap shrink-0">
              Dashboard
            </Link>
            <Link to="/admin/tables" className="hover:text-[#1B4D3E] transition-colors whitespace-nowrap shrink-0">
              Meja & QR
            </Link>
            <Link to="/admin/orders" className="hover:text-[#1B4D3E] transition-colors whitespace-nowrap shrink-0">
              Pesanan
            </Link>
            <Link to={sampleDineInPath} className="hover:text-[#1B4D3E] transition-colors whitespace-nowrap shrink-0">
              Menu Customer
            </Link>
          </nav>

          <div className="shrink-0">
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap shrink-0"
            >
              <span>Buka Admin</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
          {/* Left Hero Column */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-[#E8E6DF] bg-white p-7 lg:p-10">
            <div>
              <p className="text-sm font-semibold text-[#1B4D3E]">
                {state.cafeSettings.name} · Prototipe QR Self-Service Ordering
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#252525] sm:text-4xl lg:text-[42px] lg:leading-[1.15]">
                Pemesanan coffee shop dari scan QR meja hingga dapur dan kasir.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#64625C]">
                Uji seluruh alur operasional secara nyata: kelola meja dan cetak QR Code di Admin Dashboard, pindai QR lewat kamera HP, lakukan kustomisasi menu dan simulasi pembayaran, lalu pantau status pesanan secara langsung.
              </p>

              {/* Quick Demo Launchers */}
              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Link
                  to="/admin"
                  className="group flex items-center justify-between rounded-xl bg-[#1B4D3E] px-5 py-4 text-white hover:bg-[#143B2F] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <LayoutDashboard className="h-5 w-5 text-[#FCD804] shrink-0" />
                    <div>
                      <div className="text-sm font-bold">Admin Dashboard</div>
                      <div className="text-xs text-white/75">Kelola meja, menu & pesanan</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 shrink-0" />
                </Link>

                <Link
                  to="/admin/tables"
                  className="group flex items-center justify-between rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-5 py-4 text-[#252525] hover:border-[#1B4D3E]/40 hover:bg-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <QrCode className="h-5 w-5 text-[#1B4D3E] shrink-0" />
                    <div>
                      <div className="text-sm font-bold">Meja & QR Code</div>
                      <div className="text-xs text-[#64625C]">Generate, unduh PNG & cetak</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#64625C] transition-transform group-hover:translate-x-0.5 shrink-0" />
                </Link>

                <Link
                  to={sampleDineInPath}
                  className="group flex items-center justify-between rounded-xl border border-[#E8E6DF] bg-white px-5 py-4 text-[#252525] hover:border-[#1B4D3E]/40 hover:bg-[#FAF9F6] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <UtensilsCrossed className="h-5 w-5 text-[#1B4D3E] shrink-0" />
                    <div>
                      <div className="text-sm font-bold">
                        Customer Dine In ({firstActiveTable?.name ?? 'A01'})
                      </div>
                      <div className="text-xs text-[#64625C]">Simulasi masuk dari QR meja</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#64625C] transition-transform group-hover:translate-x-0.5 shrink-0" />
                </Link>

                <Link
                  to={takeawayPath}
                  className="group flex items-center justify-between rounded-xl border border-[#E8E6DF] bg-white px-5 py-4 text-[#252525] hover:border-[#1B4D3E]/40 hover:bg-[#FAF9F6] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="h-5 w-5 text-[#1B4D3E] shrink-0" />
                    <div>
                      <div className="text-sm font-bold">Customer Takeaway</div>
                      <div className="text-xs text-[#64625C]">Pesan tanpa nomor meja</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#64625C] transition-transform group-hover:translate-x-0.5 shrink-0" />
                </Link>
              </div>
            </div>

            <div className="mt-8 border-t border-[#E8E6DF] pt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64625C]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{state.tables.filter((t) => t.isActive).length} Meja Aktif</span>
                <span aria-hidden="true">·</span>
                <span>{state.products.filter((p) => p.isActive).length} Produk Tersedia</span>
                <span aria-hidden="true">·</span>
                <span>{state.orders.length} Pesanan Tercatat</span>
              </div>
              <span className="font-medium text-[#1B4D3E]">
                Sinkronisasi real-time HP ↔ Admin aktif
              </span>
            </div>
          </div>

          {/* Right Live Scannable QR Preview Column */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[#E8E6DF] bg-white p-6 sm:p-7 lg:p-8">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-[#252525]">
                    Uji Scan QR Langsung
                  </h2>
                  <p className="mt-0.5 text-xs text-[#64625C]">
                    Arahkan kamera HP Anda ke QR Code di bawah ini
                  </p>
                </div>
                <span className="rounded-lg bg-[#FCD804] px-3 py-1 font-mono text-sm font-bold text-[#252525] tabular-nums shrink-0">
                  Meja {firstActiveTable?.name ?? 'A01'}
                </span>
              </div>

              <div className="mt-5 flex flex-col items-center rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-5 sm:p-6">
                <div className="rounded-xl bg-white p-3.5 border border-[#E8E6DF]">
                  <QrCodeCanvas
                    value={qrUrl}
                    size={208}
                    darkColor="#1B4D3E"
                    alt={`QR Code Meja ${firstActiveTable?.name ?? 'A01'}`}
                  />
                </div>
                <p className="mt-4 text-sm font-bold text-[#1B4D3E]">
                  Scan untuk Memesan
                </p>
                <p className="mt-1 text-center font-mono text-[11px] text-[#64625C] break-all max-w-full">
                  {qrUrl}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2 text-xs font-semibold text-[#252525] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-[#1B4D3E]" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Tersalin' : 'Salin URL'}</span>
                  </button>
                  <Link
                    to={sampleDineInPath}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#143B2F] transition-colors whitespace-nowrap"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Buka di Tab Ini</span>
                  </Link>
                </div>
              </div>
            </div>

            {qrWarning ? (
              <div className="mt-5 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] p-3.5 text-xs leading-relaxed text-[#7C4106]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#9A520A]" />
                  <div>
                    <span className="font-semibold">{qrWarning.title}</span> {qrWarning.detail}{' '}
                    Atur Base URL di menu{' '}
                    <Link to="/admin/tables" className="font-bold underline">
                      Meja & QR Code
                    </Link>
                    .
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-3.5 text-xs leading-relaxed text-[#64625C]">
                <span className="font-semibold text-[#252525]">Live Cross-Device Sync:</span> Pesanan yang dibuat lewat scan QR dari HP langsung masuk ke Admin Dashboard laptop secara otomatis, dan perubahan status dari Admin langsung tampil di HP customer.
              </div>
            )}
          </div>
        </div>

        {/* 3-Step Flow Overview Strip */}
        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
            <div className="font-mono text-xs font-semibold text-[#1B4D3E]">01</div>
            <h3 className="mt-2 text-base font-bold text-[#252525]">Atur Meja & Cetak QR</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#64625C]">
              Buat meja dengan token unik, sesuaikan Base URL untuk akses HP, lalu unduh kartu PNG atau cetak langsung.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
            <div className="font-mono text-xs font-semibold text-[#1B4D3E]">02</div>
            <h3 className="mt-2 text-base font-bold text-[#252525]">Pesan & Simulasi Bayar</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#64625C]">
              Customer memilih menu, ukuran, gula/es, dan topping dengan harga nett, lalu menyelesaikan simulasi QRIS, E-Wallet, VA, atau Kasir.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
            <div className="font-mono text-xs font-semibold text-[#1B4D3E]">03</div>
            <h3 className="mt-2 text-base font-bold text-[#252525]">Proses Dapur & Tracking</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#64625C]">
              Admin mengubah status dari Order Baru → Memasak → Disajikan, kasir otomatis selesai, dan tracking customer terbarui seketika.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
