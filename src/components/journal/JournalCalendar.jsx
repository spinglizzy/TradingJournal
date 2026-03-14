import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, isToday,
  addMonths, subMonths,
} from 'date-fns'

// Entry type config
export const ENTRY_TYPES = {
  daily:         { label: 'Daily',         color: 'bg-blue-400',    dot: 'bg-blue-400',    text: 'text-blue-400'    },
  pre_session:   { label: 'Pre-Session',   color: 'bg-amber-400',   dot: 'bg-amber-400',   text: 'text-amber-400'   },
  post_session:  { label: 'Post-Session',  color: 'bg-purple-400',  dot: 'bg-purple-400',  text: 'text-purple-400'  },
  weekly_review: { label: 'Weekly Review', color: 'bg-indigo-400',  dot: 'bg-indigo-400',  text: 'text-indigo-400'  },
}

export default function JournalCalendar({
  month,            // Date (any day in the month to display)
  onMonthChange,    // (newMonth: Date) => void
  journalDays,      // [{ date: 'YYYY-MM-DD', types: ['daily', ...] }]
  tradeDays,        // [{ date: 'YYYY-MM-DD', pnl: number, trades: number }]
  selectedDate,     // 'YYYY-MM-DD' | null
  onDayClick,       // (dateStr: 'YYYY-MM-DD') => void
}) {
  const monthStart = startOfMonth(month)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  const journalMap = {}
  for (const j of (journalDays || [])) journalMap[j.date] = j.types

  const tradeMap = {}
  for (const t of (tradeDays || [])) tradeMap[t.date] = t

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-glow">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">
          {format(month, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMonthChange(subMonths(month, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className="px-2 py-1 text-xs rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-3">
        {/* Day names */}
        <div className="grid grid-cols-7 mb-1">
          {dayNames.map(d => (
            <div key={d} className="text-center text-xs text-gray-600 font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const dateStr   = format(day, 'yyyy-MM-dd')
            const inMonth   = isSameMonth(day, month)
            const isSelected = selectedDate === dateStr
            const today     = isToday(day)
            const entryTypes = journalMap[dateStr] || []
            const tradeDay  = tradeMap[dateStr]
            const hasEntries = entryTypes.length > 0
            const hasTrades  = !!tradeDay
            const missingJournal = hasTrades && !hasEntries

            return (
              <button
                key={dateStr}
                onClick={() => onDayClick(dateStr)}
                className={`
                  relative flex flex-col items-center justify-start gap-0.5 rounded-lg p-1 min-h-14
                  transition-colors text-xs font-medium
                  ${!inMonth ? 'opacity-30' : ''}
                  ${isSelected
                    ? 'bg-indigo-600/20 border border-indigo-500/50'
                    : today
                      ? 'bg-gray-800 border border-gray-600'
                      : missingJournal
                        ? 'bg-orange-500/5 border border-orange-500/20 hover:border-orange-500/40'
                        : 'border border-transparent hover:bg-gray-800 hover:border-gray-700'
                  }
                `}
              >
                {/* Date number */}
                <span className={`
                  w-6 h-6 flex items-center justify-center rounded-full font-semibold
                  ${today ? 'bg-indigo-600 text-white' : isSelected ? 'text-indigo-300' : 'text-gray-300'}
                `}>
                  {format(day, 'd')}
                </span>

                {/* Entry type dots */}
                {hasEntries && (
                  <div className="flex flex-wrap justify-center gap-0.5 max-w-full">
                    {entryTypes.slice(0, 4).map((type, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${ENTRY_TYPES[type]?.dot || 'bg-gray-400'}`}
                      />
                    ))}
                  </div>
                )}

                {/* Trade P&L indicator */}
                {tradeDay && (
                  <span className={`text-[9px] font-mono leading-none ${
                    (tradeDay.pnl ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {(tradeDay.pnl ?? 0) >= 0 ? '+' : ''}{Math.round(tradeDay.pnl ?? 0)}
                  </span>
                )}

                {/* Missing journal warning dot */}
                {missingJournal && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500/70" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex flex-wrap gap-3">
        {Object.entries(ENTRY_TYPES).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-orange-500/70" />
          Traded, no journal
        </div>
      </div>
    </div>
  )
}
