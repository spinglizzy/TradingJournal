import { useState, useRef, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { Save, Trash2, Play } from 'lucide-react'
import { analyticsApi } from '../../api/analytics.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { Section, ExportButtons, fmt, fmtPnl, fmtR, downloadCSV, downloadChartPNG } from './shared.jsx'

const X_OPTIONS = [
  { value: 'day_of_week', label: 'Day of Week' },
  { value: 'hour',        label: 'Hour of Day' },
  { value: 'setup',       label: 'Setup' },
  { value: 'ticker',      label: 'Ticker' },
  { value: 'strategy',    label: 'Strategy' },
  { value: 'direction',   label: 'Direction' },
  { value: 'timeframe',   label: 'Timeframe' },
  { value: 'month',       label: 'Month' },
]

const Y_OPTIONS = [
  { value: 'pnl',          label: 'Total P&L',     fmt: v => fmtPnl(v), positive: v => (v ?? 0) >= 0 },
  { value: 'avg_pnl',      label: 'Avg P&L',        fmt: v => fmtPnl(v), positive: v => (v ?? 0) >= 0 },
  { value: 'win_rate',     label: 'Win Rate (%)',    fmt: v => v != null ? `${fmt(v, 1)}%` : '—', positive: v => (v ?? 0) >= 50 },
  { value: 'profit_factor',label: 'Profit Factor',  fmt: v => v != null ? fmt(v) : '—', positive: v => (v ?? 0) >= 1 },
  { value: 'trade_count',  label: 'Trade Count',    fmt: v => String(v ?? 0), positive: () => true },
  { value: 'avg_r',        label: 'Avg R',          fmt: v => fmtR(v), positive: v => (v ?? 0) >= 0 },
]

const CHART_TYPES = ['bar', 'line', 'scatter']

const PRESET_KEY = 'analytics_custom_presets'

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]') } catch { return [] }
}
function savePresets(presets) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
}

function ResultChart({ data, xField, yMetric, chartType, chartRef }) {
  const yDef = Y_OPTIONS.find(o => o.value === yMetric) ?? Y_OPTIONS[0]

  if (!data.length) return (
    <div className="h-56 flex items-center justify-center text-gray-600 text-sm">No data for this combination</div>
  )

  const isPositive = d => yDef.positive(d.value)
  const commonProps = {
    data,
    margin: { top: 4, right: 4, bottom: xField === 'ticker' || xField === 'setup' ? 50 : 10, left: 0 },
  }

  const xAxisProps = {
    dataKey: 'dimension',
    tick: { fill: '#6b7280', fontSize: 10 },
    axisLine: false,
    tickLine: false,
    ...(xField === 'ticker' || xField === 'setup' || xField === 'strategy'
      ? { angle: -35, textAnchor: 'end', interval: 0 }
      : {}),
  }

  const yAxisProps = {
    tick: { fill: '#6b7280', fontSize: 11 },
    axisLine: false,
    tickLine: false,
    width: 65,
    tickFormatter: v => {
      if (v == null) return ''
      if (yMetric === 'win_rate') return `${v.toFixed(0)}%`
      if (yMetric === 'pnl' || yMetric === 'avg_pnl')
        return `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`
      return fmt(v, 1)
    },
  }

  const TooltipContent = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
        <div className="text-gray-300 font-medium mb-1">{d.dimension}</div>
        <div className={`font-mono font-semibold ${isPositive(d) ? 'text-emerald-400' : 'text-red-400'}`}>
          {yDef.fmt(d.value)}
        </div>
        <div className="text-gray-500 text-xs">{d.trades} trades</div>
      </div>
    )
  }

  return (
    <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={300}>
        {chartType === 'bar' ? (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip cursor={{ fill: '#1f2937' }} content={<TooltipContent />} />
            <ReferenceLine y={0} stroke="#374151" />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={isPositive(d) ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        ) : chartType === 'line' ? (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<TooltipContent />} />
            <ReferenceLine y={0} stroke="#374151" />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
          </LineChart>
        ) : (
          /* scatter: x = index, y = value */
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="dimension" type="category" tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false} tickLine={false} />
            <YAxis dataKey="value" {...yAxisProps} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<TooltipContent />} />
            <ReferenceLine y={0} stroke="#374151" />
            <Scatter data={data} fill="#6366f1" fillOpacity={0.75} />
          </ScatterChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export default function CustomReportTab({ dateRange }) {
  const [xField, setXField]       = useState('day_of_week')
  const [yMetric, setYMetric]     = useState('pnl')
  const [chartType, setChartType] = useState('bar')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [presets, setPresets]     = useState(loadPresets)
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const chartRef = useRef(null)

  function runReport() {
    setLoading(true)
    analyticsApi.custom({ x_field: xField, y_metric: yMetric, ...dateRange })
      .then(rows => setData(rows))
      .finally(() => setLoading(false))
  }

  // Auto-run when params change
  useEffect(() => { runReport() }, [xField, yMetric, dateRange])

  function savePreset() {
    if (!presetName.trim()) return
    const newPreset = { id: Date.now(), name: presetName.trim(), xField, yMetric, chartType }
    const updated = [...presets, newPreset]
    setPresets(updated)
    savePresets(updated)
    setPresetName('')
    setSavingPreset(false)
  }

  function loadPreset(preset) {
    setXField(preset.xField)
    setYMetric(preset.yMetric)
    setChartType(preset.chartType)
  }

  function deletePreset(id) {
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    savePresets(updated)
  }

  const xLabel = X_OPTIONS.find(o => o.value === xField)?.label ?? xField
  const yLabel = Y_OPTIONS.find(o => o.value === yMetric)?.label ?? yMetric

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* X axis */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">X-Axis</label>
            <select
              value={xField}
              onChange={e => setXField(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500 min-w-[160px]"
            >
              {X_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Y axis */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">Y-Axis (Metric)</label>
            <select
              value={yMetric}
              onChange={e => setYMetric(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500 min-w-[160px]"
            >
              {Y_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Chart type */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">Chart Type</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {CHART_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    chartType === t
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ExportButtons
              onPNG={data?.length ? () => downloadChartPNG(chartRef, `custom-${xField}-${yMetric}.png`) : null}
              onCSV={data?.length ? () => downloadCSV(data, `custom-${xField}-${yMetric}.csv`) : null}
            />
            <button
              onClick={() => setSavingPreset(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-300 bg-indigo-600/10 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/20 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save preset
            </button>
          </div>
        </div>

        {savingPreset && (
          <div className="mt-4 flex items-center gap-2">
            <input
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && savePreset()}
              placeholder="Preset name…"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500 flex-1 max-w-xs"
              autoFocus
            />
            <button onClick={savePreset}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
              Save
            </button>
            <button onClick={() => setSavingPreset(false)}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Saved presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center">Saved:</span>
          {presets.map(p => (
            <div key={p.id} className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full pl-3 pr-1 py-1">
              <button onClick={() => loadPreset(p)} className="text-xs text-gray-300 hover:text-white transition-colors">
                {p.name}
              </button>
              <button onClick={() => deletePreset(p.id)}
                className="text-gray-600 hover:text-red-400 transition-colors p-0.5 rounded-full">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Chart result */}
      <Section title={`${yLabel} by ${xLabel}`}>
        {loading
          ? <LoadingSpinner className="h-48" />
          : <ResultChart data={data ?? []} xField={xField} yMetric={yMetric} chartType={chartType} chartRef={chartRef} />
        }
      </Section>

      {/* Data table */}
      {data?.length > 0 && (
        <Section title="Data Table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4">{xLabel}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4">{yLabel}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2">Trades</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {data.map((row, i) => {
                  const yDef = Y_OPTIONS.find(o => o.value === yMetric)
                  const positive = yDef?.positive(row.value) ?? true
                  return (
                    <tr key={i} className="hover:bg-gray-800/20">
                      <td className="py-2.5 pr-4 font-medium text-white">{row.dimension}</td>
                      <td className={`py-2.5 pr-4 font-mono font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {yDef?.fmt(row.value) ?? row.value}
                      </td>
                      <td className="py-2.5 text-gray-400">{row.trades}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}
