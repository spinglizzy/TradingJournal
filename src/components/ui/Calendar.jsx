import { cn } from '../../lib/utils'
import { ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

const buttonCls =
  'relative flex size-(--cell-size) text-sm items-center justify-center rounded-lg text-white ' +
  'hover:bg-gray-700 disabled:pointer-events-none disabled:opacity-40 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4'

const defaultClassNames = {
  button_next: buttonCls,
  button_previous: buttonCls,
  caption_label: 'text-sm font-medium flex items-center gap-2 h-full text-white',
  day: 'size-(--cell-size) text-sm py-px',
  day_button: cn(
    buttonCls,
    'in-data-disabled:pointer-events-none ' +
    'in-[.range-middle]:rounded-none ' +
    'in-[.range-end:not(.range-start)]:rounded-s-none ' +
    'in-[.range-start:not(.range-end)]:rounded-e-none ' +
    'in-[.range-middle]:in-data-selected:bg-gray-700 ' +
    'in-data-selected:bg-[#9aea62] ' +
    'in-data-selected:text-gray-950 ' +
    'in-data-disabled:text-gray-600 ' +
    'in-data-outside:text-gray-600 ' +
    'in-data-disabled:line-through ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-[#9aea62]/50 ' +
    'transition-colors'
  ),
  dropdown: 'absolute bg-gray-900 inset-0 opacity-0 cursor-pointer',
  dropdown_root:
    'relative border border-gray-700 rounded-lg px-2 h-8 flex items-center ' +
    '[&_svg]:pointer-events-none [&_svg]:-me-1 [&_svg]:size-4 text-white text-sm',
  dropdowns: 'w-full flex items-center text-sm justify-center h-(--cell-size) gap-1.5',
  hidden: 'invisible',
  month: 'w-full',
  month_caption: 'relative mx-(--cell-size) px-1 mb-1 flex h-(--cell-size) items-center justify-center z-10',
  months: 'relative flex flex-col gap-2',
  nav: 'absolute top-0 flex w-full justify-between z-10',
  outside: 'text-gray-600',
  range_end: 'range-end',
  range_middle: 'range-middle',
  range_start: 'range-start',
  today:
    '*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 ' +
    '*:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full ' +
    '*:after:bg-[#9aea62] [&[data-selected]:not(.range-middle)>*]:after:bg-gray-950',
  week_number: 'size-(--cell-size) p-0 text-xs font-medium text-gray-500',
  weekday: 'size-(--cell-size) p-0 text-xs font-medium text-gray-500',
}

function Chevron({ className, orientation }) {
  if (orientation === 'left') return <ChevronLeftIcon className={cn(className, 'rtl:rotate-180')} aria-hidden />
  if (orientation === 'right') return <ChevronRightIcon className={cn(className, 'rtl:rotate-180')} aria-hidden />
  return <ChevronsUpDownIcon className={className} aria-hidden />
}

export function Calendar({ className, classNames, showOutsideDays = true, mode = 'single', ...props }) {
  const merged = Object.keys(defaultClassNames).reduce((acc, key) => {
    const userCls = classNames?.[key]
    acc[key] = userCls ? cn(defaultClassNames[key], userCls) : defaultClassNames[key]
    return acc
  }, { ...defaultClassNames })

  return (
    <DayPicker
      data-slot="calendar"
      className={cn('[--cell-size:--spacing(9)]', className)}
      classNames={merged}
      components={{ Chevron, ...props.components }}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
      }}
      mode={mode}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  )
}
