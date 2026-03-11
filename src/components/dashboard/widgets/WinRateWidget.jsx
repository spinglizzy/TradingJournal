import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { useTheme } from '../../../contexts/ThemeContext.jsx'

export default function WinRateWidget({ config }) {
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

  const winRate  = data?.win_rate ?? 0
  const chartData = [
    { name: 'Wins',   value: data?.wins   ?? 0 },
    { name: 'Losses', value: data?.losses ?? 0 },
  ]

  return (
    <div className="flex items-center gap-4 h-full">
      <div className="w-16 h-16 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%" cy="50%"
              innerRadius="55%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={activeTheme.profitHex} />
              <Cell fill="#374151" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Win Rate</span>
        <span className="text-2xl font-bold font-mono text-white">{winRate.toFixed(1)}%</span>
        <span className="text-xs text-gray-500">
          {data?.wins ?? 0}W / {data?.losses ?? 0}L
        </span>
      </div>
    </div>
  )
}

function WidgetSkeleton() {
  return (
    <div className="flex items-center gap-4 h-full animate-pulse">
      <div className="w-16 h-16 rounded-full bg-gray-800 flex-shrink-0" />
      <div className="flex flex-col gap-2">
        <div className="h-3 bg-gray-800 rounded w-16" />
        <div className="h-7 bg-gray-800 rounded w-20" />
        <div className="h-3 bg-gray-800 rounded w-16" />
      </div>
    </div>
  )
}
