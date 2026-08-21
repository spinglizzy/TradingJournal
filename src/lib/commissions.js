/**
 * Broker commission model for option and share orders.
 *
 * Sam's broker charges TWO things on every option order, and both have to be in
 * the number or the basis line lies:
 *
 *     fee(order) = contracts × per_contract + per_order
 *
 * The per-contract slice scales with size (0.50 × 100 contracts = $50.00); the
 * per-order slice is a flat ticket charge (a nickel) that lands once no matter
 * how big the order is. Charged on the way IN and again on the way OUT, so a
 * round trip on one contract is 0.50 + 0.05 + 0.50 + 0.05 = $1.10, not $1.00.
 *
 * These are DEFAULTS used to pre-fill the fee field on every action. The number
 * that actually books is whatever sits in the field when the form is submitted —
 * a manual override always wins, because the fill is the fill.
 *
 * Stored in localStorage rather than the database: these are entry conveniences,
 * not records. The fee that matters is written to `trades.fees` per leg, which
 * is persisted and is what `legNetPremium()` subtracts from the cost basis.
 */

const KEY = 'wheel_commissions'

export const DEFAULT_COMMISSIONS = {
  /** $ per option contract, each side of the trade. */
  perContract: 0.50,
  /** Flat $ per submitted order, regardless of size. Charged per ticket. */
  perOrder: 0.05,
  /** $ charged when a put is assigned or a call is exercised against you. */
  assignmentFee: 0,
  /** Flat $ on a share order — selling the stock out of a cycle. */
  shareOrderFee: 0,
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Round to cents. Fee arithmetic is money, and 0.1+0.2 is not 0.3. */
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100

function normalise(raw = {}) {
  return {
    perContract:   raw.perContract   == null ? DEFAULT_COMMISSIONS.perContract   : num(raw.perContract),
    perOrder:      raw.perOrder      == null ? DEFAULT_COMMISSIONS.perOrder      : num(raw.perOrder),
    assignmentFee: raw.assignmentFee == null ? DEFAULT_COMMISSIONS.assignmentFee : num(raw.assignmentFee),
    shareOrderFee: raw.shareOrderFee == null ? DEFAULT_COMMISSIONS.shareOrderFee : num(raw.shareOrderFee),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The estimators. Pure — `cfg` in, dollars out.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commission on ONE option order of `contracts` contracts.
 * Zero contracts means no order was placed, so no ticket charge either.
 */
export function optionOrderFee(contracts, cfg = getCommissions()) {
  const n = Math.max(0, Math.round(num(contracts)))
  if (n === 0) return 0
  return round2(n * num(cfg.perContract) + num(cfg.perOrder))
}

/**
 * A roll is two option legs. Whether it costs one ticket charge or two depends
 * on how it was submitted:
 *
 *   combo  — one spread order, buy-to-close and sell-to-open on a single ticket.
 *            Per-contract on both legs, the flat fee once. This is the default
 *            because it is how a roll is normally sent.
 *   legged — two separate orders, so two ticket charges.
 *
 * The flat fee is attached to the CLOSING side so it lands on the leg being
 * resolved, whose realised P&L books immediately. Splitting a nickel across two
 * rows would be worse than arbitrary — it would be unreadable.
 */
export function rollFees(contracts, cfg = getCommissions(), { combo = true } = {}) {
  const n = Math.max(0, Math.round(num(contracts)))
  if (n === 0) return { closeFee: 0, openFee: 0, total: 0 }
  const perLeg   = n * num(cfg.perContract)
  const closeFee = round2(perLeg + num(cfg.perOrder))
  const openFee  = round2(perLeg + (combo ? 0 : num(cfg.perOrder)))
  return { closeFee, openFee, total: round2(closeFee + openFee) }
}

/** Commission when shares arrive (put assigned) or leave (call exercised). */
export function assignmentFee(cfg = getCommissions()) {
  return round2(num(cfg.assignmentFee))
}

/** Commission on a share order — selling stock out of a cycle. */
export function shareOrderFee(cfg = getCommissions()) {
  return round2(num(cfg.shareOrderFee))
}

/** Human-readable breakdown, e.g. "3 × $0.50 + $0.05 ticket". */
export function feeBreakdown(contracts, cfg = getCommissions(), { includeOrderFee = true } = {}) {
  const n = Math.max(0, Math.round(num(contracts)))
  if (n === 0) return null
  const parts = [`${n} × $${num(cfg.perContract).toFixed(2)}`]
  if (includeOrderFee && num(cfg.perOrder) > 0) parts.push(`$${num(cfg.perOrder).toFixed(2)} ticket`)
  return parts.join(' + ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence. Kept free of React so the node test runner can import this file.
// ─────────────────────────────────────────────────────────────────────────────

let cache = null
const listeners = new Set()

export function getCommissions() {
  if (cache) return cache
  let stored = null
  try {
    if (typeof localStorage !== 'undefined') stored = JSON.parse(localStorage.getItem(KEY))
  } catch { stored = null }
  cache = normalise(stored || {})
  return cache
}

export function saveCommissions(patch) {
  cache = normalise({ ...getCommissions(), ...patch })
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cache))
  } catch { /* private mode / quota — the in-memory value still applies this session */ }
  listeners.forEach(fn => fn(cache))
  return cache
}

export function resetCommissions() {
  return saveCommissions(DEFAULT_COMMISSIONS)
}

export function subscribeCommissions(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
