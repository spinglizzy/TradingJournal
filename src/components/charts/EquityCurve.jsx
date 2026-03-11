import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'
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
    </div>
  )
}

export default function EquityCurve({ data }) {
  const { activeTheme } = useTheme()
  const profitColor = activeTheme.profitHex
  const lossColor   = activeTheme.lossHex

  if (!data.length) return <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>

  const final = data[data.length - 1]?.cumulative ?? 0
  const color = final >= 0 ? profitColor : lossColor
  const gradId = `equityGrad-${color.replace('#','')}`

  const formatted = data.map(d => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
          width={55}
        />
        <Tooltip content={<CustomTooltip profitColor={profitColor} lossColor={lossColor} />} />
        <Area type="monotone" dataKey="cumulative" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
