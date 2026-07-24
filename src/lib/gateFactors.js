/**
 * Pre-Entry Gate — factor config helpers.
 *
 * The lists themselves live in the `gate_factors` table (see gate_migration.sql)
 * so they can grow without a deploy. DEFAULT_FACTORS below is a *fallback only*:
 * it mirrors the migration's system-default seed so the gate still renders and
 * still vetoes if `/api/gate/factors` is slow or down. It is never the source of
 * truth — a successful fetch replaces it wholesale.
 */
export const DEFAULT_FACTORS = [
  { key: 'cisd',      label: 'CISD',                required: true,  kind: 'confluence', sort_order: 10 },
  { key: 'key_level', label: 'Key PD Array Manipulated', required: true, kind: 'confluence', sort_order: 20 },
  { key: 'resweep',   label: 'Resweep',             required: false, kind: 'confluence', sort_order: 30 },

  { key: 'choppy',            label: 'Choppy conditions',                  kind: 'kill', sort_order: 10, required: false },
  { key: 'htf_level_at_stop', label: 'HTF key level at stop loss',         kind: 'kill', sort_order: 20, required: false },
  { key: 'eqh_eql_at_stop',   label: 'Equal highs/lows at stop loss',      kind: 'kill', sort_order: 30, required: false },
  { key: 'lrl_at_stop',       label: 'LRL at stop loss',                   kind: 'kill', sort_order: 40, required: false },
  { key: 'against_bias',      label: 'Entry not aligned with bias',        kind: 'kill', sort_order: 50, required: false },
  { key: 'be_taken',          label: 'Breakeven level taken before entry', kind: 'kill', sort_order: 60, required: false },
]

/** Slugify free text into a stable key. Mirrors slugify() in server/routes/gate.js. */
export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Human label for a stored key. Free-text contested factors have no config row —
 * the key IS the label, so unslug it rather than showing `news_in_15_min`.
 */
export function labelFor(factors, kind, key) {
  const f = factors.find(x => x.kind === kind && x.key === key)
  if (f) return f.label
  return key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

/** Split the flat factor list into the three sections, in display order. */
export function groupFactors(factors) {
  const out = {}
  for (const kind of ['kill', 'confluence', 'contested']) {
    out[kind] = factors
      .filter(f => f.kind === kind)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key))
  }
  return out
}
