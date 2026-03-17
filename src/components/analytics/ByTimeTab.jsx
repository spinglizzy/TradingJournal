import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { statsApi } from '../../api/stats.js'
import { analyticsApi } from '../../api/analytics.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { Section, fmt, fmtPnl } from './shared.jsx'

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 0 }
const GRID_PROPS   = { strokeDasharray: '3 3', stroke: '#1f2937', vertical: false }
const AXIS_PROPS   = { fill: '#6b7280', fontSize: 11 }

function PnlBarChart({ data, xKey, xLabel = xKey, chartRef }) {
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
  )
  return (
    <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey={xLabel} tick={{ ...AXIS_PROPS }} axisLine={false} tickLine={false} />
          <YAxis tick={{ ...AXIS_PROPS }} axisLine={false} tickLine={false} width={55}
            tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v <= -1000 ? `-${(Math.abs(v)/1000).toFixed(1)}k` : v}`} />
          <Tooltip cursor={{ fill: '#1f2937' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                  <div className="text-gray-400 mb-1">{d[xLabel] ?? d[xKey]}</div>
                  <div className={`font-mono font-semibold ${d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPnl(d.pnl)}
                  </div>
                  <div className="text-gray-500 text-xs">{d.trades} trades · {d.wins ?? 0}W</div>
                </div>
              )
            }}
          />
          <ReferenceLine y={0} stroke="#374151" />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function HoldTimeScatter({ holdTime, pnlData }) {
  // Build scatter data: x = hold time minutes, y = individual trade pnl
  // We only have grouped holdTime data and individual pnl-dist.
  // Use hold time groups as x with avg pnl proxy — show bucket midpoints with trade counts
  if (!holdTime.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
  )
  const scatterData = holdTime
    .filter(r => r.minutes >= 0 && r.minutes < 10000) // filter outliers
    .map(r => ({ minutes: r.minutes, count: r.count }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 4, right: 4, bottom: 10, left: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="minutes" type="number" name="Hold Time"
          tick={{ ...AXIS_PROPS }} axisLine={false} tickLine={false}
          tickFormatter={v => v < 60 ? `${v}m` : `${(v/60).toFixed(0)}h`}
          label={{ value: 'Hold time', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }} />
        <YAxis dataKey="count" type="number" name="Trades"
          tick={{ ...AXIS_PROPS }} axisLine={false} tickLine={false} width={35} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
                <div className="text-gray-400">
                  {d.minutes < 60 ? `${d.minutes}m` : `${(d.minutes/60).toFixed(1)}h`} hold
                </div>
                <div className="text-white font-medium">{d.count} trades</div>
              </div>
            )
          }}
        />
        <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.7} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

export default function ByTimeTab({ dateRange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const hourRef    = useRef(null)
  const weekdayRef = useRef(null)
  const monthRef   = useRef(null)

  useEffect(() => {
    setLoading(true)
    const r = dateRange
    Promise.all([
      analyticsApi.byHour(r),
      analyticsApi.byWeekday(r),
      statsApi.monthly(r),
      analyticsApi.holdTime(r),
    ]).then(([hour, weekday, monthly, holdTime]) => {
      // Fill missing hours
      const hourMap = Object.fromEntries(hour.map(h => [h.hour, h]))
      const allHours = Array.from({ length: 24 }, (_, i) => hourMap[i] ?? { hour: i, label: `${String(i).padStart(2,'0')}:00`, trades: 0, pnl: 0, wins: 0, avg_pnl: 0, avg_r: null })

      // Fill missing weekdays
      const dayMap = Object.fromEntries(weekday.map(d => [d.dow, d]))
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const allDays = days.map((day, i) => dayMap[i] ?? { dow: i, day, trades: 0, pnl: 0, wins: 0, losses: 0 })

      setData({ hour: allHours, weekday: allDays, monthly, holdTime })
    }).finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return <LoadingSpinner className="h-64" />
  if (!data) return null

  const { hour, weekday, monthly, holdTime } = data

  // Map monthly to bar chart format
  const monthChartData = monthly.map(m => ({ ...m, label: m.month }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Performance by Hour of Day">
          <PnlBarChart data={hour} xKey="hour" xLabel="label" chartRef={hourRef} />
        </Section>

        <Section title="Performance by Day of Week">
          <PnlBarChart data={weekday} xKey="dow" xLabel="day" chartRef={weekdayRef} />
        </Section>
      </div>

      <Section title="Performance by Month">
        <PnlBarChart data={monthChartData} xKey="month" xLabel="month" chartRef={monthRef} />
      </Section>

      <Section title="Hold Time Distribution">
        <HoldTimeScatter holdTime={holdTime} />
      </Section>
    </div>
  )
}
