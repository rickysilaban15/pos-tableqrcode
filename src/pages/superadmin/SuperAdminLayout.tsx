import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  Menu,
  X,
  LogOut,
  ChevronRight,
} from 'lucide-react';

const NAV = [
  { to: '/super-admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/super-admin/merchants', label: 'Merchants', icon: Users, end: false },
  { to: '/super-admin/plans', label: 'Paket & Harga', icon: CreditCard, end: false },
  { to: '/super-admin/audit', label: 'Audit Log', icon: FileText, end: false },
];

export const SuperAdminLayout: React.FC = () => {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then(async (r) => {
        if (!r.ok) return nav('/super-admin/login', { replace: true });
        const data = await r.json();
        if (data.role !== 'SUPER_ADMIN') {
          await fetch('/api/auth/logout', { method: 'POST' });
          return nav('/super-admin/login', { replace: true });
        }
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setError('Sesi tidak dapat diverifikasi.');
      });
    return () => { active = false; };
  }, [nav]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    nav('/super-admin/login', { replace: true });
  };

  if (error) {
    return (
      <main className="min-h-screen bg-[#0D2B22] flex items-center justify-center p-5">
        <div className="text-center text-white/60">
          <Shield className="h-10 w-10 mx-auto mb-4 text-[#FCD804]" />
          <p className="text-sm">{error}</p>
          <Link to="/super-admin/login" className="mt-4 inline-block text-sm text-[#FCD804] hover:underline">
            Kembali ke Login
          </Link>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#0D2B22] flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/50 text-sm">
          <Shield className="h-5 w-5 text-[#FCD804] animate-pulse" />
          Memverifikasi sesi Super Admin…
        </div>
      </main>
    );
  }

  const Sidebar = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-white/8 px-5">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#FCD804]/15">
          <Shield className="h-5 w-5 text-[#FCD804]" />
        </div>
        <div>
          <div className="text-sm font-extrabold text-white tracking-tight">Super Admin</div>
          <div className="text-xs text-white/40">Platform Control</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNav}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#FCD804]/15 text-[#FCD804]'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-[#FCD804]' : 'text-white/40'}`} />
                <span className="truncate">{label}</span>
                {isActive && <ChevronRight className="ml-auto h-4 w-4 text-[#FCD804]/60" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/8 p-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white/40 hover:bg-red-500/15 hover:text-red-300 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#0F1D18] text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0D2B22] border-r border-white/8 z-30">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="relative flex flex-col w-64 bg-[#0D2B22] border-r border-white/8 z-10">
            <div className="flex items-center justify-end p-3 absolute top-0 right-0">
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white/40 hover:text-white p-1"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNav={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/8 bg-[#0F1D18]/95 px-4 sm:px-6 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden text-white/40 hover:text-white"
            aria-label="Buka navigasi"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:flex items-center gap-2 text-xs text-white/30">
            <Shield className="h-3.5 w-3.5" />
            Super Admin Dashboard
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-red-300 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
