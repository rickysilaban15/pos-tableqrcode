import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  QrCode,
  Calculator,
  LayoutDashboard,
  CheckCircle2,
  Smartphone,
  Star,
  Zap,
  ShieldCheck,
  TrendingUp,
  Store,
  Users,
  Coffee,
  ChevronDown,
  Menu as MenuIcon,
  X,
  ExternalLink,
} from 'lucide-react';
import { BrandMark } from '../components/BrandMark';

// Registration form state
interface RegisterForm {
  name: string;
  email: string;
  password: string;
  businessName: string;
  outletName: string;
  planCode: 'basic' | 'pro' | 'business';
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [form, setForm] = useState<RegisterForm>({
    name: '',
    email: '',
    password: '',
    businessName: '',
    outletName: '',
    planCode: 'basic',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registrasi gagal');
    } finally {
      setLoading(false);
    }
  };

  const plans = [
    { code: 'basic' as const, label: 'Basic', price: 'Rp50.000/bln', desc: 'Untuk 1 outlet kecil' },
    { code: 'pro' as const, label: 'Pro', price: 'Rp120.000/bln', desc: 'Multi-outlet + laporan' },
    { code: 'business' as const, label: 'Business', price: 'Rp250.000/bln', desc: 'Enterprise & customisasi' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#E8E6DF]">
          <div>
            <h2 className="text-xl font-extrabold text-[#1B4D3E]">Daftar Gratis 14 Hari</h2>
            <p className="text-xs text-[#64625C] mt-0.5">Tidak perlu kartu kredit</p>
          </div>
          <button onClick={onClose} className="text-[#64625C] hover:text-[#252525] p-1 rounded-lg" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Plan selector */}
          <div className="grid grid-cols-3 gap-2">
            {plans.map((p) => (
              <label
                key={p.code}
                className={`flex flex-col cursor-pointer rounded-xl border p-3 transition-colors ${
                  form.planCode === p.code
                    ? 'border-[#1B4D3E] bg-[#1B4D3E]/5'
                    : 'border-[#E8E6DF] hover:border-[#1B4D3E]/40'
                }`}
              >
                <input
                  type="radio"
                  name="planCode"
                  value={p.code}
                  checked={form.planCode === p.code}
                  onChange={() => setForm((f) => ({ ...f, planCode: p.code }))}
                  className="sr-only"
                />
                <span className="text-sm font-bold text-[#1B4D3E]">{p.label}</span>
                <span className="text-xs text-[#64625C] mt-0.5">{p.price}</span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Nama Lengkap</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ahmad Bagas"
                className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@bisnis.com"
                className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Kata Sandi (min. 10 karakter)</label>
              <input
                required
                type="password"
                minLength={10}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••••"
                className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Nama Bisnis</label>
              <input
                required
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="Kopi Nusantara"
                className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Nama Outlet Utama</label>
              <input
                required
                value={form.outletName}
                onChange={(e) => setForm((f) => ({ ...f, outletName: e.target.value }))}
                placeholder="Cabang Utama"
                className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1B4D3E] py-3.5 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? 'Mendaftar…' : (
              <>Mulai Trial 14 Hari Gratis <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
          <p className="text-center text-xs text-[#64625C]">
            Sudah punya akun?{' '}
            <Link to="/merchant/login" onClick={onClose} className="text-[#1B4D3E] font-semibold hover:underline">
              Masuk
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: QrCode,
    title: 'QR Ordering Tanpa Aplikasi',
    desc: 'Customer scan QR di meja, langsung pesan dari HP. Tanpa download, tanpa daftar.',
  },
  {
    icon: Calculator,
    title: 'Manual POS Kasir',
    desc: 'Layar kasir touchscreen-friendly. Input pesanan cepat, cetak struk, hitung kembalian.',
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard Merchant Real-Time',
    desc: 'Monitor pesanan masuk, verifikasi pembayaran, dan kelola antrian langsung di browser.',
  },
  {
    icon: Smartphone,
    title: 'Pembayaran Fleksibel',
    desc: 'Dukung tunai dan QRIS statis. Tanpa integrasi gateway berbayar untuk mulai.',
  },
  {
    icon: TrendingUp,
    title: 'Riwayat & Laporan',
    desc: 'Laporan transaksi, snapshot historis, dan struk digital untuk pelanggan.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-Tenant Aman',
    desc: 'Data setiap merchant terisolasi penuh. Tidak ada akses lintas tenant.',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Daftar & Setup', desc: 'Buat akun, isi nama bisnis, outlet, dan upload logo.' },
  { step: '02', title: 'Tambah Menu', desc: 'Input produk, kategori, varian, dan topping. Upload foto produk.' },
  { step: '03', title: 'Setup Meja & QR', desc: 'Buat meja, generate QR Code, cetak dan pasang di meja.' },
  { step: '04', title: 'Konfigurasi Pembayaran', desc: 'Upload QR QRIS statis atau aktifkan pembayaran tunai.' },
  { step: '05', title: 'Terima Pesanan', desc: 'Customer scan QR, pesan, bayar. Pesanan masuk ke dashboard merchant.' },
  { step: '06', title: 'Proses & Sajikan', desc: 'Verifikasi bayar, proses, tandai siap. Customer terima notifikasi.' },
];

const PRICING = [
  {
    code: 'basic',
    name: 'Basic',
    price: 'Rp50.000',
    period: '/bulan',
    highlight: false,
    features: ['1 outlet', 'QR Ordering', 'Manual POS', 'Dashboard pesanan', 'Riwayat transaksi', 'Support email'],
  },
  {
    code: 'pro',
    name: 'Pro',
    price: 'Rp120.000',
    period: '/bulan',
    highlight: true,
    features: ['Semua fitur Basic', 'Multi-outlet', 'Laporan lanjutan', 'Ekspor data', 'Priority support', 'Custom branding'],
  },
  {
    code: 'business',
    name: 'Business',
    price: 'Rp250.000',
    period: '/bulan',
    highlight: false,
    features: ['Semua fitur Pro', 'API access', 'Dedicated onboarding', 'SLA uptime 99.9%', 'Admin multi-role', 'Konsultasi setup'],
  },
];

const FAQS = [
  { q: 'Apakah perlu kartu kredit untuk daftar trial?', a: 'Tidak. Trial 14 hari gratis, tidak perlu kartu kredit. Upgrade manual setelah trial.' },
  { q: 'Apakah QR Ordering butuh aplikasi?', a: 'Tidak. Customer cukup scan QR dengan kamera HP, langsung buka di browser. Tidak ada aplikasi yang perlu diinstall.' },
  { q: 'Bagaimana cara pembayaran QRIS?', a: 'Upload gambar QR QRIS statis Anda di pengaturan. Customer scan, transfer, lalu kasir konfirmasi pembayaran secara manual di dashboard.' },
  { q: 'Apakah bisa digunakan untuk warung kopi kecil?', a: 'Ya. Platform ini dirancang untuk semua skala, dari warkop dan warmindo hingga restoran multi-outlet.' },
  { q: 'Data saya aman?', a: 'Ya. Setiap merchant terisolasi penuh di database PostgreSQL. Tidak ada akses data lintas tenant.' },
  { q: 'Bagaimana jika langganan expired?', a: 'Pesanan yang sudah lunas tetap dapat diproses. Fitur baru tidak dapat digunakan sampai berlangganan kembali.' },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E8E6DF]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-[#252525] hover:text-[#1B4D3E] transition-colors"
      >
        <span>{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#64625C] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <p className="pb-4 text-sm text-[#64625C] leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export const LandingPage: React.FC = () => {
  const [showRegister, setShowRegister] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525]">
      {/* Navigation */}
      <header className={`sticky top-0 z-40 transition-all duration-200 ${scrolled ? 'border-b border-[#E8E6DF] bg-[#FAF9F6]/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold text-lg text-[#1B4D3E]">
            <div className="w-8 h-8 rounded-xl bg-[#1B4D3E] flex items-center justify-center">
              <Coffee className="h-4.5 w-4.5 text-[#FCD804]" />
            </div>
            <span>WarkopOS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#64625C]">
            <a href="#features" className="hover:text-[#1B4D3E] transition-colors">Fitur</a>
            <a href="#how-it-works" className="hover:text-[#1B4D3E] transition-colors">Cara Kerja</a>
            <a href="#pricing" className="hover:text-[#1B4D3E] transition-colors">Harga</a>
            <a href="#faq" className="hover:text-[#1B4D3E] transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              to="/merchant/login"
              className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-[#1B4D3E] hover:bg-[#1B4D3E]/8 rounded-xl transition-colors"
            >
              Masuk
            </Link>
            <button
              onClick={() => setShowRegister(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors"
            >
              Coba Gratis
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMobileNav((v) => !v)}
              className="md:hidden text-[#64625C] hover:text-[#252525] p-2"
              aria-label="Menu"
            >
              {mobileNav ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileNav && (
          <div className="md:hidden border-t border-[#E8E6DF] bg-white px-6 py-4 space-y-3">
            {['#features', '#how-it-works', '#pricing', '#faq'].map((href) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileNav(false)}
                className="block text-sm font-medium text-[#64625C] hover:text-[#1B4D3E] py-1.5"
              >
                {href === '#features' ? 'Fitur' : href === '#how-it-works' ? 'Cara Kerja' : href === '#pricing' ? 'Harga' : 'FAQ'}
              </a>
            ))}
            <Link
              to="/merchant/login"
              onClick={() => setMobileNav(false)}
              className="block text-sm font-semibold text-[#1B4D3E] py-1.5"
            >
              Masuk ke Dashboard
            </Link>
          </div>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#1B4D3E] to-[#143B2F] text-white">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full bg-[#FCD804] blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full bg-white blur-[100px]" />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 py-20 lg:py-28">
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 mb-6">
                <Zap className="h-3.5 w-3.5 text-[#FCD804]" />
                Siap pakai dalam 10 menit · Trial gratis 14 hari
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Sistem POS & QR Order<br />
                <span className="text-[#FCD804]">untuk F&B Indonesia</span>
              </h1>

              <p className="mt-6 text-lg text-white/70 leading-relaxed max-w-2xl mx-auto">
                Customer scan QR meja, pesan, bayar — langsung masuk ke dashboard merchant.
                Kelola pesanan, kasir, dan laporan dari satu platform berbasis web.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => setShowRegister(true)}
                  className="inline-flex items-center gap-2.5 rounded-2xl bg-[#FCD804] px-7 py-4 text-base font-bold text-[#252525] hover:bg-[#EFCB00] transition-colors shadow-lg shadow-[#FCD804]/20"
                >
                  Mulai Trial 14 Hari Gratis
                  <ArrowRight className="h-5 w-5" />
                </button>
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-7 py-4 text-base font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Lihat Demo
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-sm text-white/50">
                {[
                  { icon: CheckCircle2, text: 'Tidak perlu kartu kredit' },
                  { icon: CheckCircle2, text: 'Setup dalam 10 menit' },
                  { icon: CheckCircle2, text: 'Data Anda terisolasi penuh' },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-[#FCD804]" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
              {[
                { icon: Store, label: 'Jenis Bisnis', value: 'Semua F&B' },
                { icon: QrCode, label: 'QR Ordering', value: 'Tanpa App' },
                { icon: Calculator, label: 'Manual POS', value: 'Touchscreen' },
                { icon: Users, label: 'Multi-role', value: 'Owner + Kasir' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-2xl bg-white/8 border border-white/10 p-4 text-center">
                  <Icon className="h-6 w-6 mx-auto mb-2 text-[#FCD804]" />
                  <p className="text-xs text-white/50">{label}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#1B4D3E]/8 px-4 py-2 text-xs font-semibold text-[#1B4D3E] mb-4">
                <Star className="h-3.5 w-3.5" />
                Fitur Platform
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#252525]">
                Semua yang Anda butuhkan<br />
                <span className="text-[#1B4D3E]">dalam satu platform</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-[#E8E6DF] bg-white p-6 hover:border-[#1B4D3E]/30 hover:shadow-sm transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1B4D3E]/8 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-[#1B4D3E]" />
                  </div>
                  <h3 className="font-bold text-[#252525]">{title}</h3>
                  <p className="mt-2 text-sm text-[#64625C] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-20 lg:py-24 bg-[#F3F1EC]">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#252525]">Cara Kerja</h2>
              <p className="mt-3 text-[#64625C]">Dari daftar hingga transaksi pertama dalam hitungan menit</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {HOW_IT_WORKS.map(({ step, title, desc }) => (
                <div key={step} className="relative rounded-2xl bg-white border border-[#E8E6DF] p-6">
                  <div className="text-4xl font-black text-[#1B4D3E]/10 mb-3">{step}</div>
                  <h3 className="font-bold text-[#252525]">{title}</h3>
                  <p className="mt-2 text-sm text-[#64625C] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#252525]">Harga Transparan</h2>
              <p className="mt-3 text-[#64625C]">Trial 14 hari gratis untuk semua paket. Tidak ada biaya tersembunyi.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {PRICING.map((plan) => (
                <div
                  key={plan.code}
                  className={`rounded-2xl p-6 ${
                    plan.highlight
                      ? 'bg-[#1B4D3E] text-white shadow-xl shadow-[#1B4D3E]/20 ring-2 ring-[#FCD804]'
                      : 'bg-white border border-[#E8E6DF]'
                  }`}
                >
                  {plan.highlight && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#FCD804] px-3 py-1 text-xs font-bold text-[#252525] mb-3">
                      <Star className="h-3 w-3" /> Paling Populer
                    </div>
                  )}
                  <h3 className={`font-extrabold text-lg ${plan.highlight ? 'text-white' : 'text-[#252525]'}`}>
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className={`text-3xl font-black ${plan.highlight ? 'text-[#FCD804]' : 'text-[#1B4D3E]'}`}>
                      {plan.price}
                    </span>
                    <span className={`text-sm ${plan.highlight ? 'text-white/60' : 'text-[#64625C]'}`}>
                      {plan.period}
                    </span>
                  </div>
                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className={`h-4 w-4 shrink-0 ${plan.highlight ? 'text-[#FCD804]' : 'text-[#1B4D3E]'}`} />
                        <span className={plan.highlight ? 'text-white/80' : 'text-[#64625C]'}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setShowRegister(true)}
                    className={`mt-6 w-full rounded-xl py-3 text-sm font-bold transition-colors ${
                      plan.highlight
                        ? 'bg-[#FCD804] text-[#252525] hover:bg-[#EFCB00]'
                        : 'bg-[#1B4D3E]/8 text-[#1B4D3E] hover:bg-[#1B4D3E]/15'
                    }`}
                  >
                    Coba Gratis 14 Hari
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-20 lg:py-24 bg-[#F3F1EC]">
          <div className="mx-auto max-w-2xl px-6">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-extrabold text-[#252525]">Pertanyaan Umum</h2>
            </div>
            <div className="rounded-2xl bg-white border border-[#E8E6DF] px-6 py-2">
              {FAQS.map((faq) => (
                <FAQItem key={faq.q} {...faq} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-[#1B4D3E]">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Siap digitalisasi bisnis F&B Anda?
            </h2>
            <p className="mt-4 text-white/60 text-lg">
              Bergabung dengan ribuan merchant F&B Indonesia. Trial 14 hari gratis, tidak perlu kartu kredit.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setShowRegister(true)}
                className="inline-flex items-center gap-2.5 rounded-2xl bg-[#FCD804] px-8 py-4 text-base font-bold text-[#252525] hover:bg-[#EFCB00] transition-colors shadow-lg shadow-[#FCD804]/20"
              >
                Daftar Sekarang — Gratis
                <ArrowRight className="h-5 w-5" />
              </button>
              <Link
                to="/merchant/login"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white hover:bg-white/8 transition-colors"
              >
                Sudah punya akun? Masuk
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#252525] text-white/40 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#1B4D3E] flex items-center justify-center">
              <Coffee className="h-3.5 w-3.5 text-[#FCD804]" />
            </div>
            <span className="font-semibold text-white/60">WarkopOS</span>
            <span>· Platform SaaS F&B Indonesia</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/merchant/login" className="hover:text-white/70 transition-colors">Merchant Login</Link>
            <span>·</span>
            <span>© 2026 WarkopOS</span>
          </div>
        </div>
      </footer>

      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} />}
    </div>
  );
};
