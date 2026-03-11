import { useEffect, useState } from 'react'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { useTheme } from '../../../contexts/ThemeContext.jsx'

export default function ProfitFactorWidget({ config }) {
  const { apiParams } = useDashboard()
  const { activeTheme } = useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.summary(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <WidgetSkeleton />

  const pf = data?.profit_factor
  const pfNum = pf ?? 0
  // Fill bar: 0-2 range maps to 0-100%. > 2 is capped at 100%
  const fillPct = Math.min((pfNum / 2) * 100, 100)
  const color = pfNum >= 1.5 ? activeTheme.profitHex : pfNum >= 1 ? '#f59e0b' : activeTheme.lossHex

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Profit Factor</span>
        <span className="text-xs text-gray-500 font-mono">gross W / gross L</span>
      </div>
      <div>
        <span className="text-2xl font-bold font-mono" style={{ color }}>
          {pf != null ? pf.toFixed(2) : '—'}
        </span>
      </div>
      {/* gauge bar */}
      <div className="mt-auto">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>0</span><span>1</span><span>2+</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${fillPct}%`, backgroundColor: color }}
          />
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
      <div className="mt-auto h-1.5 bg-gray-800 rounded-full" />
    </div>
  )
}
