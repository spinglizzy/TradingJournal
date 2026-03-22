import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CalendarIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Calendar } from './Calendar'

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className = '', error }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)

  const selected = value ? parseISO(value) : undefined

  function handleSelect(date) {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    }
  }

  function handleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
    setOpen(v => !v)
  }

  // Close on outside click or scroll
  useEffect(() => {
    function onMouseDown(e) {
      if (!buttonRef.current?.contains(e.target) &&
          !document.getElementById('date-picker-portal')?.contains(e.target)) {
        setOpen(false)
      }
    }
    function onScroll() { setOpen(false) }
    if (open) {
      document.addEventListener('mousedown', onMouseDown)
      window.addEventListener('scroll', onScroll, true)
    }
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const inputCls = `w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-700'} rounded-lg px-3 py-2 text-sm transition-colors
    flex items-center justify-between cursor-pointer
    hover:border-gray-600 focus:outline-none focus:border-indigo-500`

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className={inputCls}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selected ? 'text-white' : 'text-gray-600'}>
          {selected ? format(selected, 'MMM d, yyyy') : placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-gray-500 shrink-0" />
      </button>

      {open && createPortal(
        <div
          id="date-picker-portal"
          role="dialog"
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3"
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
        </div>,
        document.body
      )}
    </div>
  )
}
