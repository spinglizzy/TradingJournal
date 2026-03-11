import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index                   element={<Dashboard />} />
          <Route path="trades"           element={<TradeLog />} />
          <Route path="trades/new"       element={<TradeFormPage />} />
          <Route path="trades/:id"       element={<TradeDetailPage />} />
          <Route path="trades/:id/edit"  element={<TradeFormPage />} />
          <Route path="analytics"        element={<Analytics />} />
          <Route path="journal"          element={<Journal />} />
          <Route path="psychology"       element={<Psychology />} />
          <Route path="playbook"         element={<Playbook />} />
          <Route path="goals"            element={<Goals />} />
          <Route path="accounts"         element={<Accounts />} />
          <Route path="import-export"    element={<ImportExport />} />
          <Route path="settings"         element={<Settings />} />
          <Route path="calculator"       element={<Calculator />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
