import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { goalsApi } from '../../../api/goals.js'

function ProgressBar({ value, met }) {
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${met ? 'bg-emerald-500' : 'bg-indigo-500'}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function fmtVal(metric, v) {
  if (v == null) return '—'
  if (metric === 'pnl' || metric === 'max_daily_loss') return `$${v.toFixed(0)}`
  if (metric === 'win_rate' || metric === 'discipline_score') return `${v.toFixed(0)}%`
  return `${Math.round(v)}`
}

export default function GoalsWidget({ config }) {
  const [goals, setGoals] = useState([])
  const [streaks, setStreaks] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([goalsApi.list(), goalsApi.streaks()])
      .then(([g, s]) => { setGoals(g.filter(x => x.active)); setStreaks(s) })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading…</div>
  if (error)   return <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>

  const met = goals.filter(g => g.is_met).length
  const total = goals.length

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
        <span className="text-3xl">🎯</span>
        <p className="text-gray-500 text-sm">No active goals</p>
        <Link to="/goals" className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
          Set a goal →
        </Link>
      </div>
    )
  }

  const topGoals = goals.slice(0, 4)

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white">{met}</span>
          <span className="text-gray-500 text-sm">/ {total} goals met</span>
        </div>
        {streaks && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              🔥 <span className="text-emerald-400 font-medium">{streaks.green_days.current}d</span>
            </span>
            <span className="flex items-center gap-1">
              📖 <span className="text-indigo-400 font-medium">{streaks.journal.current}d</span>
            </span>
          </div>
        )}
      </div>

      {/* Goal list */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-hidden">
        {topGoals.map(g => (
          <div key={g.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 truncate flex-1 mr-2">{g.name}</span>
              <span className={`text-xs font-medium shrink-0 ${g.is_met ? 'text-emerald-400' : 'text-gray-500'}`}>
                {fmtVal(g.metric, g.current_value)} {g.is_met ? '✓' : `/ ${fmtVal(g.metric, g.target_value)}`}
              </span>
            </div>
            <ProgressBar value={g.progress} met={g.is_met} />
          </div>
        ))}
        {goals.length > 4 && (
          <p className="text-xs text-gray-600 text-center">+{goals.length - 4} more goals</p>
        )}
      </div>

      <Link
        to="/goals"
        className="text-xs text-indigo-400 hover:text-indigo-300 text-center transition-colors pt-1 border-t border-gray-800"
      >
        View all goals →
      </Link>
    </div>
  )
}
