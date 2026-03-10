import { useEffect, useState } from 'react'
import { analyticsApi } from '../api/analytics.js'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import WeekdayChart from '../components/charts/WeekdayChart.jsx'
import DrawdownChart from '../components/charts/DrawdownChart.jsx'
import RRDistChart from '../components/charts/RRDistChart.jsx'

function fmt(n, d = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function PerfTable({ data, keyCol, keyLabel }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {[keyLabel, 'Trades', 'P&L', 'Wins', 'Avg P&L', 'Avg R'].map(h => (
              <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4 last:pr-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-800/30 transition-colors">
              <td className="py-2.5 pr-4 font-medium text-white">{row[keyCol]}</td>
              <td className="py-2.5 pr-4 text-gray-300">{row.trades}</td>
              <td className={`py-2.5 pr-4 font-mono font-medium ${row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.pnl >= 0 ? '+' : ''}${fmt(row.pnl)}
              </td>
              <td className="py-2.5 pr-4 text-gray-300">{row.wins ?? '—'}</td>
              <td className={`py-2.5 pr-4 font-mono text-xs ${(row.avg_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.avg_pnl != null ? `${row.avg_pnl >= 0 ? '+' : ''}$${fmt(row.avg_pnl)}` : '—'}
              </td>
              <td className={`py-2.5 font-mono text-xs ${(row.avg_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.avg_r != null ? `${fmt(row.avg_r)}R` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Analytics() {
  const [weekday, setWeekday]     = useState([])
  const [strategy, setStrategy]   = useState([])
  const [ticker, setTicker]       = useState([])
  const [rr, setRr]               = useState([])
  const [drawdown, setDrawdown]   = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      analyticsApi.byWeekday(),
      analyticsApi.byStrategy(),
      analyticsApi.byTicker(),
      analyticsApi.rrDist(),
      analyticsApi.drawdown(),
    ]).then(([w, s, t, r, d]) => {
      setWeekday(w)
      setStrategy(s)
      setTicker(t)
      setRr(r)
      setDrawdown(d)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner className="h-96" />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Deep dive into your trading performance</p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">P&L by Day of Week</h2>
          <WeekdayChart data={weekday} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">R:R Distribution</h2>
          <RRDistChart data={rr} />
        </div>
      </div>

      {/* Drawdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Drawdown</h2>
        <DrawdownChart data={drawdown} />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">By Strategy</h2>
          <PerfTable data={strategy} keyCol="strategy" keyLabel="Strategy" />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">By Ticker</h2>
          <PerfTable data={ticker} keyCol="ticker" keyLabel="Ticker" />
        </div>
      </div>
    </div>
  )
}
