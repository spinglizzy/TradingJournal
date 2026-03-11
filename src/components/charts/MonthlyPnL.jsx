import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { useTheme } from '../../contexts/ThemeContext.jsx'

function CustomTooltip({ active, payload, label, profitColor, lossColor }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      <div className="font-mono font-semibold" style={{ color: val >= 0 ? profitColor : lossColor }}>
        {val >= 0 ? '+' : ''}${val.toFixed(2)}
      </div>
      <div className="text-gray-500 text-xs">{payload[0]?.payload?.trades} trades</div>
    </div>
  )
}

export default function MonthlyPnL({ data }) {
  const { activeTheme } = useTheme()
  const profitColor = activeTheme.profitHex
  const lossColor   = activeTheme.lossHex

  if (!data.length) return <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>

  const formatted = data.map(d => ({ ...d, label: d.month.slice(0, 7) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
          width={55}
        />
        <Tooltip content={<CustomTooltip profitColor={profitColor} lossColor={lossColor} />} cursor={{ fill: '#1f2937' }} />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
          {formatted.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? profitColor : lossColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
