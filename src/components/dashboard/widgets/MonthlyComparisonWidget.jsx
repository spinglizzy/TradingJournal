import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { format, parseISO, endOfMonth } from 'date-fns'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { useTheme } from '../../../contexts/ThemeContext.jsx'
import { useFlushNavigate } from '../../../hooks/useFlushNavigate.js'

function CustomTooltip({ active, payload, label, profitColor, lossColor }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  const entry = payload[0].payload
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-300 font-medium mb-1">{label}</div>
      <div className="font-mono font-semibold" style={{ color: val >= 0 ? profitColor : lossColor }}>
        {val >= 0 ? '+' : ''}${Math.abs(val).toFixed(2)}
      </div>
      <div className="text-gray-500 mt-1">{entry.wins}W / {entry.losses}L ({entry.trades} trades)</div>
      <div className="text-gray-600 mt-0.5">Click to view trades</div>
    </div>
  )
}

export default function MonthlyComparisonWidget({ config }) {
  const { apiParams } = useDashboard()
  const { activeTheme } = useTheme()
  const navigate = useFlushNavigate()
  const profitColor = activeTheme.profitHex
  const lossColor   = activeTheme.lossHex
  const accentColor = activeTheme.accent
  const [monthlyData, setMonthlyData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.monthly(apiParams)
      .then(d => setMonthlyData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <div className="h-52 animate-pulse bg-gray-800/30 rounded-lg" />
  if (!monthlyData.length) return <div className="h-52 flex items-center justify-center text-gray-600 text-sm">No monthly data yet</div>

  const data = monthlyData.slice(-12).map(d => ({
    ...d,
    label: (() => {
      try { return format(parseISO(`${d.month}-01`), 'MMM yy') } catch { return d.month }
    })(),
  }))

  const avg = data.reduce((s, d) => s + d.pnl, 0) / (data.length || 1)

  function handleBarClick(entry) {
    const monthStart = `${entry.month}-01`
    const monthEnd   = format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd')
    navigate(`/trades?from=${monthStart}&to=${monthEnd}`)
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : Math.abs(v).toFixed(0)}`}
          width={52}
        />
        <Tooltip content={<CustomTooltip profitColor={profitColor} lossColor={lossColor} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <ReferenceLine
          y={avg}
          stroke={accentColor}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: 'avg', fill: activeTheme.accentLight, fontSize: 10, position: 'insideTopRight' }}
        />
        <ReferenceLine y={0} stroke="#374151" />
        <Bar dataKey="pnl" name="Monthly P&L" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleBarClick}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? profitColor : lossColor} opacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
