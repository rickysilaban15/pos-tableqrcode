import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  QrCode,
  Calculator,
  LayoutDashboard,
  CheckCircle2,
  ShieldCheck,
  ReceiptText,
  Coffee,
  ChevronDown,
  Menu as MenuIcon,
  X,
  Play,
  Sparkles,
  ChefHat,
  Banknote,
  Clock,
} from 'lucide-react';
import { PRODUCT_IMAGES } from '../data/seedData';
import { formatRupiah } from '../utils/format';

interface PublicPlan {
  id?: string;
  code: string;
  name: string;
  monthlyPrice: number;
  trialDays: number;
}

const DEFAULT_PLANS: PublicPlan[] = [
  { code: 'basic', name: 'Basic', monthlyPrice: 50000, trialDays: 14 },
  { code: 'pro', name: 'Pro', monthlyPrice: 120000, trialDays: 14 },
  { code: 'business', name: 'Business', monthlyPrice: 250000, trialDays: 14 },
];

const PLAN_DETAILS: Record<string, { summary: string; highlight?: boolean; features: string[] }> = {
  basic: {
    summary: 'Ideal untuk warkop, kedai kopi, & usaha F&B rintisan satu outlet.',
    features: [
      'QR Self-Service Ordering meja tanpa aplikasi',
      'Kasir POS berbasis web (desktop & tablet)',
      'Verifikasi pembayaran Tunai & QRIS Statis',
      'Pelacakan status pesanan real-time untuk pelanggan',
      'Struk digital & cetak thermal 58mm / 80mm',
      'Riwayat transaksi dasar & filter tanggal WIB',
    ],
  },
  pro: {
    summary: 'Untuk coffee shop & kafe berkembang dengan operasional padat.',
    highlight: true,
    features: [
      'Seluruh kapabilitas operasional paket Basic',
      'Kustomisasi grup varian wajib & topping tak terbatas',
      'Laporan kanal penjualan QR Meja vs Kasir POS',
      'Ekspor laporan CSV lengkap aman untuk akuntansi',
      'Layar antrean Kitchen Display real-time (opsional)',
      'Kustomisasi identitas brand, logo, & kartu QR cetak',
    ],
  },
  business: {
    summary: 'Kontrol penuh & pendampingan untuk jaringan F&B skala besar.',
    features: [
      'Seluruh kapabilitas lengkap paket Pro',
      'Kontrol akses peran Pemilik & Kasir terpisah',
      'Audit log aktivitas pembayaran, batal, & refund',
      'Pendampingan migrasi katalog & QR meja lama',
      'Prioritas dukungan teknis operasional',
      'Kesiapan ekspansi multi-cabang terisolasi',
    ],
  },
};

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  businessName: string;
  outletName: string;
  planCode: string;
}

function RegisterModal({
  plans,
  initialPlanCode,
  onClose,
}: {
  plans: PublicPlan[];
  initialPlanCode: string;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const [form, setForm] = useState<RegisterForm>({
    name: '',
    email: '',
    password: '',
    businessName: '',
    outletName: '',
    planCode: initialPlanCode || plans[0]?.code || 'basic',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  const activePlan = plans.find((p) => p.code === form.planCode) ?? plans[0] ?? DEFAULT_PLANS[0];
  const trialDays = activePlan?.trialDays ?? 14;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Registrasi gagal');
      nav('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrasi gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-modal-title"
      onClick={() => !loading && onClose()}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl border border-[#E8E6DF] shadow-[0_28px_64px_rgba(20,59,47,0.28)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-[#E8E6DF] bg-[#FAF9F6]">
          <div>
            <h2 id="register-modal-title" className="text-xl font-extrabold text-[#1B4D3E]">
              Daftar Gratis 14 Hari
            </h2>
            <p className="text-xs text-[#5C5952] mt-1">
              Langsung aktif tanpa kartu kredit · Termasuk QR Ordering & Kasir POS
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-[#5C5952] hover:text-[#252525] p-1.5 rounded-xl hover:bg-white transition-colors"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <fieldset>
            <legend className="text-xs font-semibold text-[#252525] mb-2">Pilih Paket Langganan</legend>
            <div className="grid grid-cols-3 gap-2.5">
              {plans.map((p) => {
                const selected = form.planCode === p.code;
                return (
                  <label
                    key={p.code}
                    className={`flex flex-col cursor-pointer rounded-xl border p-3 transition-colors ${
                      selected
                        ? 'border-[#1B4D3E] bg-[#EEF4F1]'
                        : 'border-[#E8E6DF] bg-white hover:border-[#1B4D3E]/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="planCode"
                      value={p.code}
                      checked={selected}
                      onChange={() => setForm((f) => ({ ...f, planCode: p.code }))}
                      className="sr-only"
                    />
                    <span className="text-sm font-bold text-[#1B4D3E]">{p.name}</span>
                    <span className="font-mono text-xs font-semibold text-[#252525] tabular-nums mt-0.5">
                      {formatRupiah(p.monthlyPrice)}/bln
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label htmlFor="reg-name" className="block text-xs font-semibold text-[#252525] mb-1.5">
                Nama Lengkap Pemilik
              </label>
              <input
                id="reg-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ahmad Bagas"
                className="w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/25 focus:border-[#1B4D3E]"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-[#252525] mb-1.5">
                Email Bisnis
              </label>
              <input
                id="reg-email"
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@bisnis.com"
                className="w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/25 focus:border-[#1B4D3E]"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-xs font-semibold text-[#252525] mb-1.5">
                Kata Sandi (min. 10 karakter)
              </label>
              <input
                id="reg-password"
                required
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••••"
                className="w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/25 focus:border-[#1B4D3E]"
              />
            </div>

            <div>
              <label htmlFor="reg-biz" className="block text-xs font-semibold text-[#252525] mb-1.5">
                Nama Brand / Bisnis
              </label>
              <input
                id="reg-biz"
                required
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="Kopi Nusantara"
                className="w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/25 focus:border-[#1B4D3E]"
              />
            </div>

            <div>
              <label htmlFor="reg-outlet" className="block text-xs font-semibold text-[#252525] mb-1.5">
                Nama Outlet Utama
              </label>
              <input
                id="reg-outlet"
                required
                value={form.outletName}
                onChange={(e) => setForm((f) => ({ ...f, outletName: e.target.value }))}
                placeholder="Cabang Utama"
                className="w-full rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/25 focus:border-[#1B4D3E]"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-[#FDECEC] border border-[#F6C5C5] px-3.5 py-3 text-xs font-semibold text-[#A62626]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1B4D3E] py-3.5 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              'Menyiapkan workspace Anda…'
            ) : (
              <>
                Mulai Trial {trialDays} Hari Gratis <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="text-center text-xs text-[#5C5952]">
            Sudah punya akun merchant?{' '}
            <Link to="/merchant/login" onClick={onClose} className="text-[#1B4D3E] font-bold hover:underline">
              Masuk di sini
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const FAQS = [
  {
    q: 'Apakah pelanggan harus mengunduh aplikasi untuk memesan lewat QR meja?',
    a: 'Tidak. Pelanggan cukup mengarahkan kamera ponsel ke kartu QR meja dan katalog menu outlet langsung terbuka di browser HP lengkap dengan pilihan varian, topping, dan catatan pesanan.',
  },
  {
    q: 'Bagaimana prinsip kerja pembayaran "Pay First, Order Later"?',
    a: 'Pesanan dari QR meja baru masuk ke antrean produksi barista/dapur (Pesanan Masuk → Sedang Diproses → Pesanan Siap) setelah pembayaran tunai atau QRIS statis diverifikasi oleh kasir/merchant. Tidak ada pesanan fiktif yang mengacaukan dapur.',
  },
  {
    q: 'Bagaimana cara menggunakan QRIS statis milik toko saya?',
    a: 'Unggah gambar kode QRIS resmi toko Anda di menu Pengaturan Cafe. Pelanggan akan memindai kode QRIS tersebut saat checkout, lalu kasir memverifikasi dana masuk sebelum pesanan diproses.',
  },
  {
    q: 'Apakah data menu dan transaksi outlet saya tercampur dengan merchant lain?',
    a: 'Tidak. Setiap merchant memiliki ruang data terisolasi penuh di PostgreSQL. Produk, meja, token QR, pengaturan, hingga laporan keuangan terkunci ketat berdasarkan otorisasi sesi outlet Anda.',
  },
  {
    q: 'Apa yang terjadi jika masa trial atau langganan berakhir?',
    a: 'Pembuatan pesanan baru (QR maupun POS) akan dinonaktifkan sementara hingga paket diperpanjang, namun seluruh pesanan yang sudah lunas tetap dapat diselesaikan dan riwayat transaksi maupun ekspor CSV tetap dapat diakses penuh.',
  },
  {
    q: 'Apakah WarkopOS mendukung cetak struk kasir thermal?',
    a: 'Ya. Setiap transaksi memiliki struk digital yang dapat dicetak langsung dari browser dalam mode Digital, Thermal 58mm, maupun Thermal 80mm.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E8E6DF] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4.5 text-left text-sm sm:text-base font-bold text-[#252525] hover:text-[#1B4D3E] transition-colors"
      >
        <span>{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#5C5952] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="pb-4.5 text-sm text-[#5C5952] leading-relaxed max-w-[68ch]">{a}</p>}
    </div>
  );
}

export const LandingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showRegister, setShowRegister] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState('pro');
  const [mobileNav, setMobileNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[]>(DEFAULT_PLANS);
  const [showcaseTab, setShowcaseTab] = useState<'qr' | 'pos' | 'queue'>('qr');

  useEffect(() => {
    if (searchParams.get('register') === '1') {
      setShowRegister(true);
      const next = new URLSearchParams(searchParams);
      next.delete('register');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    fetch('/api/public/plans')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PublicPlan[]) => {
        if (active && Array.isArray(rows) && rows.length > 0) {
          setPlans(rows);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openRegisterWithPlan = (code: string) => {
    setSelectedPlanCode(code);
    setShowRegister(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525]">
      {/* Navigation */}
      <header
        className={`sticky top-0 z-40 transition-colors duration-200 ${
          scrolled
            ? 'border-b border-[#E8E6DF] bg-[#FAF9F6]/95 backdrop-blur-md shadow-[0_4px_20px_rgba(37,37,37,0.05)]'
            : 'border-b border-white/10 bg-[#1B4D3E]'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          <Link
            to="/"
            className={`flex items-center gap-2.5 font-extrabold text-lg tracking-tight ${
              scrolled ? 'text-[#1B4D3E]' : 'text-white'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                scrolled ? 'bg-[#1B4D3E] text-[#FCD804]' : 'bg-[#FCD804] text-[#1B4D3E]'
              }`}
            >
              <Coffee className="h-5 w-5" />
            </div>
            <span>WarkopOS</span>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className={`hidden md:flex items-center gap-7 text-sm font-semibold ${
              scrolled ? 'text-[#5C5952]' : 'text-white/80'
            }`}
          >
            <a href="#showcase" className={scrolled ? 'hover:text-[#1B4D3E]' : 'hover:text-white'}>
              Pratinjau Produk
            </a>
            <a href="#features" className={scrolled ? 'hover:text-[#1B4D3E]' : 'hover:text-white'}>
              Fitur
            </a>
            <a href="#how-it-works" className={scrolled ? 'hover:text-[#1B4D3E]' : 'hover:text-white'}>
              Alur Operasional
            </a>
            <a href="#pricing" className={scrolled ? 'hover:text-[#1B4D3E]' : 'hover:text-white'}>
              Harga
            </a>
            <a href="#faq" className={scrolled ? 'hover:text-[#1B4D3E]' : 'hover:text-white'}>
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              to="/merchant/login"
              className={`hidden sm:inline-flex px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                scrolled
                  ? 'text-[#1B4D3E] hover:bg-[#EEF4F1]'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Masuk
            </Link>
            <button
              type="button"
              onClick={() => openRegisterWithPlan('basic')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                scrolled
                  ? 'bg-[#1B4D3E] text-white hover:bg-[#143B2F]'
                  : 'bg-[#FCD804] text-[#252525] hover:bg-[#E5C400]'
              }`}
            >
              <span>Coba Gratis</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileNav((v) => !v)}
              className={`md:hidden p-2 rounded-xl ${scrolled ? 'text-[#252525]' : 'text-white'}`}
              aria-label="Menu"
            >
              {mobileNav ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileNav && (
          <div className="md:hidden border-t border-[#E8E6DF] bg-white px-6 py-4 space-y-2.5 text-[#252525]">
            {[
              ['#showcase', 'Pratinjau Produk'],
              ['#features', 'Fitur'],
              ['#how-it-works', 'Alur Operasional'],
              ['#pricing', 'Harga'],
              ['#faq', 'FAQ'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileNav(false)}
                className="block text-sm font-semibold text-[#5C5952] hover:text-[#1B4D3E] py-1.5"
              >
                {label}
              </a>
            ))}
            <div className="pt-2 border-t border-[#E8E6DF] flex flex-col gap-2">
              <Link
                to="/demo"
                onClick={() => setMobileNav(false)}
                className="block text-sm font-bold text-[#1B4D3E] py-1.5"
              >
                Coba Sandbox Demo Interaktif
              </Link>
              <Link
                to="/merchant/login"
                onClick={() => setMobileNav(false)}
                className="block text-sm font-semibold text-[#252525] py-1.5"
              >
                Masuk ke Dashboard Merchant
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* Hero with Layered 3D Product Composition */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#1B4D3E] via-[#174336] to-[#113328] text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 right-0 h-[480px] w-[480px] rounded-full bg-[#FCD804]/12 blur-[130px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 -left-24 h-[360px] w-[360px] rounded-full bg-[#EEF4F1]/10 blur-[110px]"
          />

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
              {/* Left Copy */}
              <div className="lg:col-span-6 space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-[-0.025em] leading-[1.08]">
                  Sistem POS & QR Order{' '}
                  <span className="text-[#FCD804]">untuk F&B Indonesia</span>
                </h1>

                <p className="text-base sm:text-lg text-[#EEF4F1]/85 leading-relaxed max-w-xl">
                  Pelanggan pindai QR di meja, pilih kustomisasi kopi atau makanan, dan selesaikan pembayaran. Kasir memverifikasi dengan prinsip{' '}
                  <strong className="font-bold text-white">Pay First, Order Later</strong> sehingga antrean barista selalu akurat dan tercatat otomatis.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => openRegisterWithPlan('pro')}
                    className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#FCD804] px-6 py-4 text-sm sm:text-base font-extrabold text-[#252525] hover:bg-[#E5C400] transition-colors shadow-[0_12px_28px_rgba(252,216,4,0.24)]"
                  >
                    <span>Mulai Trial 14 Hari Gratis</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <Link
                    to="/demo"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-4 text-sm sm:text-base font-bold text-white hover:bg-white/18 transition-colors"
                  >
                    <Play className="h-4 w-4 text-[#FCD804] fill-[#FCD804]" />
                    <span>Lihat Demo Interaktif</span>
                  </Link>
                </div>

                <ul className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm text-[#EEF4F1]/85">
                  {[
                    'Tanpa unduh aplikasi untuk pelanggan',
                    'Mendukung Tunai & QRIS Statis toko Anda',
                    'Struk digital & cetak thermal 58/80mm',
                    'Isolasi data multi-tenant PostgreSQL',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#FCD804]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right 3D-Inspired Layered Workspace & Phone Composition */}
              <div className="lg:col-span-6 stage-perspective">
                <div className="relative mx-auto max-w-xl stage-tilt-left">
                  {/* Back Layer: Merchant Order Queue Window */}
                  <div className="rounded-2xl border border-white/15 bg-[#FAF9F6] text-[#252525] shadow-[0_28px_60px_rgba(0,0,0,0.38)] overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[#E8E6DF] bg-white px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#E8E6DF]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#E8E6DF]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#1B4D3E]" />
                        <span className="ml-2 text-xs font-extrabold text-[#1B4D3E]">
                          LARIS Coffee · Antrean Operasional
                        </span>
                      </div>
                      <span className="rounded-md bg-[#E9F5EE] border border-[#B8E1C8] px-2 py-0.5 text-[10px] font-bold text-[#15623A]">
                        Live SSE Aktif
                      </span>
                    </div>

                    <div className="p-4 sm:p-5 space-y-3.5">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-xl border border-[#E8E6DF] bg-white p-3">
                          <div className="text-[10px] font-semibold text-[#5C5952]">Verifikasi Bayar</div>
                          <div className="mt-1 font-mono text-lg font-extrabold text-[#9A520A] tabular-nums">1</div>
                        </div>
                        <div className="rounded-xl border border-[#E8E6DF] bg-white p-3">
                          <div className="text-[10px] font-semibold text-[#5C5952]">Sedang Diproses</div>
                          <div className="mt-1 font-mono text-lg font-extrabold text-[#1B4D3E] tabular-nums">3</div>
                        </div>
                        <div className="rounded-xl bg-[#1B4D3E] p-3 text-white">
                          <div className="text-[10px] font-medium text-white/75">Status Toko</div>
                          <div className="mt-1 text-xs font-extrabold text-[#FCD804]">Buka · WIB</div>
                        </div>
                      </div>

                      {/* Faithful Order Card Preview */}
                      <div className="rounded-xl border border-[#E8E6DF] bg-white p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="rounded-md bg-[#FCD804] px-2 py-0.5 font-mono text-[11px] font-extrabold text-[#252525]">
                              Meja A01
                            </span>
                            <span className="text-xs font-bold truncate">Nadia Kusuma</span>
                          </div>
                          <span className="rounded-md bg-[#E9F5EE] border border-[#B8E1C8] px-2 py-0.5 text-[10px] font-bold text-[#15623A]">
                            Lunas · QRIS
                          </span>
                        </div>
                        <div className="text-xs text-[#5C5952] bg-[#FAF9F6] rounded-lg px-3 py-2 border border-[#E8E6DF]">
                          <div className="flex justify-between font-semibold text-[#252525]">
                            <span>1x Es Kopi Susu · Large · Oat Milk</span>
                            <span className="font-mono tabular-nums">Rp34.000</span>
                          </div>
                          <div className="flex justify-between font-semibold text-[#252525] mt-1">
                            <span>1x Butter Croissant · Reheat</span>
                            <span className="font-mono tabular-nums">Rp20.000</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-mono text-sm font-extrabold text-[#1B4D3E] tabular-nums">
                            Total Rp54.000
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3 py-1.5 text-[11px] font-bold text-white">
                            <ChefHat className="h-3.5 w-3.5 text-[#FCD804]" />
                            Sedang Diproses
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Front Floating Layer: Mobile Customer QR Card */}
                  <div className="mt-4 sm:mt-0 sm:absolute sm:-bottom-8 sm:-right-4 sm:w-64 rounded-2xl border border-[#E8E6DF] bg-white p-3.5 text-[#252525] shadow-[0_20px_44px_rgba(0,0,0,0.28)] animate-float-slow">
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="text-[11px] font-extrabold text-[#1B4D3E]">Menu QR · Meja A01</span>
                      <span className="rounded-md bg-[#EEF4F1] px-2 py-0.5 text-[10px] font-bold text-[#1B4D3E]">
                        Tanpa App
                      </span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <img
                        src={PRODUCT_IMAGES.esKopiSusu}
                        alt="Es Kopi Susu LARIS Coffee"
                        className="h-14 w-14 rounded-xl object-cover border border-[#E8E6DF] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold truncate">Es Kopi Susu Aren</div>
                        <div className="text-[11px] text-[#5C5952]">Large · Less Sugar</div>
                        <div className="mt-1 font-mono text-xs font-extrabold text-[#1B4D3E] tabular-nums">
                          Rp27.000
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive 3-Surface Product Showcase */}
        <section id="showcase" className="py-16 sm:py-24 border-b border-[#E8E6DF]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
              <div className="max-w-2xl">
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#252525]">
                  Satu fondasi transaksi untuk meja pelanggan, kasir, dan dapur
                </h2>
                <p className="mt-3 text-sm sm:text-base text-[#5C5952] leading-relaxed">
                  Seluruh pesanan dari QR meja maupun Kasir POS menggunakan mesin kalkulasi harga server, validasi varian wajib, dan struk yang seragam.
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Pilih pratinjau layar produk"
                className="inline-flex rounded-xl border border-[#E8E6DF] bg-white p-1 self-start"
              >
                {(
                  [
                    ['qr', 'QR Ordering HP', QrCode],
                    ['pos', 'Kasir POS', Calculator],
                    ['queue', 'Verifikasi & Dapur', LayoutDashboard],
                  ] as const
                ).map(([key, label, Icon]) => {
                  const active = showcaseTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setShowcaseTab(key)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-bold transition-colors ${
                        active ? 'bg-[#1B4D3E] text-white' : 'text-[#5C5952] hover:text-[#252525]'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-[#FCD804]' : 'text-[#1B4D3E]'}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Showcase Panel */}
            <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 sm:p-8 shadow-[0_16px_40px_rgba(37,37,37,0.06)]">
              {showcaseTab === 'qr' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-[#1B4D3E]">
                      Pengalaman memesan cepat dari kursi pelanggan
                    </h3>
                    <p className="text-sm text-[#5C5952] leading-relaxed">
                      Setiap meja memiliki QR unik yang dapat diputar ulang kapan saja jika bocor. Pelanggan melihat foto menu asli, memilih takaran gula/es, lalu memantau progres barista secara langsung.
                    </p>
                    <ul className="space-y-2.5 text-sm text-[#252525]">
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Deteksi nomor meja otomatis dari token QR kriptografis</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Mendukung Dine In (Antar ke Meja / Pickup) & Takeaway</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Halaman pelacakan pesanan privat dengan update SSE otomatis</span>
                      </li>
                    </ul>
                    <div className="pt-2">
                      <Link
                        to="/demo"
                        className="inline-flex items-center gap-2 text-sm font-extrabold text-[#1B4D3E] hover:underline"
                      >
                        <span>Uji langsung menu QR LARIS Coffee di Sandbox Demo</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      {
                        name: 'Es Kopi Susu',
                        cat: 'Signature',
                        price: 22000,
                        img: PRODUCT_IMAGES.esKopiSusu,
                        custom: 'Regular / Large · Gula Aren',
                      },
                      {
                        name: 'Cafe Latte',
                        cat: 'Coffee',
                        price: 25000,
                        img: PRODUCT_IMAGES.cafeLatte,
                        custom: 'Hot / Iced · Oat Milk',
                      },
                      {
                        name: 'Croissant',
                        cat: 'Artisan Pastry',
                        price: 20000,
                        img: PRODUCT_IMAGES.croissant,
                        custom: 'Reheat · French Butter',
                      },
                    ].map((item) => (
                      <div
                        key={item.name}
                        className="rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[4/3] bg-[#F2EFE9] overflow-hidden">
                          <img src={item.img} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-[11px] font-semibold text-[#5C5952]">{item.cat}</div>
                            <div className="text-sm font-extrabold text-[#252525] mt-0.5">{item.name}</div>
                            <div className="text-[11px] text-[#5C5952] mt-1">{item.custom}</div>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="font-mono text-sm font-extrabold text-[#1B4D3E] tabular-nums">
                              {formatRupiah(item.price)}
                            </span>
                            <span className="rounded-lg bg-[#1B4D3E] px-2.5 py-1 text-[11px] font-bold text-white">
                              + Tambah
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showcaseTab === 'pos' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-[#1B4D3E]">
                      Kasir POS responsif untuk antrean walk-in yang sibuk
                    </h3>
                    <p className="text-sm text-[#5C5952] leading-relaxed">
                      Dirancang untuk layar sentuh tablet maupun laptop kasir: pilih produk, lengkapi varian wajib, gunakan tombol pecahan uang pas/cepat, lihat kembalian otomatis, dan cetak struk seketika.
                    </p>
                    <ul className="space-y-2.5 text-sm text-[#252525]">
                      <li className="flex items-start gap-2.5">
                        <Banknote className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Kalkulasi uang diterima & kembalian akurat di sisi server</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <ShieldCheck className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Proteksi idempotency key mencegah transaksi ganda saat koneksi lambat</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <ReceiptText className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Cetak struk Thermal 58mm, 80mm, atau tampilan struk digital</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7 rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 sm:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2.5">
                        <div className="text-xs font-bold text-[#5C5952]">Ringkasan Keranjang Kasir</div>
                        <div className="rounded-xl bg-white border border-[#E8E6DF] p-3.5 space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <div>
                              <div className="font-bold text-[#252525]">2x Cafe Latte</div>
                              <div className="text-[#5C5952]">Hot · Regular · No Sugar</div>
                            </div>
                            <span className="font-mono font-bold tabular-nums">Rp50.000</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-[#E8E6DF]">
                            <div>
                              <div className="font-bold text-[#252525]">1x Matcha Latte</div>
                              <div className="text-[#5C5952]">Iced · + Cheese Foam</div>
                            </div>
                            <span className="font-mono font-bold tabular-nums">Rp34.000</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white border border-[#E8E6DF] p-4 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex justify-between text-xs text-[#5C5952]">
                            <span>Metode Bayar</span>
                            <span className="font-bold text-[#252525]">Tunai Kasir</span>
                          </div>
                          <div className="mt-2 flex justify-between text-sm font-extrabold text-[#252525]">
                            <span>Total Tagihan</span>
                            <span className="font-mono text-[#1B4D3E] tabular-nums">Rp84.000</span>
                          </div>
                          <div className="mt-2 rounded-lg bg-[#FAF9F6] border border-[#E8E6DF] px-3 py-2 flex justify-between text-xs">
                            <span className="text-[#5C5952]">Tunai Diterima</span>
                            <span className="font-mono font-bold tabular-nums">Rp100.000</span>
                          </div>
                          <div className="mt-2 flex justify-between text-xs font-bold text-[#15623A]">
                            <span>Kembalian</span>
                            <span className="font-mono tabular-nums">Rp16.000</span>
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#1B4D3E] py-2.5 text-center text-xs font-bold text-white">
                          Transaksi Lunas · Masuk Antrean Barista
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showcaseTab === 'queue' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-[#1B4D3E]">
                      Antrean bersih dengan pemisahan pesanan belum bayar & lunas
                    </h3>
                    <p className="text-sm text-[#5C5952] leading-relaxed">
                      Pesanan QR yang belum dibayar tertahan rapi di kolom Verifikasi Bayar. Begitu kasir memverifikasi tunai atau QRIS statis, pesanan otomatis berpindah ke antrean aktif barista dan layar dapur.
                    </p>
                    <ul className="space-y-2.5 text-sm text-[#252525]">
                      <li className="flex items-start gap-2.5">
                        <Clock className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Pesanan belum dibayar kedaluwarsa otomatis setelah 30 menit</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <ChefHat className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Alur jelas: Menunggu Pembayaran → Pesanan Masuk → Diproses → Siap</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-[#1B4D3E] shrink-0 mt-0.5" />
                        <span>Laporan riwayat harian akurat mengikuti zona waktu WIB (Asia/Jakarta)</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        stage: '1. Verifikasi Bayar',
                        badge: 'bg-[#FEF3E6] text-[#9A520A] border-[#F6D3AE]',
                        desc: 'Kasir memeriksa uang tunai diterima atau mutasi QRIS statis sebelum diteruskan.',
                      },
                      {
                        stage: '2. Sedang Diproses',
                        badge: 'bg-[#FCD804]/35 text-[#252525] border-[#D9B800]/40',
                        desc: 'Barista melihat takaran gula, es, topping, dan catatan khusus per gelas/porsi.',
                      },
                      {
                        stage: '3. Pesanan Siap',
                        badge: 'bg-[#E9F5EE] text-[#15623A] border-[#B8E1C8]',
                        desc: 'Layar HP pelanggan otomatis berubah menjadi Pesanan Siap untuk diantar atau diambil.',
                      },
                    ].map((s) => (
                      <div key={s.stage} className="rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-4 space-y-2.5">
                        <span className={`inline-block rounded-md border px-2.5 py-1 text-xs font-bold ${s.badge}`}>
                          {s.stage}
                        </span>
                        <p className="text-xs text-[#5C5952] leading-relaxed">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section id="features" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#252525]">
                Dirancang khusus untuk ritme kerja kedai kopi, kafe, dan warung modern
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#5C5952] leading-relaxed">
                Tanpa perangkat keras khusus yang mahal. Cukup jalankan dari laptop, tablet, atau ponsel yang sudah Anda miliki.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: QrCode,
                  title: 'Kartu QR Meja Siap Cetak',
                  desc: 'Generate token QR unik per meja, unduh kartu meja beridentitas brand Anda dalam format PNG resolusi tinggi, atau cetak langsung.',
                },
                {
                  icon: Calculator,
                  title: 'Kasir POS & QR Satu Katalog',
                  desc: 'Ubah harga, matikan produk habis, atau tambah grup varian satu kali — langsung berlaku serentak di QR meja dan Kasir POS.',
                },
                {
                  icon: Banknote,
                  title: 'Integritas Pembayaran Ketat',
                  desc: 'Harga dihitung 100% oleh server dari katalog resmi. Pesanan hanya diproses setelah pembayaran tunai atau QRIS statis terverifikasi.',
                },
                {
                  icon: LayoutDashboard,
                  title: 'Pemantauan Real-Time SSE',
                  desc: 'Pesanan masuk, konfirmasi bayar, hingga status siap tersinkronisasi seketika antara HP pelanggan, kasir, dan layar dapur.',
                },
                {
                  icon: ReceiptText,
                  title: 'Laporan & Ekspor CSV Akurat',
                  desc: 'Pantau omzet QR vs POS, rincian pembayaran tunai & QRIS, paginasi ribuan transaksi, serta ekspor CSV lengkap sesuai zona waktu WIB.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Keamanan Multi-Tenant & Peran',
                  desc: 'Isolasi data antar merchant di tingkat database, sesi cookie httpOnly aman, serta pemisahan hak akses Pemilik dan Kasir.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-[#E8E6DF] bg-white p-6 transition-colors hover:border-[#1B4D3E]/40"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EEF4F1] flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-[#1B4D3E]" />
                  </div>
                  <h3 className="text-base font-extrabold text-[#252525]">{title}</h3>
                  <p className="mt-2 text-sm text-[#5C5952] leading-relaxed">{desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works — Sequential Operational Flow */}
        <section id="how-it-works" className="py-16 sm:py-24 bg-[#F3F1EC] border-y border-[#E8E6DF]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#252525]">
                Siap menerima pesanan pertama dalam empat langkah terarah
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#5C5952]">
                Daftar panduan onboarding di dalam dashboard akan menuntun Anda dari pengaturan toko hingga transaksi pertama selesai.
              </p>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  step: 'Langkah 1',
                  title: 'Daftar & Profil Outlet',
                  desc: 'Buat akun trial 14 hari, atur nama brand, alamat, jam operasional, dan unggah logo serta gambar QRIS statis.',
                },
                {
                  step: 'Langkah 2',
                  title: 'Susun Menu & Varian',
                  desc: 'Buat kategori menu, tambahkan produk beserta foto, grup varian wajib (ukuran/gula/es), dan pilihan topping.',
                },
                {
                  step: 'Langkah 3',
                  title: 'Cetak Kartu QR Meja',
                  desc: 'Tambahkan daftar nomor meja, unduh kartu QR PNG berdesain rapi, lalu pasang di masing-masing meja.',
                },
                {
                  step: 'Langkah 4',
                  title: 'Verifikasi & Sajikan',
                  desc: 'Terima pesanan dari HP pelanggan atau Kasir POS, verifikasi pembayaran, proses di dapur, dan cetak struk.',
                },
              ].map((item) => (
                <li key={item.step} className="rounded-2xl bg-white border border-[#E8E6DF] p-6 flex flex-col justify-between">
                  <div>
                    <span className="inline-block rounded-lg bg-[#EEF4F1] px-2.5 py-1 font-mono text-xs font-bold text-[#1B4D3E]">
                      {item.step}
                    </span>
                    <h3 className="mt-3.5 text-base font-extrabold text-[#252525]">{item.title}</h3>
                    <p className="mt-2 text-sm text-[#5C5952] leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#252525]">
                Biaya langganan terjangkau dan transparan
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#5C5952]">
                Mulai dengan uji coba penuh selama 14 hari tanpa kartu kredit. Tidak ada potongan komisi per transaksi.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
              {plans.map((plan) => {
                const detail = PLAN_DETAILS[plan.code] ?? PLAN_DETAILS.basic;
                const highlight = Boolean(detail.highlight);
                return (
                  <article
                    key={plan.code}
                    className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between ${
                      highlight
                        ? 'bg-[#1B4D3E] text-white shadow-[0_24px_48px_rgba(27,77,62,0.22)] ring-2 ring-[#FCD804]'
                        : 'bg-white border border-[#E8E6DF]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`text-xl font-extrabold ${highlight ? 'text-white' : 'text-[#252525]'}`}>
                          {plan.name}
                        </h3>
                        {highlight && (
                          <span className="rounded-full bg-[#FCD804] px-3 py-1 text-xs font-extrabold text-[#252525]">
                            Direkomendasikan
                          </span>
                        )}
                      </div>

                      <p className={`mt-2 text-xs leading-relaxed ${highlight ? 'text-[#EEF4F1]/80' : 'text-[#5C5952]'}`}>
                        {detail.summary}
                      </p>

                      <div className="mt-5 flex items-baseline gap-1.5">
                        <span
                          className={`font-mono text-3xl sm:text-4xl font-extrabold tabular-nums ${
                            highlight ? 'text-[#FCD804]' : 'text-[#1B4D3E]'
                          }`}
                        >
                          {formatRupiah(plan.monthlyPrice)}
                        </span>
                        <span className={`text-xs font-semibold ${highlight ? 'text-white/70' : 'text-[#5C5952]'}`}>
                          / bulan
                        </span>
                      </div>
                      <p className={`mt-1 text-xs font-medium ${highlight ? 'text-[#FCD804]/90' : 'text-[#1B4D3E]'}`}>
                        Termasuk trial gratis {plan.trialDays} hari
                      </p>

                      <ul className="mt-6 space-y-2.5 border-t border-current/10 pt-5">
                        {detail.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-sm">
                            <CheckCircle2
                              className={`h-4 w-4 shrink-0 mt-0.5 ${highlight ? 'text-[#FCD804]' : 'text-[#1B4D3E]'}`}
                            />
                            <span className={highlight ? 'text-white/90' : 'text-[#252525]'}>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRegisterWithPlan(plan.code)}
                      className={`mt-7 w-full rounded-xl py-3.5 text-sm font-extrabold transition-colors ${
                        highlight
                          ? 'bg-[#FCD804] text-[#252525] hover:bg-[#E5C400]'
                          : 'bg-[#1B4D3E] text-white hover:bg-[#143B2F]'
                      }`}
                    >
                      Coba Gratis {plan.trialDays} Hari
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16 sm:py-24 bg-[#F3F1EC] border-t border-[#E8E6DF]">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-[#252525] mb-8">
              Pertanyaan yang Sering Diajukan
            </h2>
            <div className="rounded-2xl bg-white border border-[#E8E6DF] px-5 sm:px-7 py-2">
              {FAQS.map((faq) => (
                <FAQItem key={faq.q} {...faq} />
              ))}
            </div>
          </div>
        </section>

        {/* Honest Closing CTA */}
        <section className="py-16 sm:py-20 bg-[#1B4D3E] text-white">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center space-y-5">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Mulai kelola pesanan meja dan kasir dengan lebih rapi hari ini
            </h2>
            <p className="text-[#EEF4F1]/80 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Buat akun outlet Anda dalam satu menit, atau jelajahi alur pemesanan LARIS Coffee terlebih dahulu melalui sandbox demo interaktif kami.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => openRegisterWithPlan('pro')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#FCD804] px-7 py-4 text-sm sm:text-base font-extrabold text-[#252525] hover:bg-[#E5C400] transition-colors"
              >
                <span>Daftar Sekarang — Gratis</span>
                <ArrowRight className="h-5 w-5" />
              </button>
              <Link
                to="/merchant/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-7 py-4 text-sm sm:text-base font-bold text-white hover:bg-white/10 transition-colors"
              >
                <span>Sudah punya akun? Masuk</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#252525] text-white/70 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1B4D3E] flex items-center justify-center">
              <Coffee className="h-4 w-4 text-[#FCD804]" />
            </div>
            <span className="font-bold text-white">WarkopOS</span>
            <span className="text-white/50">· Platform POS & QR Ordering F&B Indonesia</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link to="/demo" className="hover:text-white transition-colors">
              Demo Interaktif
            </Link>
            <Link to="/merchant/login" className="hover:text-white transition-colors">
              Merchant Login
            </Link>
            <span className="text-white/45">© 2026 WarkopOS</span>
          </div>
        </div>
      </footer>

      {showRegister && (
        <RegisterModal
          plans={plans}
          initialPlanCode={selectedPlanCode}
          onClose={() => setShowRegister(false)}
        />
      )}
    </div>
  );
};
