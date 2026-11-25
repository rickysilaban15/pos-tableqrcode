import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PosProvider } from './context/PosContext';
import { ToastContainer } from './components/ToastContainer';
import { DemoPortalPage } from './pages/DemoPortalPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminMenuPage } from './pages/admin/AdminMenuPage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminTablesPage } from './pages/admin/AdminTablesPage';
import { AdminTablePrintPage } from './pages/admin/AdminTablePrintPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { CustomerOrderPage } from './pages/customer/CustomerOrderPage';
import { OrderTrackingPage } from './pages/customer/OrderTrackingPage';

export default function App() {
  return (
    <PosProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DemoPortalPage />} />

          {/* Dedicated Print Routes (clean layout without sidebar) */}
          <Route path="/admin/tables/print" element={<AdminTablePrintPage />} />
          <Route path="/admin/tables/print/:tableId" element={<AdminTablePrintPage />} />

          {/* Admin Dashboard Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="menu" element={<AdminMenuPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="tables" element={<AdminTablesPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>

          {/* Customer Web Ordering & Tracking Routes */}
          <Route path="/order/:storeSlug" element={<CustomerOrderPage />} />
          <Route path="/order-tracking/:orderId" element={<OrderTrackingPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </PosProvider>
  );
}
