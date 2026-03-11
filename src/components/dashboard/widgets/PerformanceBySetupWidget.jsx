import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { analyticsApi } from '../../../api/analytics.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  const val   = payload[0].value
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-300 font-medium mb-1 max-w-[160px] truncate">{label}</div>
      <div className={`font-mono font-semibold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {val >= 0 ? '+' : ''}${Math.abs(val).toFixed(2)}
      </div>
      <div className="text-gray-500 mt-1">{entry.trades} trades · {entry.wins}W</div>
    </div>
  )
}

export default function PerformanceBySetupWidget({ config }) {
  const { dateRange, apiParams } = useDashboard()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    analyticsApi.bySetup(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <div className="h-52 animate-pulse bg-gray-800/30 rounded-lg" />

  const display = data.slice(0, 8)

  if (!display.length) return (
    <div className="h-52 flex flex-col items-center justify-center gap-2 text-gray-600">
      <span className="text-sm">No setup data yet</span>
      <span className="text-xs">Add a "setup" to your trades to see this chart</span>
    </div>
  )

  const chartHeight = Math.max(160, display.length * 40)

  return (
    <div style={{ height: Math.max(220, chartHeight) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={display}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
          barCategoryGap="25%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`}
          />
          <YAxis
            type="category"
            dataKey="setup"
            width={90}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => v.length > 12 ? `${v.slice(0, 12)}…` : v}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <ReferenceLine x={0} stroke="#374151" />
          <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
            {display.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
