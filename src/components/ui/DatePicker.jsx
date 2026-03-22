import { useState, useRef, useEffect } from 'react'
import { CalendarIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Calendar } from './Calendar'

/**
 * DatePicker — wraps Calendar in a popover.
 * Works with react-hook-form: value is a "YYYY-MM-DD" string,
 * onChange receives a "YYYY-MM-DD" string.
 */
export function DatePicker({ value, onChange, placeholder = 'Pick a date', className = '', error }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  // Parse the YYYY-MM-DD string into a Date for DayPicker
  const selected = value ? parseISO(value) : undefined

  function handleSelect(date) {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const inputCls = `w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-700'} rounded-lg px-3 py-2 text-sm transition-colors
    flex items-center justify-between cursor-pointer
    hover:border-gray-600 focus:outline-none focus:border-indigo-500`

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={inputCls}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selected ? 'text-white' : 'text-gray-600'}>
          {selected ? format(selected, 'MMM d, yyyy') : placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-gray-500 shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute z-50 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3"
          style={{ minWidth: '280px' }}
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2030, 11)}
          />
        </div>
      )}
    </div>
  )
}
