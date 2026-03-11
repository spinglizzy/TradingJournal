import { useEffect, useState } from 'react'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

export default function ExpectancyWidget({ config }) {
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

  const exp = data?.expectancy ?? 0
  const positive = exp >= 0

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Expectancy</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {positive ? 'Edge' : 'No edge'}
        </span>
      </div>
      <div>
        <div className={`text-2xl font-bold font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? '+' : ''}${exp.toFixed(2)}
        </div>
        <div className="text-xs text-gray-500 mt-1">per trade on avg</div>
      </div>
      {data && (
        <div className="mt-auto grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">Avg Win</div>
            <div className="text-emerald-400 font-mono font-medium">+${(data.avg_win ?? 0).toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">Avg Loss</div>
            <div className="text-red-400 font-mono font-medium">${(data.avg_loss ?? 0).toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3 h-full animate-pulse">
      <div className="flex justify-between">
        <div className="h-3 bg-gray-800 rounded w-20" />
        <div className="h-4 bg-gray-800 rounded w-14" />
      </div>
      <div className="h-7 bg-gray-800 rounded w-28" />
      <div className="mt-auto grid grid-cols-2 gap-2">
        <div className="h-12 bg-gray-800 rounded-lg" />
        <div className="h-12 bg-gray-800 rounded-lg" />
      </div>
    </div>
  )
}
