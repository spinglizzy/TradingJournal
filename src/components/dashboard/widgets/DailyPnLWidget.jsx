import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { format, parseISO } from 'date-fns'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { useTheme } from '../../../contexts/ThemeContext.jsx'

function CustomTooltip({ active, payload, label, profitColor, lossColor }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      <div className="font-mono font-semibold" style={{ color: val >= 0 ? profitColor : lossColor }}>
        {val >= 0 ? '+' : ''}${Math.abs(val).toFixed(2)}
      </div>
    </div>
  )
}

export default function DailyPnLWidget({ config }) {
  const { apiParams } = useDashboard()
  const { activeTheme } = useTheme()
  const profitColor = activeTheme.profitHex
  const lossColor   = activeTheme.lossHex
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.equityCurve(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <div className="h-52 animate-pulse bg-gray-800/30 rounded-lg" />
  if (!data.length) return <div className="h-52 flex items-center justify-center text-gray-600 text-sm">No trade data yet</div>

  const formatted = data.map(d => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : Math.abs(v).toFixed(0)}`}
          width={52}
        />
        <Tooltip content={<CustomTooltip profitColor={profitColor} lossColor={lossColor} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <ReferenceLine y={0} stroke="#374151" />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
          {formatted.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? profitColor : lossColor} opacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
