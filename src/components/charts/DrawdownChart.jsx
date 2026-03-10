import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      <div className="font-mono font-semibold text-red-400">{payload[0].value.toFixed(2)}%</div>
    </div>
  )
}

export default function DrawdownChart({ data }) {
  if (!data.length) return <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>

  const formatted = data.map(d => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `${v.toFixed(0)}%`}
          width={45}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#ddGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
