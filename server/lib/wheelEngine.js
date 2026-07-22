/**
 * Wheel basis engine — pure functions, no I/O.
 *
 * Every number that the Wheel tab shows comes from here. The Strike Selection
 * Calculator consumes `effectiveBasis()`'s output; it never recomputes basis.
 *
 * Conventions (spec §6) — these are load-bearing, do not "tidy" them away:
 *   - Shares per contract = 100.
 *   - `premium` is the TOTAL dollars for the leg. Selling to open is a positive
 *     credit. `close_cost` is the TOTAL dollars paid to buy the leg back
 *     (rolling or plain close), stored positive.
 *   - A leg's realised premium is therefore `premium - close_cost`, so a roll
 *     that costs more to close than the new leg brings in nets negative, exactly
 *     as it should.
 */

export const SHARES_PER_CONTRACT = 100

const num = (v) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v))

/** Shares controlled by a contract count. */
export function sharesFor(contracts) {
  return Math.round(num(contracts)) * SHARES_PER_CONTRACT
}

/**
 * Realised premium for a single leg: opening credit, less any buy-to-close
 * debit, less commissions. Positive = the leg made money on premium.
 *
 * Fees belong in here rather than only on the trade row's P&L. The basis line is
 * a break-even, and a break-even that ignores commissions is not one — it would
 * read low by exactly the fees, in the direction that makes a marginal strike
 * look safer than it is.
 */
export function legNetPremium(leg) {
  return num(leg?.premium) - num(leg?.close_cost) - num(leg?.fees)
}

/** Sum of `legNetPremium` across legs. */
export function sumLegPremium(legs = []) {
  return legs.reduce((acc, leg) => acc + legNetPremium(leg), 0)
}

/**
 * Effective cost basis per share — the break-even line every covered-call strike
 * is compared against.
 *
 *   B = avg_assigned_strike - (net_premium / shares)
 *
 * Returns null when no shares are held: there is no basis to speak of, and
 * callers must not silently substitute zero (spec §9.12).
 */
export function effectiveBasis({ shares, avgAssignedStrike, netPremium }) {
  const n = Math.round(num(shares))
  if (n <= 0) return null
  if (avgAssignedStrike == null) return null
  return num(avgAssignedStrike) - num(netPremium) / n
}

/**
 * Share-weighted average of assignment strikes after adding a new lot.
 * Returns the rolled-up { shares, avgAssignedStrike } for the cycle.
 */
export function addLot({ shares, avgAssignedStrike }, lot) {
  const heldBefore = Math.round(num(shares))
  const lotShares  = Math.round(num(lot.shares))
  const totalShares = heldBefore + lotShares
  if (totalShares <= 0) return { shares: 0, avgAssignedStrike: null }

  const weightedBefore = heldBefore > 0 ? num(avgAssignedStrike) * heldBefore : 0
  return {
    shares: totalShares,
    avgAssignedStrike: (weightedBefore + num(lot.assigned_strike) * lotShares) / totalShares,
  }
}

/** Same rollup, computed from scratch over a list of lots. Used for audit/repair. */
export function rollupLots(lots = []) {
  return lots.reduce(
    (acc, lot) => addLot(acc, lot),
    { shares: 0, avgAssignedStrike: null }
  )
}

/**
 * Book a share exit — called away at a strike, or sold at a price.
 *
 * Handles the partial case (holding 200, writing 1 call) by attributing premium
 * pro rata to the shares that leave. Because `shares` and `netPremium` are
 * scaled by the same factor, the effective basis B of the remaining shares is
 * unchanged by a partial exit, which is the correct behaviour.
 *
 * @returns {{
 *   sharesOut: number, bookedPnl: number, premiumAttributed: number,
 *   shares: number, netPremium: number, avgAssignedStrike: number|null, flat: boolean
 * }}
 */
export function bookShareExit({ shares, avgAssignedStrike, netPremium }, { exitPrice, sharesOut }) {
  const held = Math.round(num(shares))
  if (held <= 0) throw new Error('No shares held to exit')

  const out = Math.min(Math.round(num(sharesOut)) || held, held)
  const fraction = out / held

  const premiumAttributed = num(netPremium) * fraction
  const shareGain         = out * (num(exitPrice) - num(avgAssignedStrike))
  const bookedPnl         = shareGain + premiumAttributed

  const remaining = held - out
  return {
    sharesOut: out,
    shareGain,
    premiumAttributed,
    bookedPnl,
    shares: remaining,
    netPremium: num(netPremium) - premiumAttributed,
    avgAssignedStrike: remaining > 0 ? num(avgAssignedStrike) : null,
    flat: remaining === 0,
  }
}

/**
 * Total realised P&L for a cycle closed in one exit — the spec §8 formula.
 * Kept as a standalone function because it is the thing worth testing directly:
 *
 *   realized_pnl = shares × (exit_price - avg_assigned_strike) + net_premium
 *
 * `bookShareExit` reduces to exactly this when the whole position leaves at once.
 */
export function realizedPnl({ shares, avgAssignedStrike, netPremium, exitPrice }) {
  const n = Math.round(num(shares))
  if (n <= 0) return num(netPremium) // never assigned: the premium is the whole story
  return n * (num(exitPrice) - num(avgAssignedStrike)) + num(netPremium)
}

/**
 * A cycle is over when the shares are gone and nothing is still open against it.
 * Getting this wrong is spec §13's second teething issue: a cycle that fails to
 * close drags old realised premium into the next run's basis, so the break-even
 * line reads artificially low and the safety flag lies.
 */
export function isCycleFlat({ shares, legs = [] }) {
  return Math.round(num(shares)) === 0 && !legs.some(l => l.leg_status === 'open')
}

/** Days between two 'YYYY-MM-DD' strings (b - a), calendar days, UTC-safe. */
export function daysBetween(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.round(ms / 86_400_000)
}

/** Days to expiry from a reference date (default today, in the caller's clock). */
export function dte(expiry, from = new Date().toISOString().slice(0, 10)) {
  return daysBetween(from, expiry)
}

/**
 * Derive the display shape for one cycle from its stored fields + legs.
 * This is what the API hands the client.
 */
export function describeCycle(cycle, legs = [], today) {
  const openLegs    = legs.filter(l => l.leg_status === 'open')
  const openExpiries = openLegs.map(l => l.expiry).filter(Boolean).sort()
  const basis = effectiveBasis({
    shares: cycle.shares,
    avgAssignedStrike: cycle.avg_assigned_strike,
    netPremium: cycle.net_premium,
  })

  return {
    ...cycle,
    basis,
    open_legs: openLegs.length,
    gross_premium: sumLegPremium(legs),
    next_expiry: openExpiries[0] ?? null,
    days_to_next_expiry: openExpiries.length ? dte(openExpiries[0], today) : null,
  }
}
