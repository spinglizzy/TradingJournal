import { useEffect, useState } from 'react'
import { statsApi } from '../api/stats.js'
import StatCard from '../components/ui/StatCard.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import EquityCurve from '../components/charts/EquityCurve.jsx'
import MonthlyPnL from '../components/charts/MonthlyPnL.jsx'

function fmt(n, decimals = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function Dashboard() {
  const [summary, setSummary]   = useState(null)
  const [equity, setEquity]     = useState([])
  const [monthly, setMonthly]   = useState([])
  const [streaks, setStreaks]    = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    Promise.all([
      statsApi.summary(),
      statsApi.equityCurve(),
      statsApi.monthly(),
      statsApi.streaks(),
    ])
      .then(([s, e, m, st]) => {
        setSummary(s)
        setEquity(e)
        setMonthly(m)
        setStreaks(st)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-400 text-sm">{error}</div>
  )

  const pnlPositive = summary?.total_pnl >= 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Your trading performance at a glance</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="Total P&L"
          value={summary ? `${pnlPositive ? '+' : ''}$${fmt(summary.total_pnl)}` : null}
          sub={`${summary?.closed_trades ?? 0} closed trades`}
          positive={pnlPositive}
          negative={!pnlPositive}
          loading={loading}
        />
        <StatCard
          title="Win Rate"
          value={summary ? `${fmt(summary.win_rate, 1)}%` : null}
          sub={`${summary?.wins ?? 0}W / ${summary?.losses ?? 0}L`}
          loading={loading}
        />
        <StatCard
          title="Avg Win"
          value={summary ? `$${fmt(summary.avg_win)}` : null}
          sub="per winning trade"
          positive={true}
          loading={loading}
        />
        <StatCard
          title="Avg Loss"
          value={summary ? `$${fmt(Math.abs(summary.avg_loss))}` : null}
          sub="per losing trade"
          negative={true}
          loading={loading}
        />
        <StatCard
          title="Profit Factor"
          value={summary?.profit_factor ? fmt(summary.profit_factor) : null}
          sub={summary?.open_trades ? `${summary.open_trades} open` : 'gross profit / gross loss'}
          positive={summary?.profit_factor >= 1}
          loading={loading}
        />
      </div>

      {/* Streak banner */}
      {streaks && (
        <div className="flex gap-4">
          <div className={`flex-1 rounded-xl border px-5 py-4 flex items-center gap-3
            ${streaks.current > 0
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : streaks.current < 0
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-gray-800 bg-gray-900'}`}>
            <div className="text-3xl font-bold font-mono text-white">
              {streaks.current > 0 ? `+${streaks.current}` : streaks.current}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-300">Current Streak</div>
              <div className="text-xs text-gray-500">
                {streaks.current > 0 ? 'Winning' : streaks.current < 0 ? 'Losing' : 'Flat'}
              </div>
            </div>
          </div>
          <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 flex items-center gap-3">
            <div className="text-3xl font-bold font-mono text-emerald-400">{streaks.longest_win}</div>
            <div>
              <div className="text-sm font-medium text-gray-300">Best Win Streak</div>
              <div className="text-xs text-gray-500">consecutive wins</div>
            </div>
          </div>
          <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 flex items-center gap-3">
            <div className="text-3xl font-bold font-mono text-red-400">{streaks.longest_loss}</div>
            <div>
              <div className="text-sm font-medium text-gray-300">Worst Loss Streak</div>
              <div className="text-xs text-gray-500">consecutive losses</div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Equity Curve</h2>
          {loading ? <LoadingSpinner className="h-48" /> : <EquityCurve data={equity} />}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Monthly P&L</h2>
          {loading ? <LoadingSpinner className="h-48" /> : <MonthlyPnL data={monthly} />}
        </div>
      </div>
    </div>
  )
}
