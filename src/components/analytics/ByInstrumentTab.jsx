import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { analyticsApi } from '../../api/analytics.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { Section, WinRateBar, fmt, fmtPnl, fmtR } from './shared.jsx'

function TopList({ items, title, color, Icon }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-4">{i + 1}</span>
              <span className="text-sm font-medium text-white">{item.ticker}</span>
              <span className="text-xs text-gray-500">{item.trades} trades</span>
            </div>
            <span className={`text-sm font-mono font-semibold ${item.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPnl(item.pnl)}
            </span>
          </div>
        ))}
        {!items.length && <div className="text-sm text-gray-600 py-2">No data</div>}
      </div>
    </div>
  )
}

export default function ByInstrumentTab({ dateRange }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const chartRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    analyticsApi.byTicker(dateRange).then(rows => {
      setData(rows)
    }).finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return <LoadingSpinner className="h-64" />

  const withWr = data.map(r => ({
    ...r,
    win_rate: r.trades > 0 ? (r.wins / r.trades) * 100 : 0,
  }))

  const sorted = [...withWr].sort((a, b) => b.pnl - a.pnl)
  const top5    = sorted.slice(0, 5)
  const bottom5 = [...sorted].reverse().slice(0, 5)
  const chartData = sorted.slice(0, 15) // top 15 tickers by P&L

  return (
    <div className="space-y-6">
      {/* Top/bottom 5 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopList items={top5} title="Most Profitable" color="text-emerald-400" Icon={TrendingUp} />
        <TopList items={bottom5} title="Least Profitable" color="text-red-400" Icon={TrendingDown} />
      </div>

      {/* Bar chart */}
      <Section title="P&L by Ticker">
        {!chartData.length
          ? <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
          : (
            <div ref={chartRef}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="ticker" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
                    angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                    tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v <= -1000 ? `-${(Math.abs(v)/1000).toFixed(1)}k` : v}`} />
                  <Tooltip cursor={{ fill: '#1f2937' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                          <div className="text-white font-semibold mb-1">{d.ticker}</div>
                          <div className={`font-mono font-semibold ${d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtPnl(d.pnl)}
                          </div>
                          <div className="text-gray-500 text-xs mt-1">{d.trades} trades · WR {fmt(d.win_rate, 0)}%</div>
                          {d.avg_r != null && (
                            <div className="text-gray-500 text-xs">Avg R: {fmtR(d.avg_r)}</div>
                          )}
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        }
      </Section>

      {/* Full table */}
      <Section title="All Instruments">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Ticker', 'Trades', 'P&L', 'Win Rate', 'Profit Factor', 'Avg P&L', 'Avg R'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4 last:pr-0 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {withWr.map((row, i) => (
                <tr key={i} className="hover:bg-gray-800/20">
                  <td className="py-2.5 pr-4 font-medium text-white">{row.ticker}</td>
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
                <tr><td colSpan={7} className="py-10 text-center text-gray-600 text-sm">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
