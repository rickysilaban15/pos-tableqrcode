import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Coffee, ArrowRight } from 'lucide-react';

export function MerchantLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) return setError(data.error || 'Login gagal');
      if (data.role === 'SUPER_ADMIN') {
        nav('/super-admin', { replace: true });
      } else {
        nav('/admin', { replace: true });
      }
    } catch {
      setError('Koneksi ke server gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#FAF9F6] to-[#EEE9E0] flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 font-extrabold text-xl text-[#1B4D3E]">
            <div className="w-10 h-10 rounded-xl bg-[#1B4D3E] flex items-center justify-center shadow-lg shadow-[#1B4D3E]/20">
              <Coffee className="h-5 w-5 text-[#FCD804]" />
            </div>
            WarkopOS
          </Link>
          <p className="mt-2 text-sm text-[#64625C]">Masuk ke dashboard merchant Anda</p>
        </div>

        <div className="rounded-2xl bg-white border border-[#E8E6DF] p-7 shadow-sm">
          <h1 className="text-lg font-extrabold text-[#252525] mb-5">Masuk Merchant</h1>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Email</label>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@bisnis.com"
                className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252525] mb-1.5">Kata Sandi</label>
              <div className="relative">
                <input
                  required
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata sandi"
                  className="w-full rounded-xl border border-[#E8E6DF] px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/30 focus:border-[#1B4D3E]/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C8980] hover:text-[#252525] transition-colors"
                  aria-label={showPw ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#1B4D3E] py-3.5 text-sm font-bold text-white hover:bg-[#143B2F] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? 'Memverifikasi…' : 'Masuk'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-[#E8E6DF] text-center text-xs text-[#64625C]">
            Belum punya akun?{' '}
            <Link to="/?register=1" className="text-[#1B4D3E] font-semibold hover:underline">
              Daftar gratis 14 hari
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-[#8C8980]">
          <Link to="/" className="hover:text-[#1B4D3E]">← Kembali ke beranda</Link>
        </p>
      </div>
    </main>
  );
}
