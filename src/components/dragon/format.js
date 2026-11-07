// Same input/field/button look as the Wheel forms (components/wheel/LegForm.jsx).
export const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`
export const btnPrimary = 'px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors'
export const btnGhost   = 'px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors'

export const money  = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(Number(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
export const signed = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`)
export const pct    = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`)
/** Up to 6 decimals, no trailing zeros. */
export const fmtShares = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 6 }))
export const todayStr = () => new Date().toISOString().slice(0, 10)
export const tone = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-300')

export const TYPE_LABEL = {
  BUY: 'Buy', DIVIDEND: 'Dividend', DRIP: 'DRIP', SELL: 'Sell',
  CC_OPEN: 'Sell CC', CC_CLOSE: 'Close CC', CC_ROLL: 'Roll CC', CC_EXPIRE: 'Expire CC',
  ROC: 'Return of capital', RECLASS: 'Reclassify', CASH_IN: 'Cash in', CASH_OUT: 'Cash out',
}

export const callLabel = (c) => `$${Number(c.strike).toFixed(2).replace(/\.00$/, '')}C ${c.expiry} ×${c.contracts}`

/**
 * Split `total` equally across `n` holdings in cents; the remainder goes to the
 * first so the parts always add back up to the total.
 */
export function splitEqually(total, n) {
  if (!(n > 0) || !(total > 0)) return []
  const cents = Math.round(total * 100)
  const each = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (each + (i === 0 ? cents - each * n : 0)) / 100)
}
