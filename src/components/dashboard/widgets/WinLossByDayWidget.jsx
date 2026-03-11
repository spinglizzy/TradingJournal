import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine,
} from 'recharts'
import { analyticsApi } from '../../../api/analytics.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const entry = payload[0]?.payload
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-300 font-medium mb-1">{label}</div>
      <div className={`font-mono font-semibold ${entry?.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {entry?.pnl >= 0 ? '+' : ''}${Math.abs(entry?.pnl ?? 0).toFixed(2)}
      </div>
      <div className="text-gray-500 mt-1">{entry?.trades} trades · {entry?.wins}W / {entry?.losses}L</div>
    </div>
  )
}

export default function WinLossByDayWidget({ config }) {
  const { dateRange, apiParams } = useDashboard()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    analyticsApi.byWeekday(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <div className="h-52 animate-pulse bg-gray-800/30 rounded-lg" />
  if (!data.length) return <div className="h-52 flex items-center justify-center text-gray-600 text-sm">No data yet</div>

  // Ensure all weekdays are present
  const allDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }
  const dataMap = Object.fromEntries(data.map(d => [d.day, d]))
  const display = allDays.map(d => dataMap[d] ?? { day: d, dow: dow[d], trades: 0, pnl: 0, wins: 0, losses: 0 })

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={display} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : Math.abs(v).toFixed(0)}`}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <ReferenceLine y={0} stroke="#374151" />
        <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
          {display.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} opacity={entry.trades > 0 ? 0.85 : 0.25} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
