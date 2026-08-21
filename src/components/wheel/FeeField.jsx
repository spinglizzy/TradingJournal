import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { round2 } from '../../lib/commissions.js'

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Number(v)).toFixed(2)}`

/**
 * A commission field that tracks the saved rate until you disagree with it.
 *
 * The estimate is a starting point, never a constraint: the moment you type, the
 * field stops following the rate and keeps whatever you entered, because the fill
 * confirmation is the truth and the rate table is only a guess about it. `reset`
 * puts it back on the rails.
 *
 * `initial` seeds the field from a fee that has already been recorded — editing an
 * existing leg shows what it was actually charged, not what the current rate card
 * would have predicted. It counts as touched, so a later rate change won't
 * overwrite a number the broker already confirmed.
 */
export function useAutoFee(estimate, { initial = null } = {}) {
  const est = round2(estimate || 0)
  const seeded = initial != null && initial !== '' && Number.isFinite(Number(initial))
  const [value, setValue]     = useState(() => (seeded ? round2(Number(initial)) : est).toFixed(2))
  const [touched, setTouched] = useState(seeded)

  // Re-price while untouched — contract count changes, or the rates are edited
  // in another modal, and this field should follow.
  useEffect(() => {
    if (!touched) setValue(est.toFixed(2))
  }, [est, touched])

  return {
    value,
    amount: Number(value) || 0,
    estimate: est,
    overridden: touched && round2(Number(value) || 0) !== est,
    onChange: (v) => { setTouched(true); setValue(v) },
    reset: () => { setTouched(false); setValue(est.toFixed(2)) },
  }
}

/** Presentation for `useAutoFee`. Spread the hook's result in as `fee`. */
export default function FeeField({ label = 'Commission', fee, breakdown, hint }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-xs text-gray-400 font-medium">{label}</label>
        {fee.overridden && (
          <button
            type="button" onClick={fee.reset}
            title={`Back to the rate you saved: ${money(fee.estimate)}`}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" /> auto {money(fee.estimate)}
          </button>
        )}
      </div>
      <div className="relative">
        <input
          type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
          value={fee.value} onChange={e => fee.onChange(e.target.value)}
          className={`${inputCls} pr-14`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">
          total $
        </span>
      </div>
      {(breakdown || hint) && (
        <p className="text-[11px] text-gray-600 mt-1 font-mono">
          {breakdown && <span>{breakdown}</span>}
          {breakdown && hint && <span className="font-sans"> · </span>}
          {hint && <span className="font-sans">{hint}</span>}
        </p>
      )}
    </div>
  )
}
