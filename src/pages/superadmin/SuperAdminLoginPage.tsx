import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';

export function SuperAdminLoginPage() {
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
      if (data.role !== 'SUPER_ADMIN') {
        await fetch('/api/auth/logout', { method: 'POST' });
        return setError('Akun ini tidak memiliki akses Super Admin');
      }
      nav('/super-admin', { replace: true });
    } catch {
      setError('Koneksi ke server gagal. Periksa koneksi Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0D2B22] via-[#1B4D3E] to-[#0F3528] flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm mb-4">
            <Shield className="h-8 w-8 text-[#FCD804]" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Super Admin</h1>
          <p className="mt-1 text-sm text-white/50">Akses terbatas untuk administrator platform</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white/8 border border-white/10 backdrop-blur-md p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@platform.com"
              className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#FCD804]/40 focus:border-[#FCD804]/40 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Kata Sandi</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 pr-11 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#FCD804]/40 focus:border-[#FCD804]/40 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label={showPw ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/15 border border-red-400/20 px-3.5 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#FCD804] py-3 text-sm font-bold text-[#252525] hover:bg-[#EFCB00] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Memverifikasi…' : 'Masuk Super Admin'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/30">
          Semua akses dan tindakan direkam dalam audit log
        </p>
      </div>
    </main>
  );
}
