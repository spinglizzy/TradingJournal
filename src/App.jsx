import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/layout/Layout.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import TradeLog from './pages/TradeLog.jsx'
import TradeFormPage from './pages/TradeFormPage.jsx'
import TradeDetailPage from './pages/TradeDetailPage.jsx'
import Analytics from './pages/Analytics.jsx'
import Journal from './pages/Journal.jsx'
import Psychology from './pages/Psychology.jsx'
import Playbook from './pages/Playbook.jsx'
import Goals from './pages/Goals.jsx'
import Accounts from './pages/Accounts.jsx'
import ImportExport from './pages/ImportExport.jsx'
import Settings from './pages/Settings.jsx'
import Calculator from './pages/Calculator.jsx'

const router = createBrowserRouter([
  { path: '/',       element: <Landing /> },
  { path: '/login',  element: <Login /> },
  { path: '/signup', element: <Signup /> },
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
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
