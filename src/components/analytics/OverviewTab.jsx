import { useEffect, useState, useRef } from 'react'
import {
  ComposedChart, Area, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { statsApi } from '../../api/stats.js'
import { analyticsApi } from '../../api/analytics.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import {
  MetricCard, Section, WinRateBar, ExportButtons,
  fmt, fmtPnl, fmtPct, fmtR, fmtDuration,
  downloadCSV, downloadChartPNG
} from './shared.jsx'

function buildPnlHistogram(values) {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const bucketCount = Math.min(20, Math.ceil(values.length / 2))
  const bucketSize = range / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    label: (min + i * bucketSize).toFixed(0),
    min: min + i * bucketSize,
    max: min + (i + 1) * bucketSize,
    count: 0,
    mid: min + (i + 0.5) * bucketSize,
  }))
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1)
    if (idx >= 0) buckets[idx].count++
  }
  return buckets
}

function EquityDrawdownChart({ data, chartRef }) {
  if (!data.length) return (
    <div className="h-56 flex items-center justify-center text-gray-600 text-sm">No closed trades</div>
  )
  const formatted = data.map(d => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }))
  const finalPnl = data[data.length - 1]?.cumulative ?? 0
  const pnlColor = finalPnl >= 0 ? '#10b981' : '#ef4444'

  return (
    <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={formatted} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equityGradOv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={pnlColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="pnl" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v >= 0 ? v : `-${Math.abs(v)}`}`} width={55} />
          <YAxis yAxisId="dd" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={v => `${v.toFixed(0)}%`} width={45} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl space-y-1">
                  <div className="text-gray-400 text-xs mb-1">{label}</div>
                  {payload.map((p, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-gray-400 text-xs">{p.name}</span>
                      <span className="font-mono text-xs font-medium" style={{ color: p.color }}>
                        {p.name === 'Drawdown' ? `${p.value?.toFixed(1)}%` : `$${fmt(p.value)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          <Area yAxisId="pnl" type="monotone" dataKey="cumulative" name="Equity"
            stroke={pnlColor} strokeWidth={2} fill="url(#equityGradOv)" dot={false} />
          <Area yAxisId="dd" type="monotone" dataKey="drawdown" name="Drawdown"
            stroke="#ef4444" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} strokeDasharray="3 3" />
          <ReferenceLine yAxisId="pnl" y={0} stroke="#374151" strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function PnlHistogramChart({ data, chartRef }) {
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
  )
  const buckets = buildPnlHistogram(data)
  return (
    <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={v => `$${Number(v) >= 0 ? v : v}`} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip cursor={{ fill: '#1f2937' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const b = payload[0].payload
              return (
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                  <div className="text-gray-400 text-xs">${fmt(b.min)} to ${fmt(b.max)}</div>
                  <div className="text-white font-medium">{b.count} trades</div>
                </div>
              )
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {buckets.map((b, i) => (
              <Cell key={i} fill={b.mid >= 0 ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function RRDistChart({ data, chartRef }) {
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No R data (add stop loss)</div>
  )
  const buckets = {}
  for (let b = -3; b <= 5; b += 0.5) buckets[b.toFixed(1)] = 0
  for (const r of data) {
    const key = (Math.round(r * 2) / 2).toFixed(1)
    if (buckets[key] !== undefined) buckets[key]++
  }
  const chartData = Object.entries(buckets).map(([r, count]) => ({ r, count, val: Number(r) }))
  return (
    <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="r" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={v => `${v}R`} interval={1} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip cursor={{ fill: '#1f2937' }}
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
            {chartData.map((e, i) => <Cell key={i} fill={e.val >= 0 ? '#10b981' : '#ef4444'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MonthlyTable({ data }) {
  let running = 0
  const rows = data.map(m => {
    running += m.pnl
    const winRate = m.trades > 0 ? (m.wins / m.trades) * 100 : 0
    return { ...m, running, winRate }
  }).reverse()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {['Month', 'P&L', 'Trades', 'Win Rate', 'Running Total'].map(h => (
              <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-800/20">
              <td className="py-2.5 pr-4 font-medium text-white">{r.month}</td>
              <td className={`py-2.5 pr-4 font-mono font-medium ${r.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnl(r.pnl)}
              </td>
              <td className="py-2.5 pr-4 text-gray-300">{r.trades}</td>
              <td className="py-2.5 pr-4 w-32">
                <WinRateBar wins={r.wins} total={r.trades} />
              </td>
              <td className={`py-2.5 font-mono font-medium ${r.running >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnl(r.running)}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={5} className="py-10 text-center text-gray-600 text-sm">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function OverviewTab({ dateRange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const equityRef = useRef(null)
  const pnlRef    = useRef(null)
  const rrRef     = useRef(null)

  useEffect(() => {
    setLoading(true)
    const r = dateRange
    Promise.all([
      statsApi.summary(r),
      analyticsApi.drawdown(r),
      statsApi.streaks(r),
      analyticsApi.rrDist(r),
      analyticsApi.pnlDist(r),
      statsApi.monthly(r),
      analyticsApi.holdTime(r),
    ]).then(([summary, drawdown, streaks, rr, pnlDist, monthly, holdTime]) => {
      // Compute derived values
      const maxDrawdown = drawdown.length ? Math.min(...drawdown.map(d => d.drawdown)) : 0
      const totalHoldCount = holdTime.reduce((s, r) => s + r.count, 0)
      const totalHoldMins  = holdTime.reduce((s, r) => s + r.minutes * r.count, 0)
      const avgHoldTime = totalHoldCount > 0 ? totalHoldMins / totalHoldCount : null

      setData({ summary, drawdown, streaks, rr, pnlDist, monthly, maxDrawdown, avgHoldTime })
    }).finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return <LoadingSpinner className="h-64" />
  if (!data) return null

  const { summary, drawdown, streaks, rr, pnlDist, monthly, maxDrawdown, avgHoldTime } = data
  const wr = summary.win_rate ?? 0

  const metrics = [
    { label: 'Total P&L',      value: fmtPnl(summary.total_pnl), color: summary.total_pnl >= 0 ? 'green' : 'red' },
    { label: 'Win Rate',       value: `${fmt(wr, 1)}%`, color: wr >= 50 ? 'green' : 'red', sub: `${summary.wins}W / ${summary.losses}L` },
    { label: 'Profit Factor',  value: summary.profit_factor != null ? fmt(summary.profit_factor) : '—', color: (summary.profit_factor ?? 0) >= 1 ? 'green' : 'red' },
    { label: 'Expectancy',     value: fmtPnl(summary.expectancy), color: (summary.expectancy ?? 0) >= 0 ? 'green' : 'red' },
    { label: 'Avg Winner',     value: fmtPnl(summary.avg_win), color: 'green' },
    { label: 'Avg Loser',      value: fmtPnl(summary.avg_loss), color: 'red' },
    { label: 'Largest Win',    value: fmtPnl(summary.best_pnl),  color: 'green', sub: summary.best_trade ? `${summary.best_trade.ticker} on ${summary.best_trade.date}` : null },
    { label: 'Largest Loss',   value: fmtPnl(summary.worst_pnl), color: 'red',   sub: summary.worst_trade ? `${summary.worst_trade.ticker} on ${summary.worst_trade.date}` : null },
    { label: 'Max Drawdown',   value: maxDrawdown ? `${fmt(maxDrawdown, 1)}%` : '—', color: 'red' },
    { label: 'Avg Hold Time',  value: fmtDuration(avgHoldTime) },
    { label: 'Best Streak',    value: streaks.longest_win > 0 ? `${streaks.longest_win}W` : '—', color: 'green' },
    { label: 'Worst Streak',   value: streaks.longest_loss > 0 ? `${streaks.longest_loss}L` : '—', color: 'red' },
  ]

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {metrics.map(m => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Equity curve + drawdown */}
      <Section
        title="Equity Curve & Drawdown"
        actions={
          <ExportButtons
            onPNG={() => downloadChartPNG(equityRef, 'equity-curve.png')}
            onCSV={() => downloadCSV(drawdown, 'equity-curve.csv')}
          />
        }
      >
        <EquityDrawdownChart data={drawdown} chartRef={equityRef} />
      </Section>

      {/* Distribution charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section
          title="P&L Distribution"
          actions={<ExportButtons onPNG={() => downloadChartPNG(pnlRef, 'pnl-dist.png')} />}
        >
          <PnlHistogramChart data={pnlDist} chartRef={pnlRef} />
        </Section>
        <Section
          title="R-Multiple Distribution"
          actions={<ExportButtons onPNG={() => downloadChartPNG(rrRef, 'rr-dist.png')} />}
        >
          <RRDistChart data={rr} chartRef={rrRef} />
        </Section>
      </div>

      {/* Monthly table */}
      <Section
        title="Monthly Performance"
        actions={<ExportButtons onCSV={() => downloadCSV(monthly, 'monthly.csv')} />}
      >
        <MonthlyTable data={monthly} />
      </Section>
    </div>
  )
}
