import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tradesApi } from '../../../api/trades.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

export default function OpenTradesWidget({ config }) {
  const { apiParams } = useDashboard()
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  // Open trades don't respect date filter — show all open positions for account
  useEffect(() => {
    setLoading(true)
    tradesApi.list({
      status: 'open', sort_by: 'date', sort_dir: 'desc', limit: 50,
      ...(apiParams.account_id ? { account_id: apiParams.account_id } : {}),
    })
      .then(d => setTrades(d.data ?? []))
      .finally(() => setLoading(false))
  }, [apiParams.account_id])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Open / Planned Trades</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          trades.length > 0
            ? 'bg-amber-500/10 text-amber-400'
            : 'bg-gray-800 text-gray-500'
        }`}>
          {loading ? '…' : `${trades.length} open`}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-800/50 rounded animate-pulse" />
          ))}
        </div>
      ) : !trades.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-600">
          <span className="text-sm">No open positions</span>
          <Link to="/trades/new" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            + Log a trade
          </Link>
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="pb-2 text-left font-medium">Date</th>
                <th className="pb-2 text-left font-medium">Ticker</th>
                <th className="pb-2 text-left font-medium">Side</th>
                <th className="pb-2 text-right font-medium">Entry</th>
                <th className="pb-2 text-right font-medium">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {trades.map(t => (
                <tr key={t.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="py-2 text-gray-400">{t.date}</td>
                  <td className="py-2">
                    <Link to={`/trades/${t.id}`} className="text-gray-200 font-medium hover:text-indigo-400 transition-colors">
                      {t.ticker}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.direction === 'long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-gray-300">
                    ${(t.entry_price ?? 0).toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-mono text-gray-400">
                    {t.position_size?.toLocaleString()}
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
