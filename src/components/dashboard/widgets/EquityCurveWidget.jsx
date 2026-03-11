import { useEffect, useState } from 'react'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const cum = payload.find(p => p.dataKey === 'cumulative')?.value
  const dd  = payload.find(p => p.dataKey === 'drawdown')?.value
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      {cum != null && (
        <div className={`font-mono font-semibold ${cum >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {cum >= 0 ? '+' : ''}${cum.toFixed(2)}
        </div>
      )}
      {dd != null && dd < 0 && (
        <div className="text-red-400/70 font-mono text-xs">{dd.toFixed(1)}% DD</div>
      )}
    </div>
  )
}

export default function EquityCurveWidget({ config }) {
  const { dateRange, apiParams } = useDashboard()
  const [equity, setEquity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.equityCurve(apiParams)
      .then(d => setEquity(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <div className="h-56 flex items-center justify-center"><ChartSkeleton /></div>
  if (!equity.length) return <EmptyState />

  const final  = equity[equity.length - 1]?.cumulative ?? 0
  const color  = final >= 0 ? '#10b981' : '#ef4444'

  // Calculate drawdown for shading
  let peak = 0
  const data = equity.map(d => {
    if (d.cumulative > peak) peak = d.cumulative
    const drawdown = peak > 0 ? ((d.cumulative - peak) / peak) * 100 : 0
    return {
      ...d,
      date:     format(parseISO(d.date), 'MMM d'),
      drawdown: drawdown < 0 ? drawdown : 0,
    }
  })

  const minVal = Math.min(...data.map(d => d.cumulative))
  const maxVal = Math.max(...data.map(d => d.cumulative))
  const padding = (maxVal - minVal) * 0.1 || 10

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`}
          width={55}
          domain={[minVal - padding, maxVal + padding]}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
        {/* Drawdown shading below zero line */}
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="none"
          fill="url(#ddGrad)"
          yAxisId={0}
          dot={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke={color}
          strokeWidth={2}
          fill="url(#equityGrad)"
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function ChartSkeleton() {
  return (
    <div className="w-full h-52 animate-pulse bg-gray-800/30 rounded-lg" />
  )
}

function EmptyState() {
  return (
    <div className="h-52 flex items-center justify-center text-gray-600 text-sm">
      No trade data yet
    </div>
  )
}
