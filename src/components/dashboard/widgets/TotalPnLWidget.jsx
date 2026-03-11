import { useEffect, useState } from 'react'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function TotalPnLWidget({ config }) {
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

  const pnl = data?.total_pnl ?? 0
  const positive = pnl >= 0
  const Icon = positive ? TrendingUp : TrendingDown

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Total P&L</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${positive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
          <Icon className={`w-4 h-4 ${positive ? 'text-emerald-400' : 'text-red-400'}`} />
        </div>
      </div>
      <div>
        <div className={`text-2xl font-bold font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? '+' : ''}{formatCurrency(pnl)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {data?.closed_trades ?? 0} closed trades
        </div>
      </div>
    </div>
  )
}

function formatCurrency(n) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3 h-full animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 bg-gray-800 rounded w-20" />
        <div className="w-8 h-8 bg-gray-800 rounded-lg" />
      </div>
      <div>
        <div className="h-7 bg-gray-800 rounded w-32 mb-2" />
        <div className="h-3 bg-gray-800 rounded w-24" />
      </div>
    </div>
  )
}
