import { format } from 'date-fns'
import MonthGrid from '../ui/MonthGrid.jsx'
import { LEG_STATUS, legLabel } from './constants.js'

/**
 * Every wheel leg plotted on its expiry date. Navigation runs backward and
 * forward through the full history and every upcoming expiry — the calendar is
 * the reminder surface, since v1 has no push notifications.
 */
export default function WheelCalendar({ month, onMonthChange, legs = [], selectedDate, onDayClick, today }) {
  const byDay = {}
  for (const leg of legs) {
    if (!leg.expiry) continue
    ;(byDay[leg.expiry] ||= []).push(leg)
  }

  const legend = (
    <>
      {Object.entries(LEG_STATUS).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-orange-500/70" />
        Past expiry, unresolved
      </div>
    </>
  )

  return (
    <MonthGrid
      month={month}
      onMonthChange={onMonthChange}
      onDayClick={onDayClick}
      legend={legend}
      renderDay={({ dateStr, day, inMonth, today: isToday, onClick }) => {
        const dayLegs    = byDay[dateStr] || []
        const isSelected = selectedDate === dateStr
        const open       = dayLegs.filter(l => l.leg_status === 'open')
        // No quote feed in v1, so "needs attention" is expiry proximity plus the
        // manual flag — an open leg past its expiry has an outcome to record.
        const overdue    = open.length > 0 && dateStr < today
        const flagged    = open.some(l => l.needs_roll)

        return (
          <button
            onClick={onClick}
            className={`
              relative flex flex-col items-stretch gap-0.5 rounded-lg p-1 min-h-16
              transition-colors text-xs font-medium overflow-hidden
              ${!inMonth ? 'opacity-30' : ''}
              ${isSelected
                ? 'bg-indigo-600/20 border border-indigo-500/50'
                : overdue
                  ? 'bg-orange-500/5 border border-orange-500/25 hover:border-orange-500/50'
                  : isToday
                    ? 'bg-gray-800 border border-gray-600'
                    : 'border border-transparent hover:bg-gray-800 hover:border-gray-700'
              }
            `}
          >
            <span className={`
              self-center w-6 h-6 flex items-center justify-center rounded-full font-semibold shrink-0
              ${isToday ? 'bg-indigo-600 text-white' : isSelected ? 'text-indigo-300' : 'text-gray-300'}
            `}>
              {format(day, 'd')}
            </span>

            <span className="flex flex-col gap-0.5 w-full">
              {dayLegs.slice(0, 2).map(leg => (
                <span
                  key={leg.id}
                  className={`block truncate px-1 py-px rounded border text-[9px] leading-tight font-mono
                    ${LEG_STATUS[leg.leg_status]?.chip ?? LEG_STATUS.open.chip}`}
                  title={`${legLabel(leg)} — ${LEG_STATUS[leg.leg_status]?.label ?? leg.leg_status}`}
                >
                  {legLabel(leg)}
                </span>
              ))}
              {dayLegs.length > 2 && (
                <span className="text-[9px] text-gray-500 leading-tight">+{dayLegs.length - 2} more</span>
              )}
            </span>

            {(overdue || flagged) && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500/80" />
            )}
          </button>
        )
      }}
    />
  )
}
