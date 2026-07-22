import { Fragment } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths,
} from 'date-fns'

/**
 * Month calendar shell: header with backward/forward navigation, weekday row,
 * and a 7-column day grid. The caller owns what goes inside each cell.
 *
 * Extracted from JournalCalendar so the Journal and the Wheel tab share one
 * calendar rather than drifting into two that look almost the same.
 */
export default function MonthGrid({
  month,           // Date — any day in the month to display
  onMonthChange,   // (newMonth: Date) => void
  renderDay,       // ({ dateStr, day, inMonth, today }) => ReactNode
  onDayClick,      // (dateStr: 'YYYY-MM-DD') => void
  legend,          // ReactNode
  headerExtra,     // ReactNode — rendered left of the nav buttons
  title,
}) {
  const monthStart = startOfMonth(month)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-glow">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">
          {title ?? format(month, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          {headerExtra}
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onMonthChange(subMonths(month, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date())}
            className="px-2 py-1 text-xs rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
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
        <div className="grid grid-cols-7 mb-1">
          {dayNames.map(d => (
            <div key={d} className="text-center text-xs text-gray-600 font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            // renderDay owns the whole cell element, including its own click
            // target — nesting a button inside a button is invalid HTML and
            // breaks the quick actions the Wheel calendar puts in each cell.
            return (
              <Fragment key={dateStr}>
                {renderDay({
                  dateStr,
                  day,
                  inMonth: isSameMonth(day, month),
                  today: isToday(day),
                  onClick: () => onDayClick?.(dateStr),
                })}
              </Fragment>
            )
          })}
        </div>
      </div>

      {legend && <div className="px-4 pb-3 flex flex-wrap gap-3">{legend}</div>}
    </div>
  )
}
