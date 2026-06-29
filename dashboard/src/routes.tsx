import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/components/auth/protected-route'
import AuthCallbackPage from '@/pages/auth/callback'
import LoginPage from '@/pages/auth/login'
import OnboardingPage from '@/pages/auth/onboarding'
import RegisterPage from '@/pages/auth/register'
import DashboardPage from '@/pages/dashboard'
import ProductsPage from '@/pages/products'
import CategoriesPage from '@/pages/categories'
import OrdersPage from '@/pages/orders'
import CustomersPage from '@/pages/customers'
import SettingsPage from '@/pages/settings'
import CompanySettingsPage from '@/pages/settings/company'
import TaxSettingsPage from '@/pages/settings/tax'
import PaymentMethodsPage from '@/pages/settings/payments'
import StaffSettingsPage from '@/pages/settings/staff'
import IntegrationsPage from '@/pages/settings/integrations'
import CustomizationPage from '@/pages/settings/customization'
import { PosProvider } from '@/pos/lib/pos-context'
import { PosShell } from '@/pos/pos-shell'
import PosLogin from '@/pos/pages/pos-login'
import SalePage from '@/pos/pages/sale'
import ReturnsPage from '@/pos/pages/returns'
import TransfersPage from '@/pos/pages/transfers'
import StockPage from '@/pos/pages/stock'
import TransactionsPage from '@/pos/pages/transactions'
import ReportsPage from '@/pos/pages/reports'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    path: '/onboarding',
    element: (
      <ProtectedRoute allowMissingCompany>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },
  {
    // Self-contained POS terminal demo (mock data, no backend/auth required).
    path: '/pos',
    element: (
      <PosProvider>
        <Outlet />
      </PosProvider>
    ),
    children: [
      { index: true, element: <PosLogin /> },
      { path: 'login', element: <PosLogin /> },
      {
        element: <PosShell />,
        children: [
          { path: 'sale', element: <SalePage /> },
          { path: 'returns', element: <ReturnsPage /> },
          { path: 'transfers', element: <TransfersPage /> },
          { path: 'stock', element: <StockPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'reports', element: <ReportsPage /> },
        ],
      },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'customers', element: <CustomersPage /> },
      {
        path: 'settings',
        element: <SettingsPage />,
        children: [
          { index: true, element: <CompanySettingsPage /> },
          { path: 'tax', element: <TaxSettingsPage /> },
          { path: 'payments', element: <PaymentMethodsPage /> },
          { path: 'staff', element: <StaffSettingsPage /> },
          { path: 'integrations', element: <IntegrationsPage /> },
          { path: 'customization', element: <CustomizationPage /> },
        ],
      },
    ],
  },
])
