/**
 * Broker commission model for option and share orders.
 *
 * Every option order carries TWO per-contract charges, and both have to be in
 * the number or the basis line lies:
 *
 *     fee(order) = contracts × (per_contract + service_fee) + per_order
 *
 * The broker commission and the regulatory / service transaction fee BOTH scale
 * with size: 3 contracts is 3 × $0.50 + 3 × $0.01 = $1.53, not $1.55. Charged on
 * the way IN and again on the way OUT, so a round trip on one contract is
 * 0.51 + 0.51 = $1.02.
 *
 * `perOrder` is a flat ticket charge and defaults to $0 — Sam's broker does not
 * levy one. It stays in the model because a broker that does charge one charges
 * it once per submitted ticket, which is the only thing the roll combo/legged
 * distinction is about.
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

/**
 * Bumped when the SHAPE of the rate card changes, so a blob written by an older
 * build is recognised and migrated instead of silently misread.
 * v2: the service fee moved from a flat $0.05 ticket to $0.01 per contract.
 */
const VERSION = 2

export const DEFAULT_COMMISSIONS = {
  /** $ per option contract, each side of the trade. Broker commission. */
  perContract: 0.50,
  /** $ per option contract, each side. Regulatory / service transaction fee. */
  serviceFeePerContract: 0.01,
  /** Flat $ per submitted order, regardless of size. $0 at Sam's broker. */
  perOrder: 0,
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

/** Per-contract cost of one side: broker commission plus the service fee. */
export const perContractTotal = (cfg = getCommissions()) =>
  num(cfg.perContract) + num(cfg.serviceFeePerContract)

function normalise(raw = {}) {
  // A blob written before v2 modelled the service fee as a flat $0.05 ticket
  // charge. It is really $0.01 per contract, and there is no ticket charge, so
  // move it rather than carrying a phantom nickel onto every order forever.
  const legacy  = raw && raw.perContract != null && Number(raw.v) !== VERSION
  const service = legacy ? DEFAULT_COMMISSIONS.serviceFeePerContract : raw.serviceFeePerContract
  const order   = legacy ? 0 : raw.perOrder

  return {
    v: VERSION,
    perContract:           raw.perContract == null ? DEFAULT_COMMISSIONS.perContract           : num(raw.perContract),
    serviceFeePerContract: service         == null ? DEFAULT_COMMISSIONS.serviceFeePerContract : num(service),
    perOrder:              order           == null ? DEFAULT_COMMISSIONS.perOrder              : num(order),
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
  return round2(n * perContractTotal(cfg) + num(cfg.perOrder))
}

/**
 * A roll is two option legs, so both per-contract charges land twice. Whether it
 * costs one flat ticket charge or two depends on how it was submitted:
 *
 *   combo  — one spread order, buy-to-close and sell-to-open on a single ticket.
 *            Per-contract on both legs, the flat fee once. This is the default
 *            because it is how a roll is normally sent.
 *   legged — two separate orders, so two ticket charges.
 *
 * With no ticket charge configured (the default) the distinction costs nothing
 * and the two sides come out equal.
 *
 * The flat fee is attached to the CLOSING side so it lands on the leg being
 * resolved, whose realised P&L books immediately. Splitting a nickel across two
 * rows would be worse than arbitrary — it would be unreadable.
 */
export function rollFees(contracts, cfg = getCommissions(), { combo = true } = {}) {
  const n = Math.max(0, Math.round(num(contracts)))
  if (n === 0) return { closeFee: 0, openFee: 0, total: 0 }
  const perLeg   = n * perContractTotal(cfg)
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

/** Human-readable breakdown, e.g. "3 × $0.50 + 3 × $0.01 fee". */
export function feeBreakdown(contracts, cfg = getCommissions(), { includeOrderFee = true } = {}) {
  const n = Math.max(0, Math.round(num(contracts)))
  if (n === 0) return null
  const parts = [`${n} × $${num(cfg.perContract).toFixed(2)}`]
  if (num(cfg.serviceFeePerContract) > 0) {
    parts.push(`${n} × $${num(cfg.serviceFeePerContract).toFixed(2)} fee`)
  }
  if (includeOrderFee && num(cfg.perOrder) > 0) parts.push(`$${num(cfg.perOrder).toFixed(2)} ticket`)
  return parts.join(' + ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence. Kept free of React so the node test runner can import this file.
// ─────────────────────────────────────────────────────────────────────────────

let cache = null
const listeners = new Set()

function persist() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cache))
  } catch { /* private mode / quota — the in-memory value still applies this session */ }
}

export function getCommissions() {
  if (cache) return cache
  let stored = null
  try {
    if (typeof localStorage !== 'undefined') stored = JSON.parse(localStorage.getItem(KEY))
  } catch { stored = null }
  cache = normalise(stored || {})
  // Write the migrated shape straight back, so a v1 blob is migrated once rather
  // than on every load.
  if (stored && Number(stored.v) !== VERSION) persist()
  return cache
}

export function saveCommissions(patch) {
  cache = normalise({ ...getCommissions(), ...patch, v: VERSION })
  persist()
  listeners.forEach(fn => fn(cache))
  return cache
}

export function resetCommissions() {
  return saveCommissions({ ...DEFAULT_COMMISSIONS, v: VERSION })
}

export function subscribeCommissions(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
