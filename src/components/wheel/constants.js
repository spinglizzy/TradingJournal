/** Options contracts control 100 shares. Kept in one place on the client so the
 *  conversion is never re-derived inline. Mirrors SHARES_PER_CONTRACT in
 *  server/lib/wheelEngine.js. */
export const SHARES_PER_CONTRACT = 100

/** Display config per leg lifecycle state (spec §7). */
export const LEG_STATUS = {
  open:        { label: 'Open',        dot: 'bg-indigo-400',  chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  expired:     { label: 'Expired',     dot: 'bg-gray-500',    chip: 'bg-gray-700/40 text-gray-400 border-gray-700' },
  assigned:    { label: 'Assigned',    dot: 'bg-amber-400',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  called_away: { label: 'Called away', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  rolled:      { label: 'Rolled',      dot: 'bg-cyan-400',    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  closed:      { label: 'Bought back', dot: 'bg-violet-400',  chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
}

/**
 * Compact contract label, e.g. "HL 17.5P".
 *
 * Legs backfilled from the old trade log have no strike or option type — those
 * rows only ever stored a net P&L figure. Say so plainly rather than rendering
 * a fabricated "0.00C".
 */
export const legLabel = (leg) => {
  if (leg.strike == null || leg.option_type == null) return `${leg.ticker} (imported)`
  return `${leg.ticker} ${Number(leg.strike).toFixed(2).replace(/\.00$/, '')}${leg.option_type === 'put' ? 'P' : 'C'}`
}
