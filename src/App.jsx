import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/layout/Layout.jsx'
import { BouncingDots } from './components/ui/BouncingDots.jsx'

// Public pages — loaded immediately (small, always needed)
import Landing      from './pages/Landing.jsx'
import Login        from './pages/Login.jsx'
import Signup       from './pages/Signup.jsx'
import PrivacyPolicy  from './pages/PrivacyPolicy.jsx'
import TermsOfService from './pages/TermsOfService.jsx'

// Authenticated pages — lazy loaded, only fetched when navigated to
const Dashboard       = lazy(() => import('./pages/Dashboard.jsx'))
const TradeLog        = lazy(() => import('./pages/TradeLog.jsx'))
const TradeFormPage   = lazy(() => import('./pages/TradeFormPage.jsx'))
const TradeDetailPage = lazy(() => import('./pages/TradeDetailPage.jsx'))
const Analytics       = lazy(() => import('./pages/Analytics.jsx'))
const Journal         = lazy(() => import('./pages/Journal.jsx'))
const Psychology      = lazy(() => import('./pages/Psychology.jsx'))
const Playbook        = lazy(() => import('./pages/Playbook.jsx'))
const Goals           = lazy(() => import('./pages/Goals.jsx'))
const Accounts        = lazy(() => import('./pages/Accounts.jsx'))
const ImportExport    = lazy(() => import('./pages/ImportExport.jsx'))
const Settings        = lazy(() => import('./pages/Settings.jsx'))
const Calculator      = lazy(() => import('./pages/Calculator.jsx'))

const PageLoader = () => (
  <div className="min-h-screen bg-gray-950 flex items-center justify-center">
    <BouncingDots />
  </div>
)

const router = createBrowserRouter([
  { path: '/',        element: <Landing /> },
  { path: '/login',   element: <Login /> },
  { path: '/signup',  element: <Signup /> },
  { path: '/privacy', element: <PrivacyPolicy /> },
  { path: '/terms',   element: <TermsOfService /> },
  {
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { path: '/dashboard',          element: <Dashboard /> },
      { path: '/trades',             element: <TradeLog /> },
      { path: '/trades/new',         element: <TradeFormPage /> },
      { path: '/trades/:id',         element: <TradeDetailPage /> },
      { path: '/trades/:id/edit',    element: <TradeFormPage /> },
      { path: '/analytics',          element: <Analytics /> },
      { path: '/journal',            element: <Journal /> },
      { path: '/psychology',         element: <Psychology /> },
      { path: '/playbook',           element: <Playbook /> },
      { path: '/goals',              element: <Goals /> },
      { path: '/accounts',           element: <Accounts /> },
      { path: '/import-export',      element: <ImportExport /> },
      { path: '/settings',           element: <Settings /> },
      { path: '/calculator',         element: <Calculator /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  )
}
