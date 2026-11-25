import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Coffee,
  FolderKanban,
  QrCode,
  Settings,
  Menu,
  X,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { BrandMark } from '../../components/BrandMark';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Pesanan', icon: ClipboardList, end: false },
  { to: '/admin/menu', label: 'Menu & Produk', icon: Coffee, end: false },
  { to: '/admin/categories', label: 'Kategori', icon: FolderKanban, end: false },
  { to: '/admin/tables', label: 'Meja & QR Code', icon: QrCode, end: false },
  { to: '/admin/settings', label: 'Pengaturan Cafe', icon: Settings, end: false },
];

function getPageTitle(pathname: string): string {
  if (pathname === '/admin') return 'Dashboard Overview';
  if (pathname.startsWith('/admin/orders')) return 'Manajemen Pesanan';
  if (pathname.startsWith('/admin/menu')) return 'Menu & Produk';
  if (pathname.startsWith('/admin/categories')) return 'Kategori Menu';
  if (pathname.startsWith('/admin/tables')) return 'Meja & QR Code';
  if (pathname.startsWith('/admin/settings')) return 'Pengaturan Cafe';
  return 'Admin Dashboard';
}

export const AdminLayout: React.FC = () => {
  const { state } = usePos();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const newOrderCount = state.orders.filter((o) => o.orderStatus === 'ORDER_BARU').length;
  const firstActiveTable = state.tables.find((t) => t.isActive) ?? state.tables[0];
  const previewUrl = firstActiveTable
    ? `/order/${state.cafeSettings.slug}?table=${encodeURIComponent(firstActiveTable.name)}&token=${encodeURIComponent(firstActiveTable.token)}`
    : `/order/${state.cafeSettings.slug}`;

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
                isActive
                  ? 'bg-[#1B4D3E] text-white'
                  : 'text-[#4B4944] hover:bg-[#F2EFE9] hover:text-[#252525]'
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
                      isActive
                        ? 'bg-[#FCD804] text-[#252525]'
                        : 'bg-[#1B4D3E]/10 text-[#1B4D3E]'
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
      <aside className="hidden lg:flex lg:w-[252px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E8E6DF] bg-white z-30">
        <div className="flex h-16 items-center gap-3 border-b border-[#E8E6DF] px-5">
          <BrandMark logoUrl={state.cafeSettings.logoUrl} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight text-[#1B4D3E] truncate">
              LARIS POS
            </div>
            <div className="text-xs text-[#64625C] truncate">
              {state.cafeSettings.name}
            </div>
          </div>
        </div>

        {renderNavLinks()}

        <div className="border-t border-[#E8E6DF] p-3 space-y-1.5">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#64625C] hover:bg-[#FAF9F6] hover:text-[#252525] transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>Kembali ke Portal Demo</span>
          </Link>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex w-72 max-w-[85vw] flex-col bg-white border-r border-[#E8E6DF] shadow-xl z-10">
            <div className="flex h-16 items-center justify-between border-b border-[#E8E6DF] px-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark logoUrl={state.cafeSettings.logoUrl} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-[#1B4D3E] truncate">LARIS POS</div>
                  <div className="text-xs text-[#64625C] truncate">{state.cafeSettings.name}</div>
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
              <Link
                to="/"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#64625C] hover:bg-[#FAF9F6]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Kembali ke Portal Demo</span>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#E8E6DF] bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E6DF] bg-white text-[#252525] hover:bg-[#FAF9F6]"
              aria-label="Buka navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-[#252525] truncate">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#252525] hover:border-[#1B4D3E]/40 hover:bg-white transition-colors whitespace-nowrap shrink-0"
            >
              <span>Buka Web Customer</span>
              <ExternalLink className="h-3.5 w-3.5 text-[#1B4D3E]" />
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
