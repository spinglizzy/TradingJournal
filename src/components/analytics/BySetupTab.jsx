import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { analyticsApi } from '../../api/analytics.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { Section, WinRateBar, fmt, fmtPnl, fmtR } from './shared.jsx'

function SmtComparisonPanel({ dateRange }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    analyticsApi.bySmt(dateRange).then(setData).finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return <LoadingSpinner className="h-24" />
  if (!data.length) return (
    <div className="py-8 text-center text-gray-600 text-sm">
      No trades with SMT Divergence recorded yet. Add Yes/No on trade entry.
    </div>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {data.map(row => (
        <div key={row.label} className={`rounded-xl border p-4 ${
          row.smt_divergence
            ? 'border-violet-500/30 bg-violet-500/5'
            : 'border-gray-700 bg-gray-800/40'
        }`}>
          <div className={`text-sm font-semibold mb-3 ${row.smt_divergence ? 'text-violet-400' : 'text-gray-400'}`}>
            {row.label}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Trades</div>
              <div className="font-mono font-semibold text-white">{row.trades}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Win Rate</div>
              <div className={`font-mono font-semibold ${row.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(row.win_rate, 1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Total P&L</div>
              <div className={`font-mono font-semibold ${row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnl(row.pnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Avg P&L</div>
              <div className={`font-mono font-semibold ${(row.avg_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnl(row.avg_pnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Avg R</div>
              <div className={`font-mono font-semibold ${(row.avg_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtR(row.avg_r)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Profit Factor</div>
              <div className={`font-mono font-semibold ${(row.profit_factor ?? 0) >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.profit_factor != null ? fmt(row.profit_factor) : '—'}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <WinRateBar wins={Number(row.wins)} total={Number(row.trades)} />
          </div>
        </div>
      ))}
    </div>
  )
}

const COLUMNS = [
  { key: 'setup',         label: 'Setup' },
  { key: 'trades',        label: 'Trades' },
  { key: 'pnl',          label: 'P&L' },
  { key: 'win_rate',      label: 'Win Rate' },
  { key: 'profit_factor', label: 'Prof. Factor' },
  { key: 'avg_pnl',      label: 'Avg P&L' },
  { key: 'avg_r',        label: 'Avg R' },
]

function SetupExpandedRow({ row }) {
  const wr = row.trades > 0 ? (row.wins / row.trades) * 100 : 0
  const expectancy = row.trades > 0
    ? (wr / 100 * (row.avg_pnl ?? 0)) + ((1 - wr / 100) * (row.avg_pnl ?? 0))
    : 0

  return (
    <div className="mx-0 mt-1 mb-2 px-4 py-3 bg-gray-800/50 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      <div>
        <div className="text-xs text-gray-500 mb-0.5">Win Rate</div>
        <div className={`font-mono font-semibold ${wr >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmt(wr, 1)}%
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">Profit Factor</div>
        <div className={`font-mono font-semibold ${(row.profit_factor ?? 0) >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
          {row.profit_factor != null ? fmt(row.profit_factor) : '—'}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">Avg P&L</div>
        <div className={`font-mono font-semibold ${(row.avg_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtPnl(row.avg_pnl)}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">Avg R</div>
        <div className={`font-mono font-semibold ${(row.avg_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtR(row.avg_r)}
        </div>
      </div>
    </div>
  )
}

export default function BySetupTab({ dateRange }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [chartMetric, setChartMetric] = useState('pnl')
  const chartRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    analyticsApi.bySetup(dateRange).then(rows => {
      setData(rows)
      setExpanded(null)
    }).finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return <LoadingSpinner className="h-64" />

  const withWr = data.map(r => ({
    ...r,
    win_rate: r.trades > 0 ? (r.wins / r.trades) * 100 : 0,
  }))

  const chartData = withWr.slice(0, 12) // top 12 for readability

  const metricOptions = [
    { value: 'pnl', label: 'Total P&L' },
    { value: 'win_rate', label: 'Win Rate' },
    { value: 'profit_factor', label: 'Profit Factor' },
    { value: 'avg_r', label: 'Avg R' },
    { value: 'trades', label: 'Trade Count' },
  ]

  return (
    <div className="space-y-6">
      {/* Bar chart comparison */}
      <Section
        title="Setup Comparison"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={chartMetric}
              onChange={e => setChartMetric(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none focus:border-indigo-500"
            >
              {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        }
      >
        {!chartData.length
          ? <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
          : (
            <div ref={chartRef}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="setup" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
                    angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip cursor={{ fill: '#1f2937' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                          <div className="text-gray-300 font-medium mb-1">{d.setup}</div>
                          <div className={`font-mono ${(d[chartMetric] ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {chartMetric === 'pnl' ? fmtPnl(d[chartMetric])
                              : chartMetric === 'win_rate' ? `${fmt(d[chartMetric], 1)}%`
                              : chartMetric === 'avg_r' ? fmtR(d[chartMetric])
                              : fmt(d[chartMetric])}
                          </div>
                          <div className="text-gray-500 text-xs">{d.trades} trades</div>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Bar dataKey={chartMetric} radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={(d[chartMetric] ?? 0) >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        }
      </Section>

      {/* SMT Divergence comparison */}
      <Section title="SMT Divergence — Performance Comparison">
        <SmtComparisonPanel dateRange={dateRange} />
      </Section>

      {/* Table */}
      <Section title="Setup Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {COLUMNS.map(c => (
                  <th key={c.key} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4 last:pr-0 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {withWr.map((row, i) => (
                <>
                  <tr
                    key={i}
                    className="cursor-pointer hover:bg-gray-800/40 transition-colors"
                    onClick={() => setExpanded(expanded === i ? null : i)}
                  >
                    <td className="py-2.5 pr-4 font-medium text-white">{row.setup}</td>
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
                    <td className={`py-2.5 pr-4 font-mono text-xs ${(row.avg_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtR(row.avg_r)}
                    </td>
                    <td className="py-2.5 text-gray-500">
                      {expanded === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </td>
                  </tr>
                  {expanded === i && (
                    <tr key={`${i}-exp`}>
                      <td colSpan={COLUMNS.length + 1} className="pb-2 pt-0">
                        <SetupExpandedRow row={row} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {!withWr.length && (
                <tr><td colSpan={COLUMNS.length + 1} className="py-10 text-center text-gray-600 text-sm">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
