import { useEffect, useState } from 'react'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

export default function TotalTradesWidget({ config }) {
  const { dateRange, apiParams } = useDashboard()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.summary(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <WidgetSkeleton />

  const closed = data?.closed_trades ?? 0
  const open   = data?.open_trades   ?? 0
  const total  = closed + open
  const closedPct = total > 0 ? (closed / total) * 100 : 0

  return (
    <div className="flex flex-col gap-3 h-full">
      <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Total Trades</span>
      <div>
        <span className="text-2xl font-bold font-mono text-white">{total}</span>
        <span className="text-sm text-gray-500 ml-2">trades</span>
      </div>
      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Closed</span>
          <span className="text-gray-300 font-mono">{closed}</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${closedPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Open</span>
          <span className="text-amber-400 font-mono">{open}</span>
        </div>
      </div>
    </div>
  )
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3 h-full animate-pulse">
      <div className="h-3 bg-gray-800 rounded w-24" />
      <div className="h-7 bg-gray-800 rounded w-16" />
      <div className="mt-auto space-y-2">
        <div className="h-3 bg-gray-800 rounded w-full" />
        <div className="h-1.5 bg-gray-800 rounded-full" />
        <div className="h-3 bg-gray-800 rounded w-full" />
      </div>
    </div>
  )
}
