import { useEffect, useState, useMemo } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, parseISO, addMonths, subMonths,
  isSameMonth, isToday,
} from 'date-fns'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useFlushNavigate } from '../../../hooks/useFlushNavigate.js'

export default function CalendarHeatmapWidget({ config }) {
  const { apiParams } = useDashboard()
  const navigate = useFlushNavigate()
  const [viewDate, setViewDate]   = useState(new Date())
  const [allData, setAllData]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [tooltip, setTooltip]     = useState(null) // {day, x, y}

  // Fetch all data in the global range (or ±11 months if no range)
  useEffect(() => {
    setLoading(true)
    const from = apiParams.from ?? format(subMonths(new Date(), 11), 'yyyy-MM-dd')
    const to   = apiParams.to   ?? format(new Date(), 'yyyy-MM-dd')
    statsApi.calendar({ from, to, ...(apiParams.account_id ? { account_id: apiParams.account_id } : {}) })
      .then(d => setAllData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  // Filter data to current view month
  const dataMap = useMemo(() => {
    const map = {}
    allData.forEach(d => { map[d.date] = d })
    return map
  }, [allData])

  // Compute max abs pnl for color intensity scaling
  const maxAbsPnl = useMemo(() => {
    const monthStr = format(viewDate, 'yyyy-MM')
    const values = allData
      .filter(d => d.date.startsWith(monthStr))
      .map(d => Math.abs(d.pnl))
    return Math.max(...values, 1)
  }, [allData, viewDate])

  const monthStart = startOfMonth(viewDate)
  const monthEnd   = endOfMonth(viewDate)
  // Calendar grid: week starts Monday
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(monthEnd,     { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const numWeeks   = Math.ceil(days.length / 7)

  function pnlBg(pnl, inMonth) {
    if (!inMonth) return 'rgba(17,24,39,0.3)'
    if (pnl == null) return 'rgba(31,41,55,0.5)'
    const ratio = Math.min(Math.abs(pnl) / maxAbsPnl, 1)
    if (pnl > 0) {
      if (ratio > 0.66) return 'rgba(52,110,74,0.92)'
      if (ratio > 0.33) return 'rgba(38,82,55,0.85)'
      return 'rgba(26,55,38,0.80)'
    } else {
      if (ratio > 0.66) return 'rgba(130,52,52,0.92)'
      if (ratio > 0.33) return 'rgba(98,38,38,0.85)'
      return 'rgba(65,25,25,0.80)'
    }
  }

  // Month P&L summary
  const monthStr  = format(viewDate, 'yyyy-MM')
  const monthData = allData.filter(d => d.date.startsWith(monthStr))
  const monthPnl  = monthData.reduce((s, d) => s + (d.pnl ?? 0), 0)
  const tradeDays = monthData.length

  return (
    <div className="flex flex-col h-full" onClick={() => setTooltip(null)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">{format(viewDate, 'MMMM yyyy')}</span>
          {!loading && (
            <span className={`text-xs font-mono font-medium ${monthPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {monthPnl >= 0 ? '+' : ''}${monthPnl.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-2">{tradeDays} trade days</span>
          <button
            onClick={e => { e.stopPropagation(); setViewDate(v => subMonths(v, 1)) }}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setViewDate(new Date()) }}
            className="text-xs text-gray-500 hover:text-gray-300 px-1 py-0.5 rounded hover:bg-gray-800 transition-colors"
          >
            Today
          </button>
          <button
            onClick={e => { e.stopPropagation(); setViewDate(v => addMonths(v, 1)) }}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs text-gray-600 font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex-1 grid grid-cols-7 gap-1" style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
          {Array.from({ length: numWeeks * 7 }).map((_, i) => (
            <div key={i} className="bg-gray-800/30 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-7 gap-1" style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
          {days.map((day) => {
            const dateStr  = format(day, 'yyyy-MM-dd')
            const entry    = dataMap[dateStr]
            const inMonth  = isSameMonth(day, viewDate)
            const todayDay = isToday(day)
            const pnl      = entry?.pnl ?? null

            return (
              <div
                key={dateStr}
                className={`
                  relative rounded cursor-pointer transition-colors
                  flex flex-col items-center justify-center gap-0 min-h-0
                  ${todayDay ? 'ring-1 ring-indigo-400' : ''}
                  ${!inMonth ? 'cursor-default' : ''}
                `}
                style={{ backgroundColor: pnlBg(pnl, inMonth) }}
                onClick={e => {
                  e.stopPropagation()
                  if (!inMonth || !entry) return
                  navigate(`/trades?date=${dateStr}`)
                }}
              >
                <span className={`text-sm leading-none font-semibold select-none
                  ${!inMonth ? 'text-gray-700' : entry ? 'text-white' : 'text-gray-400'}
                  ${todayDay ? 'text-indigo-300' : ''}
                `}>
                  {format(day, 'd')}
                </span>
                {inMonth && entry && (
                  <span className={`text-[11px] leading-none font-mono font-medium select-none
                    ${entry.pnl >= 0 ? 'text-green-200' : 'text-red-200'}
                  `}>
                    {entry.pnl >= 0 ? '+' : '-'}${(Math.abs(entry.pnl) / 1000 >= 0.1 ? `${(Math.abs(entry.pnl)/1000).toFixed(1)}k` : Math.abs(entry.pnl).toFixed(0))}
                  </span>
                )}

                {/* Tooltip popup */}
                {tooltip?.day === dateStr && (
                  <div
                    className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap pointer-events-none"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="text-gray-300 font-medium mb-1">{format(parseISO(dateStr), 'MMM d, yyyy')}</div>
                    <div className={`font-mono font-semibold ${entry.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {entry.pnl >= 0 ? '+' : ''}${Math.abs(entry.pnl).toFixed(2)}
                    </div>
                    <div className="text-gray-500 mt-0.5">{entry.trades} trade{entry.trades !== 1 ? 's' : ''}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-end gap-3 mt-2 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(130,52,52,0.92)' }} /><span>Loss</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-800" /><span>No trades</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(52,110,74,0.92)' }} /><span>Profit</span>
        </div>
      </div>
    </div>
  )
}
