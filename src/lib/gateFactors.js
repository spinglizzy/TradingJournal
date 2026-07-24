/**
 * Pre-Entry Gate — factor config helpers.
 *
 * The lists themselves live in the `gate_factors` table (see gate_migration.sql)
 * so they can grow without a deploy. DEFAULT_FACTORS below is a *fallback only*:
 * it mirrors the migration's system-default seed so the gate still opens and
 * still vetoes if `/api/gate/factors` is slow or down. It is never the source of
 * truth — a successful fetch replaces it wholesale.
 */
export const DEFAULT_FACTORS = [
  { key: 'cisd',      label: 'CISD',                required: true,  kind: 'confluence', hotkey: 'q', sort_order: 10, level_based: false },
  { key: 'key_level', label: 'Key level tap (1hr)', required: true,  kind: 'confluence', hotkey: 'w', sort_order: 20, level_based: false },
  { key: 'resweep',   label: 'Resweep',             required: false, kind: 'confluence', hotkey: 'e', sort_order: 30, level_based: false },

  { key: 'choppy',            label: 'Choppy conditions',                 kind: 'kill', hotkey: '1', sort_order: 10, level_based: false, required: false },
  { key: 'htf_level_at_stop', label: 'HTF key level at stop loss',        kind: 'kill', hotkey: '2', sort_order: 20, level_based: true,  required: false },
  { key: 'eqh_eql_at_stop',   label: 'Equal highs/lows at stop loss',     kind: 'kill', hotkey: '3', sort_order: 30, level_based: true,  required: false },
  { key: 'lrl_at_stop',       label: 'LRL at stop loss',                  kind: 'kill', hotkey: '4', sort_order: 40, level_based: true,  required: false },
  { key: 'against_bias',      label: 'Entry not aligned with bias',       kind: 'kill', hotkey: '5', sort_order: 50, level_based: false, required: false },
  { key: 'be_taken',          label: 'Breakeven level taken before entry',kind: 'kill', hotkey: '6', sort_order: 60, level_based: false, required: false },
]

/** Keys offered to factors that have no `hotkey` set — kills first, then the rest. */
const HOTKEY_POOL = {
  kill:       ['1','2','3','4','5','6','7','8','9','0'],
  confluence: ['q','w','e','r','t'],
  contested:  ['a','s','d','f','g','h','j','k','l',';'],
}

/** Slugify free text into a stable key. Mirrors slugify() in server/routes/gate.js. */
export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Split the flat factor list into the three sections, in display order, with a
 * keyboard key resolved for every item. Config `hotkey` wins; anything without
 * one is auto-assigned the next free key of its kind, so a factor added to the
 * database later is instantly tickable without a code change.
 */
export function groupFactors(factors) {
  const out = {}
  for (const kind of ['kill', 'confluence', 'contested']) {
    const items = factors
      .filter(f => f.kind === kind)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key))

    const taken = new Set(items.map(f => f.hotkey).filter(Boolean))
    const free  = HOTKEY_POOL[kind].filter(k => !taken.has(k))
    let n = 0
    out[kind] = items.map(f => ({ ...f, hotkey: f.hotkey || free[n++] || null }))
  }
  return out
}
