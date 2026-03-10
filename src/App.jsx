import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import TradeLog from './pages/TradeLog.jsx'
import TradeFormPage from './pages/TradeFormPage.jsx'
import Analytics from './pages/Analytics.jsx'
import Journal from './pages/Journal.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index                   element={<Dashboard />} />
          <Route path="trades"           element={<TradeLog />} />
          <Route path="trades/new"       element={<TradeFormPage />} />
          <Route path="trades/:id/edit"  element={<TradeFormPage />} />
          <Route path="analytics"        element={<Analytics />} />
          <Route path="journal"          element={<Journal />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
