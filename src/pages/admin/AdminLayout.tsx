import React, { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Calculator,
  History,
  Coffee,
  FolderKanban,
  QrCode,
  Settings,
  Menu,
  X,
  ExternalLink,
  LogOut,
  AlertTriangle,
  CreditCard,
  ChefHat,
} from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Pesanan', icon: ClipboardList, end: false },
  { to: '/admin/pos', label: 'Kasir / POS', icon: Calculator, end: false },
  { to: '/admin/history', label: 'Riwayat & Laporan', icon: History, end: false },
  { to: '/admin/menu', label: 'Menu & Produk', icon: Coffee, end: false },
  { to: '/admin/categories', label: 'Kategori', icon: FolderKanban, end: false },
  { to: '/admin/tables', label: 'Meja & QR Code', icon: QrCode, end: false },
  { to: '/admin/settings', label: 'Pengaturan Cafe', icon: Settings, end: false },
  { to: '/admin/subscription', label: 'Langganan', icon: CreditCard, end: false },
];

function getPageTitle(pathname: string): string {
  if (pathname === '/admin') return 'Dashboard Overview';
  if (pathname.startsWith('/admin/orders')) return 'Manajemen Pesanan';
  if (pathname.startsWith('/admin/pos')) return 'Kasir / POS';
  if (pathname.startsWith('/admin/history')) return 'Riwayat Transaksi & Laporan';
  if (pathname.startsWith('/admin/menu')) return 'Menu & Produk';
  if (pathname.startsWith('/admin/categories')) return 'Kategori Menu';
  if (pathname.startsWith('/admin/tables')) return 'Meja & QR Code';
  if (pathname.startsWith('/admin/settings')) return 'Pengaturan Cafe';
  if (pathname.startsWith('/admin/subscription')) return 'Langganan & Paket';
  return 'Admin Dashboard';
}

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [brand, setBrand] = useState({ name: 'Merchant Outlet', logoUrl: '' });
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('/admin/tables');
  const [subBanner, setSubBanner] = useState('');
  const [planSummary, setPlanSummary] = useState<{ planName: string; status: string; effectiveActive: boolean } | null>(null);

  const loadShell = useCallback(async () => {
    try {
      const [settingsRes, ordersRes, tablesRes, entRes] = await Promise.all([
        fetch('/api/v1/settings'),
        fetch('/api/v1/orders'),
        fetch('/api/v1/tables'),
        fetch('/api/v1/orders/entitlements'),
      ]);
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setBrand({ name: s.name || 'Merchant Outlet', logoUrl: s.logoUrl || '' });
      }
      if (ordersRes.ok) {
        const o = await ordersRes.json();
        if (Array.isArray(o)) {
          setNewOrderCount(o.filter((x: { orderStatus: string }) => x.orderStatus === 'NEW_ORDER').length);
        }
      }
      if (tablesRes.ok) {
        const t = await tablesRes.json();
        const firstActive = Array.isArray(t)
          ? t.find((x: { isActive: boolean; qrToken?: string }) => x.isActive && x.qrToken)
          : null;
        if (firstActive?.qrToken) {
          setPreviewUrl(`/q/${encodeURIComponent(firstActive.qrToken)}`);
        } else {
          setPreviewUrl('/admin/tables');
        }
      }
      if (entRes.ok) {
        const ent = await entRes.json();
        setPlanSummary({
          planName: ent.planName || 'Basic',
          status: ent.status || 'TRIAL',
          effectiveActive: Boolean(ent.effectiveActive),
        });
        if (!ent.effectiveActive) {
          setSubBanner(`Langganan (${ent.planName}) berstatus ${ent.status}. Pesanan lunas tetap dapat diproses.`);
        } else if (ent.status === 'TRIAL' && ent.trialEndsAt) {
          const daysLeft = Math.ceil((new Date(ent.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7) {
            setSubBanner(`Trial ${ent.planName} berakhir dalam ${daysLeft} hari. Hubungi admin untuk memperpanjang.`);
          } else {
            setSubBanner('');
          }
        } else {
          setSubBanner('');
        }
      }
    } catch {
      // Keep current shell values on transient network glitch
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return navigate('/merchant/login', { replace: true });
        const me = await response.json().catch(() => null);
        if (me?.role === 'SUPER_ADMIN') {
          return navigate('/super-admin', { replace: true });
        }
        if (active) {
          setSessionReady(true);
          await loadShell();
        }
      })
      .catch(() => {
        if (active) setSessionError('Sesi merchant tidak dapat diverifikasi.');
      });
    return () => {
      active = false;
    };
  }, [navigate, loadShell]);

  useEffect(() => {
    if (!sessionReady || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/v1/events');
    const refresh = () => {
      void loadShell();
    };
    ['order:created', 'payment:confirmed', 'order:updated', 'order:cancelled', 'order:refunded', 'settings:updated'].forEach(
      (ev) => es.addEventListener(ev, refresh),
    );
    return () => {
      es.close();
    };
  }, [sessionReady, loadShell]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/merchant/login', { replace: true });
  };

  if (sessionError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#FAF9F6] p-5">
        <section className="max-w-sm rounded-2xl border border-[#E8E6DF] bg-white p-6 text-center">
          <h1 className="font-bold text-[#252525]">Sesi merchant bermasalah</h1>
          <p className="mt-2 text-sm text-[#64625C]">{sessionError}</p>
        </section>
      </main>
    );
  }
  if (!sessionReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#FAF9F6] text-sm font-semibold text-[#1B4D3E]">
        Memverifikasi sesi merchant…
      </main>
    );
  }

  const pageTitle = getPageTitle(location.pathname);

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isOrders = item.to === '/admin/orders';
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'bg-[#1B4D3E] text-white' : 'text-[#4B4944] hover:bg-[#F2EFE9] hover:text-[#252525]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      isActive ? 'text-[#FCD804]' : 'text-[#64625C]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {isOrders && newOrderCount > 0 && (
                  <span
                    className={`ml-2 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
                      isActive ? 'bg-[#FCD804] text-[#252525]' : 'bg-[#1B4D3E]/10 text-[#1B4D3E]'
                    }`}
                  >
                    {newOrderCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#252525] flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-[252px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E8E6DF] bg-white z-30">
        <div className="flex h-16 items-center gap-3 border-b border-[#E8E6DF] px-5">
          <BrandMark logoUrl={brand.logoUrl} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight text-[#1B4D3E] truncate">{brand.name}</div>
            <div className="text-xs text-[#64625C] truncate">Dashboard Merchant</div>
          </div>
        </div>

        {renderNavLinks()}

        <div className="border-t border-[#E8E6DF] p-3 space-y-1.5">
          <a
            href="/admin/kitchen"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#64625C] hover:bg-[#EEF4F1] hover:text-[#1B4D3E] transition-colors"
          >
            <ChefHat className="h-4 w-4 shrink-0 text-[#1B4D3E]" />
            <span>Kitchen Display</span>
            <ExternalLink className="h-3 w-3 ml-auto text-[#8C8980]" />
          </a>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#64625C] hover:bg-[#FDECEC] hover:text-[#A62626] transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex w-72 max-w-[85vw] flex-col bg-white border-r border-[#E8E6DF] shadow-xl z-10">
            <div className="flex h-16 items-center justify-between border-b border-[#E8E6DF] px-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark logoUrl={brand.logoUrl} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-[#1B4D3E] truncate">{brand.name}</div>
                  <div className="text-xs text-[#64625C] truncate">Dashboard Merchant</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64625C] hover:bg-[#FAF9F6]"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNavLinks(() => setSidebarOpen(false))}
            <div className="border-t border-[#E8E6DF] p-3">
              <a
                href="/admin/kitchen"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#64625C] hover:bg-[#EEF4F1] hover:text-[#1B4D3E] mb-1.5"
              >
                <ChefHat className="h-4 w-4 shrink-0 text-[#1B4D3E]" />
                Kitchen Display
                <ExternalLink className="h-3 w-3 ml-auto" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  void handleLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#64625C] hover:bg-[#FDECEC] hover:text-[#A62626]"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar Sesi</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-[252px]">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#E8E6DF] bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E6DF] bg-white text-[#252525] hover:bg-[#FAF9F6]"
              aria-label="Buka navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-[#252525] truncate">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {planSummary && (
              <Link
                to="/admin/subscription"
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                  planSummary.effectiveActive
                    ? 'border-[#B8E1C8] bg-[#E9F5EE] text-[#15623A] hover:bg-[#DDF0E5]'
                    : 'border-[#F6D3AE] bg-[#FEF3E6] text-[#9A520A] hover:bg-[#FCE8D2]'
                }`}
              >
                <span>{planSummary.planName}</span>
                <span className="opacity-60">·</span>
                <span>{planSummary.status === 'TRIAL' ? 'Trial' : planSummary.effectiveActive ? 'Aktif' : planSummary.status}</span>
              </Link>
            )}
            {previewUrl.startsWith('/q/') ? (
              <Link
                to={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#252525] hover:border-[#1B4D3E]/40 hover:bg-white transition-colors whitespace-nowrap shrink-0"
              >
                <span>Buka Web Customer</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#1B4D3E]" />
              </Link>
            ) : (
              <Link
                to="/admin/tables"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#252525] hover:border-[#1B4D3E]/40 hover:bg-white transition-colors whitespace-nowrap shrink-0"
              >
                <span>Siapkan QR Meja</span>
                <QrCode className="h-3.5 w-3.5 text-[#1B4D3E]" />
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {subBanner && (
            <div role="status" className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-4 py-3 text-xs font-semibold text-[#7C4106]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9A520A]" />
              <span>{subBanner}</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
