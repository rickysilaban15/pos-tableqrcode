import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from './components/ToastContainer';
import { ToastProvider } from './context/ToastContext';

// Eager: tiny critical path
import { LandingPage } from './pages/LandingPage';
import { MerchantLoginPage } from './pages/admin/MerchantLoginPage';
import { SuperAdminLoginPage } from './pages/superadmin/SuperAdminLoginPage';

// Lazy chunks — split by surface
const DemoPortalPage = lazy(() => import('./pages/DemoPortalPage').then((m) => ({ default: m.DemoPortalPage })));

// Admin (merchant) surface
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })));
const AdminMenuPage = lazy(() => import('./pages/admin/AdminMenuPage').then((m) => ({ default: m.AdminMenuPage })));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage').then((m) => ({ default: m.AdminCategoriesPage })));
const AdminTablesPage = lazy(() => import('./pages/admin/AdminTablesPage').then((m) => ({ default: m.AdminTablesPage })));
const AdminTablePrintPage = lazy(() => import('./pages/admin/AdminTablePrintPage').then((m) => ({ default: m.AdminTablePrintPage })));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));
const AdminPosPage = lazy(() => import('./pages/admin/AdminPosPage').then((m) => ({ default: m.AdminPosPage })));
const AdminHistoryPage = lazy(() => import('./pages/admin/AdminHistoryPage').then((m) => ({ default: m.AdminHistoryPage })));
const AdminSubscriptionPage = lazy(() => import('./pages/admin/AdminSubscriptionPage').then((m) => ({ default: m.AdminSubscriptionPage })));
const AdminKitchenPage = lazy(() => import('./pages/admin/AdminKitchenPage').then((m) => ({ default: m.AdminKitchenPage })));

// Customer surface
const CustomerOrderPage = lazy(() => import('./pages/customer/CustomerOrderPage').then((m) => ({ default: m.CustomerOrderPage })));
const OrderTrackingPage = lazy(() => import('./pages/customer/OrderTrackingPage').then((m) => ({ default: m.OrderTrackingPage })));

// Super Admin surface
const SuperAdminLayout = lazy(() => import('./pages/superadmin/SuperAdminLayout').then((m) => ({ default: m.SuperAdminLayout })));
const SuperAdminOverviewPage = lazy(() => import('./pages/superadmin/SuperAdminOverviewPage').then((m) => ({ default: m.SuperAdminOverviewPage })));
const SuperAdminMerchantsPage = lazy(() => import('./pages/superadmin/SuperAdminMerchantsPage').then((m) => ({ default: m.SuperAdminMerchantsPage })));
const SuperAdminPlansPage = lazy(() => import('./pages/superadmin/SuperAdminPlansPage').then((m) => ({ default: m.SuperAdminPlansPage })));
const SuperAdminAuditPage = lazy(() => import('./pages/superadmin/SuperAdminAuditPage').then((m) => ({ default: m.SuperAdminAuditPage })));

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] grid place-items-center text-sm text-[#64625C]">
      <span className="animate-pulse">Memuat halaman…</span>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<DemoPortalPage />} />

            {/* Dedicated Print Routes (clean layout without sidebar) */}
            <Route path="/admin/tables/print" element={<AdminTablePrintPage />} />
            <Route path="/admin/tables/print/:tableId" element={<AdminTablePrintPage />} />
            <Route path="/admin/kitchen" element={<AdminKitchenPage />} />

            {/* Admin Dashboard Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="pos" element={<AdminPosPage />} />
              <Route path="history" element={<AdminHistoryPage />} />
              <Route path="menu" element={<AdminMenuPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="tables" element={<AdminTablesPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="subscription" element={<AdminSubscriptionPage />} />
            </Route>

            {/* Super Admin Routes */}
            <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
            <Route path="/super-admin" element={<SuperAdminLayout />}>
              <Route index element={<SuperAdminOverviewPage />} />
              <Route path="merchants" element={<SuperAdminMerchantsPage />} />
              <Route path="plans" element={<SuperAdminPlansPage />} />
              <Route path="audit" element={<SuperAdminAuditPage />} />
            </Route>

            {/* Customer Web Ordering & Tracking Routes */}
            <Route path="/order/:storeSlug" element={<CustomerOrderPage />} />
            <Route path="/order-tracking/:orderId" element={<OrderTrackingPage />} />
            <Route path="/tracking/:token" element={<OrderTrackingPage />} />
            <Route path="/q/:token" element={<CustomerOrderPage />} />
            <Route path="/merchant/login" element={<MerchantLoginPage />} />
            <Route path="/merchant" element={<Navigate to="/admin" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </BrowserRouter>
    </ToastProvider>
  );
}
