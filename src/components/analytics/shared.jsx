import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, X, Download, FileText, Image } from 'lucide-react'
import { format, subDays, startOfMonth, startOfYear } from 'date-fns'
import { periodToRange } from '../../contexts/DashboardContext.jsx'

// ── Formatting helpers ─────────────────────────────────────────────────────────
export function fmt(n, d = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
export function fmtPnl(n) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}$${fmt(Math.abs(n))}`
}
export function fmtPct(n) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${fmt(n)}%`
}
export function fmtR(n) {
  if (n == null) return '—'
  return `${fmt(n)}R`
}
export function fmtDuration(minutes) {
  if (minutes == null || isNaN(minutes)) return '—'
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}

// ── MetricCard ─────────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, color, size = 'md' }) {
  const colorMap = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
    default: 'text-white',
  }
  const textColor = colorMap[color] ?? colorMap.default
  const valueSize = size === 'lg' ? 'text-2xl' : 'text-xl'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`${valueSize} font-bold font-mono ${textColor} leading-tight`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

// ── PerfTable ──────────────────────────────────────────────────────────────────
export function PerfTable({ data, columns, onRowClick, expandedRow, renderExpanded }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {columns.map(col => (
              <th key={col.key}
                className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-4 last:pr-0 whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {data.map((row, i) => (
            <>
              <tr
                key={i}
                onClick={() => onRowClick?.(i)}
                className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-gray-800/40' : 'hover:bg-gray-800/20'}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`py-2.5 pr-4 last:pr-0 ${col.className ?? ''}`}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
              {expandedRow === i && renderExpanded && (
                <tr key={`${i}-expanded`}>
                  <td colSpan={columns.length} className="pb-3 pt-0 px-0">
                    {renderExpanded(row)}
                  </td>
                </tr>
              )}
            </>
          ))}
          {!data.length && (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-gray-600 text-sm">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Local date range filter (standalone, not tied to DashboardContext) ─────────
const PERIODS = [
  { key: 'all',    label: 'All time' },
  { key: 'ytd',    label: 'Year to date' },
  { key: 'mtd',    label: 'Month to date' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last7',  label: 'Last 7 days' },
  { key: 'custom', label: 'Custom range' },
]

export function LocalDateFilter({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState('all')
  const [customFrom, setFrom] = useState('')
  const [customTo, setTo] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function applyPeriod(key) {
    setPeriod(key)
    if (key !== 'custom') {
      onChange(periodToRange(key))
      setOpen(false)
    }
  }

  function applyCustom() {
    onChange({ from: customFrom || null, to: customTo || null })
    setOpen(false)
  }

  function clearFilter() {
    setPeriod('all')
    onChange({ from: null, to: null })
    setOpen(false)
  }

  const hasFilter = value.from || value.to
  const label = (() => {
    if (period !== 'custom') return PERIODS.find(p => p.key === period)?.label ?? 'All time'
    const parts = []
    if (value.from) parts.push(value.from)
    if (value.to)   parts.push(value.to)
    return parts.join(' → ') || 'Custom range'
  })()

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
          hasFilter
            ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-300 hover:border-indigo-500/60'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 hover:border-gray-600'
        }`}
      >
        <Calendar className="w-4 h-4" />
        <span className="font-medium">{label}</span>
        {hasFilter && (
          <button onClick={e => { e.stopPropagation(); clearFilter() }}
            className="text-indigo-400/60 hover:text-indigo-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-64 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-2">
            {PERIODS.filter(p => p.key !== 'custom').map(p => (
              <button key={p.key} onClick={() => applyPeriod(p.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  period === p.key ? 'bg-indigo-600/15 text-indigo-300 font-medium' : 'text-gray-300 hover:bg-gray-700'
                }`}>
                {p.label}
                {period === p.key && <span className="text-indigo-400 text-xs">✓</span>}
              </button>
            ))}
            <button onClick={() => setPeriod('custom')}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                period === 'custom' ? 'bg-indigo-600/15 text-indigo-300 font-medium' : 'text-gray-300 hover:bg-gray-700'
              }`}>
              Custom range…
            </button>
          </div>
          {period === 'custom' && (
            <div className="border-t border-gray-700 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">From</label>
                  <input type="date" value={customFrom} onChange={e => setFrom(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500 [color-scheme:dark]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">To</label>
                  <input type="date" value={customTo} onChange={e => setTo(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500 [color-scheme:dark]" />
                </div>
              </div>
              <button onClick={applyCustom}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Export utilities ───────────────────────────────────────────────────────────
export function downloadCSV(data, filename) {
  if (!data?.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(row => headers.map(h => {
    const v = row[h]
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function downloadChartPNG(containerRef, filename) {
  if (!containerRef.current) return
  const svg = containerRef.current.querySelector('svg')
  if (!svg) return
  const w = svg.clientWidth || 800
  const h = svg.clientHeight || 400
  const svgData = new XMLSerializer().serializeToString(svg)
  const canvas = document.createElement('canvas')
  canvas.width = w * 2; canvas.height = h * 2
  const ctx = canvas.getContext('2d')
  ctx.scale(2, 2)
  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, w, h)
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0)
    const a = document.createElement('a')
    a.download = filename; a.href = canvas.toDataURL('image/png'); a.click()
    URL.revokeObjectURL(url)
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

export function ExportButtons({ onCSV, onPNG, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {onPNG && (
        <button onClick={onPNG}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors">
          <Image className="w-3.5 h-3.5" />
          PNG
        </button>
      )}
      {onCSV && (
        <button onClick={onCSV}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors">
          <FileText className="w-3.5 h-3.5" />
          CSV
        </button>
      )}
    </div>
  )
}

// ── Section card wrapper ───────────────────────────────────────────────────────
export function Section({ title, actions, children, className = '' }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-sm font-semibold text-gray-300">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Win rate bar ───────────────────────────────────────────────────────────────
export function WinRateBar({ wins, total }) {
  if (!total) return <div className="text-gray-600 text-xs">—</div>
  const pct = (wins / total) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Recharts shared tooltip style ─────────────────────────────────────────────
export function ChartTooltip({ active, payload, label, valueFormat, labelFormat }) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-gray-400 mb-1">{labelFormat ? labelFormat(label) : label}</div>
      {payload.map((p, i) => (
        <div key={i} className="font-mono font-semibold" style={{ color: p.color }}>
          {valueFormat ? valueFormat(p.value, p.name) : p.value}
        </div>
      ))}
    </div>
  )
}
