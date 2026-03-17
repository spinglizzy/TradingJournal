import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { analyticsApi } from '../../api/analytics.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { Section, WinRateBar, fmt, fmtPnl, fmtR } from './shared.jsx'

function TagBadge({ name, color }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55`, border: '1px solid' }}
    >
      {name}
    </span>
  )
}

export default function ByTagsTab({ dateRange }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const chartRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    analyticsApi.byTag(dateRange).then(rows => {
      setData(rows)
    }).finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return <LoadingSpinner className="h-64" />

  const withWr = data.map(r => ({
    ...r,
    win_rate: r.trades > 0 ? (r.wins / r.trades) * 100 : 0,
  }))

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <Section title="P&L by Tag">
        {!withWr.length
          ? <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No tagged trades</div>
          : (
            <div ref={chartRef}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={withWr} margin={{ top: 4, right: 4, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="tag" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
                    angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v <= -1000 ? `-${(Math.abs(v)/1000).toFixed(1)}k` : v}`} />
                  <Tooltip cursor={{ fill: '#1f2937' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                          <div className="mb-1">
                            <TagBadge name={d.tag} color={d.color ?? '#6366f1'} />
                          </div>
                          <div className={`font-mono font-semibold ${d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtPnl(d.pnl)}
                          </div>
                          <div className="text-gray-500 text-xs mt-1">{d.trades} trades · WR {fmt(d.win_rate, 0)}%</div>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {withWr.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? (d.color ?? '#10b981') : '#ef4444'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        }
      </Section>

      {/* Table */}
      <Section title="Tag Performance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Tag', 'Trades', 'P&L', 'Win Rate', 'Profit Factor', 'Avg P&L', 'Avg R'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4 last:pr-0 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {withWr.map((row, i) => (
                <tr key={i} className="hover:bg-gray-800/20">
                  <td className="py-2.5 pr-4">
                    <TagBadge name={row.tag} color={row.color ?? '#6366f1'} />
                  </td>
                  <td className="py-2.5 pr-4 text-gray-300">{row.trades}</td>
                  <td className={`py-2.5 pr-4 font-mono font-medium ${row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPnl(row.pnl)}
                  </td>
                  <td className="py-2.5 pr-4 w-36">
                    <WinRateBar wins={row.wins} total={row.trades} />
                  </td>
                  <td className={`py-2.5 pr-4 font-mono text-xs ${(row.profit_factor ?? 0) >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.profit_factor != null ? fmt(row.profit_factor) : '—'}
                  </td>
                  <td className={`py-2.5 pr-4 font-mono text-xs ${(row.avg_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPnl(row.avg_pnl)}
                  </td>
                  <td className={`py-2.5 font-mono text-xs ${(row.avg_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtR(row.avg_r)}
                  </td>
                </tr>
              ))}
              {!withWr.length && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-600 text-sm">No tagged trades</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
