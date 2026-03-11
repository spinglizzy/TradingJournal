import { useEffect, useState } from 'react'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

export default function CurrentStreakWidget({ config }) {
  const { dateRange, apiParams } = useDashboard()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.streaks(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <WidgetSkeleton />

  const current     = data?.current      ?? 0
  const longestWin  = data?.longest_win  ?? 0
  const longestLoss = data?.longest_loss ?? 0

  const isWin  = current > 0
  const isLoss = current < 0
  const color  = isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-gray-400'
  const bg     = isWin ? 'bg-emerald-500/10 border-emerald-500/20' : isLoss ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/50 border-gray-700'
  const label  = isWin ? '🔥 Winning' : isLoss ? '❄️ Losing' : 'Flat'

  return (
    <div className="flex flex-col gap-3 h-full">
      <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Current Streak</span>
      <div className={`flex-1 rounded-xl border ${bg} flex items-center justify-center flex-col gap-1`}>
        <div className={`text-4xl font-bold font-mono ${color}`}>
          {current > 0 ? `+${current}` : current}
        </div>
        <div className={`text-xs font-medium ${color}`}>{label}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <div className="text-gray-500">Best win run</div>
          <div className="text-emerald-400 font-mono font-bold text-base">{longestWin}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <div className="text-gray-500">Worst loss run</div>
          <div className="text-red-400 font-mono font-bold text-base">{longestLoss}</div>
        </div>
      </div>
    </div>
  )
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3 h-full animate-pulse">
      <div className="h-3 bg-gray-800 rounded w-28" />
      <div className="flex-1 bg-gray-800 rounded-xl" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 bg-gray-800 rounded-lg" />
        <div className="h-12 bg-gray-800 rounded-lg" />
      </div>
    </div>
  )
}
