import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tradesApi } from '../../../api/trades.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { useFlushNavigate } from '../../../hooks/useFlushNavigate.js'

export default function RecentTradesWidget({ config }) {
  const { apiParams } = useDashboard()
  const navigate = useFlushNavigate()
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    tradesApi.list({
      status:     'closed',
      sort_by:    'date',
      sort_dir:   'desc',
      limit:      10,
      ...(apiParams.from ? { start_date: apiParams.from } : {}),
      ...(apiParams.to   ? { end_date:   apiParams.to   } : {}),
      ...(apiParams.account_id ? { account_id: apiParams.account_id } : {}),
    })
      .then(d => setTrades(d.data ?? []))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Recent Trades</span>
        <Link to="/trades" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-800/50 rounded animate-pulse" />
          ))}
        </div>
      ) : !trades.length ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          No closed trades yet
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="pb-2 text-left font-medium">Date</th>
                <th className="pb-2 text-left font-medium">Ticker</th>
                <th className="pb-2 text-left font-medium">Side</th>
                <th className="pb-2 text-right font-medium">P&L</th>
                <th className="pb-2 text-right font-medium">R</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {trades.map(t => (
                <tr key={t.id} className="hover:bg-gray-800/30 transition-colors group cursor-pointer" onClick={() => navigate(`/trades/${t.id}/edit`)}>
                  <td className="py-2 text-gray-400">{t.date}</td>
                  <td className="py-2">
                    <span className="text-gray-200 font-medium group-hover:text-indigo-400 transition-colors">
                      {t.ticker}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.direction === 'long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {t.direction}
                    </span>
                  </td>
                  <td className={`py-2 text-right font-mono font-medium ${(t.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(t.pnl ?? 0) >= 0 ? '+' : ''}${Math.abs(t.pnl ?? 0).toFixed(2)}
                  </td>
                  <td className={`py-2 text-right font-mono ${t.r_multiple == null ? 'text-gray-600' : (t.r_multiple >= 0 ? 'text-gray-300' : 'text-gray-400')}`}>
                    {t.r_multiple != null ? `${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple.toFixed(2)}R` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
