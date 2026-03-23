import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'
import { format, subDays, startOfMonth, startOfYear } from 'date-fns'
import { useDashboard, periodToRange } from '../../contexts/DashboardContext.jsx'
import { DatePicker } from '../ui/DatePicker.jsx'

const PERIODS = [
  { key: 'all',    label: 'All time' },
  { key: 'ytd',    label: 'Year to date' },
  { key: 'mtd',    label: 'Month to date' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last7',  label: 'Last 7 days' },
  { key: 'custom', label: 'Custom range' },
]

export default function DateRangeFilter() {
  const { dateRange, setDateRange } = useDashboard()
  const [open, setOpen]         = useState(false)
  const [period, setPeriod]     = useState('all')
  const [customFrom, setFrom]   = useState('')
  const [customTo, setTo]       = useState('')
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
      const range = periodToRange(key)
      setDateRange(range)
      setOpen(false)
    }
  }

  function applyCustom() {
    setDateRange({ from: customFrom || null, to: customTo || null })
    setOpen(false)
  }

  function clearFilter() {
    setPeriod('all')
    setDateRange({ from: null, to: null })
    setOpen(false)
  }

  const hasFilter  = dateRange.from || dateRange.to
  const activeLabel = (() => {
    if (period !== 'custom') return PERIODS.find(p => p.key === period)?.label ?? 'All time'
    const parts = []
    if (dateRange.from) parts.push(dateRange.from)
    if (dateRange.to)   parts.push(dateRange.to)
    return parts.join(' → ') || 'Custom range'
  })()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
          hasFilter
            ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-300 hover:border-indigo-500/60'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 hover:border-gray-600'
        }`}
      >
        <Calendar className="w-4 h-4" />
        <span className="font-medium">{activeLabel}</span>
        {hasFilter && (
          <button
            onClick={e => { e.stopPropagation(); clearFilter() }}
            className="text-indigo-400/60 hover:text-indigo-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Quick periods */}
          <div className="p-2">
            {PERIODS.filter(p => p.key !== 'custom').map(p => (
              <button
                key={p.key}
                onClick={() => applyPeriod(p.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  period === p.key
                    ? 'bg-indigo-600/15 text-indigo-300 font-medium'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p.label}
                {period === p.key && <span className="text-indigo-400 text-xs">✓</span>}
              </button>
            ))}
            <button
              onClick={() => setPeriod('custom')}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                period === 'custom'
                  ? 'bg-indigo-600/15 text-indigo-300 font-medium'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              Custom range…
            </button>
          </div>

          {/* Custom date inputs */}
          {period === 'custom' && (
            <div className="border-t border-gray-700 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">From</label>
                  <DatePicker value={customFrom} onChange={setFrom} placeholder="From" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">To</label>
                  <DatePicker value={customTo} onChange={setTo} placeholder="To" />
                </div>
              </div>
              <button
                onClick={applyCustom}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
