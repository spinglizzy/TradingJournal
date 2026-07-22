import { format } from 'date-fns'
import MonthGrid from '../ui/MonthGrid.jsx'

// Entry type config — kept for backwards compatibility with stored data
export const ENTRY_TYPES = {
  daily:           { label: 'Journal Entry',   color: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  pre_session:     { label: 'Journal Entry',   color: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  post_session:    { label: 'Journal Entry',   color: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  weekly_review:   { label: 'Journal Entry',   color: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  premarket_plan:  { label: 'Pre-Market Plan', color: 'bg-amber-400',  dot: 'bg-amber-400',  text: 'text-amber-400'  },
}

export default function JournalCalendar({
  month,            // Date (any day in the month to display)
  onMonthChange,    // (newMonth: Date) => void
  journalDays,      // [{ date: 'YYYY-MM-DD', types: ['daily', ...] }]
  tradeDays,        // [{ date: 'YYYY-MM-DD', pnl: number, trades: number }]
  selectedDate,     // 'YYYY-MM-DD' | null
  onDayClick,       // (dateStr: 'YYYY-MM-DD') => void
}) {
  const journalMap = {}
  for (const j of (journalDays || [])) journalMap[j.date] = j.types

  const tradeMap = {}
  for (const t of (tradeDays || [])) tradeMap[t.date] = t

  const legend = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-indigo-400" />
        Journal entry
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Pre-market plan
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-orange-500/70" />
        Traded, no journal
      </div>
    </>
  )

  return (
    <MonthGrid
      month={month}
      onMonthChange={onMonthChange}
      onDayClick={onDayClick}
      legend={legend}
      renderDay={({ dateStr, day, inMonth, today, onClick }) => {
        const isSelected = selectedDate === dateStr
        const entryTypes = journalMap[dateStr] || []
        const tradeDay   = tradeMap[dateStr]
        const hasEntries = entryTypes.length > 0
        const hasPlan    = entryTypes.includes('premarket_plan')
        const hasJournal = entryTypes.some(t => t !== 'premarket_plan')
        const hasTrades  = !!tradeDay
        const missingJournal = hasTrades && !hasJournal

        return (
          <button
            onClick={onClick}
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

            {/* Entry dots */}
            {hasEntries && (
              <span className="flex gap-0.5">
                {hasJournal && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                {hasPlan && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </span>
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
      }}
    />
  )
}
