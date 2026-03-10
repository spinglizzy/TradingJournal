import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'

export default function RRDistChart({ data }) {
  if (!data.length) return <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No R data (add stop loss to trades)</div>

  // Bucket into 0.5R increments from -3 to +5
  const buckets = {}
  for (let b = -3; b <= 5; b += 0.5) {
    buckets[b.toFixed(1)] = 0
  }
  for (const r of data) {
    const key = (Math.round(r * 2) / 2).toFixed(1)
    if (buckets[key] !== undefined) buckets[key]++
  }

  const chartData = Object.entries(buckets).map(([r, count]) => ({ r, count, val: Number(r) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="r" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => `${v}R`} interval={1} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip
          cursor={{ fill: '#1f2937' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                <div className="text-white font-mono">{payload[0].payload.r}R</div>
                <div className="text-gray-400">{payload[0].value} trades</div>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.val >= 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
