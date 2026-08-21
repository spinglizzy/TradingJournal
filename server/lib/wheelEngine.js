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
 *
 * This is a confirmed product requirement, not an implementation detail: Sam
 * wants commissions inside the cost basis. `wheel-tests.mjs` asserts both the
 * value and the direction. Do not drop `fees` from this expression.
 */
export function legNetPremium(leg) {
  return num(leg?.premium) - num(leg?.close_cost) - num(leg?.fees)
}

/** Sum of `legNetPremium` across legs. */
export function sumLegPremium(legs = []) {
  return legs.reduce((acc, leg) => acc + legNetPremium(leg), 0)
}

/** Round to cents — money columns, and 0.1 + 0.2 is not 0.3. */
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100

/**
 * THE UNIT OF P&L IS THE CYCLE, NOT THE LEG.
 *
 * Sam's rule, in his words: *"that's why it's called the wheel play — if I've
 * still got the shares then it's still continuing."* A wheel run is one trade
 * that happens to be made of many contracts. Selling a put, rolling it,
 * being assigned, writing calls against the shares and finally letting them go
 * are stages of that one trade, not separate wins and losses, and the journal
 * must not claim a result for any of them while the run is still open.
 *
 * Booking per leg got this wrong in both directions. A defensive ROLL booked the
 * buy-to-close debit on its own, so RGTI read -$193.55 while the position was,
 * across the roll, up $127.35. An ASSIGNMENT booked the put's premium as a win
 * on the day Sam got handed stock he still owns. And because share P&L was only
 * ever recorded on the cycle, HL's -$600 call-away loss never reached the
 * dashboard at all while its $713.20 of premium did.
 *
 * So: every leg carries `pnl = NULL` for its whole life, and a cycle that has
 * gone flat books exactly one figure — this one — on a single summary row.
 *
 * `already_logged` legs are the one subtraction. That flag marks a put
 * reconstructed from before the Wheel tab existed, whose premium is already
 * sitting on its own row in the Trade Log; the basis engine needs the premium,
 * but counting it here as well would book the same credit twice.
 *
 * Returns null for a cycle that is still running — there is no result yet.
 */
export function cycleJournalPnl(cycle, legs = []) {
  if (!cycle || cycle.status !== 'closed') return null
  const bookedElsewhere = legs
    .filter(l => l.premium_already_logged)
    .reduce((acc, l) => acc + legNetPremium(l), 0)
  return round2(num(cycle.realized_pnl) - bookedElsewhere)
}

/**
 * Premium a still-running cycle has already settled — real money in the account
 * that the journal has not booked yet, shown in the Wheel tab so a long run does
 * not look like it has produced nothing.
 *
 * A leg that has been rolled into a leg that is STILL OPEN does not count, and
 * neither does anything further back up that chain. Its buy-to-close debit is
 * paid, but the credit that offsets it is sitting in a contract that can still
 * be bought back at any price — reporting the debit alone is the same lie that
 * made a rolled RGTI put read as a $193.55 loss. Once the chain ends, all of it
 * counts at once.
 *
 * Pass the cycle's legs, open ones included: an open leg is what marks its whole
 * chain unsettled, so filtering to closed legs first would defeat this.
 */
export function bankedPremium(legs = []) {
  const byId      = new Map(legs.map(l => [l.id, l]))
  const isOpen    = (l) => l.leg_status === 'open' || l.status === 'open'
  const unsettled = new Set()

  for (const leg of legs) {
    if (!isOpen(leg)) continue
    let prev = leg.rolled_from_id != null ? byId.get(leg.rolled_from_id) : null
    while (prev && !unsettled.has(prev.id)) {
      unsettled.add(prev.id)
      prev = prev.rolled_from_id != null ? byId.get(prev.rolled_from_id) : null
    }
  }

  return legs.reduce(
    (acc, leg) => (isOpen(leg) || unsettled.has(leg.id) ? acc : acc + legNetPremium(leg)),
    0
  )
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
 * Two treatments of a PARTIAL exit, because they answer different questions:
 *
 *   pro rata (default, `retainGain` false) — premium is attributed to the shares
 *     that leave in proportion to the size of the exit, and the P&L books now.
 *     `shares` and `netPremium` scale by the same factor, so the effective basis
 *     B of the remaining shares is unchanged. This is what a partial call-away
 *     does: the contract took those shares, the run on them is over.
 *
 *   retained (`retainGain` true) — nothing books; the full premium stays with
 *     the cycle and the gain on the departed shares is added to it. The basis of
 *     the survivors therefore falls to
 *
 *         B_new = B_old - (sharesOut / remaining) x (exitPrice - B_old)
 *
 *     which is exactly "sell some, keep the profit in the position to bring the
 *     cost basis down". This is Sam's confirmed intent for a manual partial sale
 *     (see the `sell-shares` route). Nothing is lost by deferring: when the cycle
 *     finally goes flat the carried amount books in full, so lifetime P&L is
 *     identical to the pro-rata path — `wheel-tests.mjs` asserts that identity.
 *
 * A full exit ignores `retainGain`: with no shares left there is nothing to carry
 * the gain, so everything books either way.
 *
 * `fees` is the commission on the share order itself. It comes off the gain on
 * the departed shares, which puts it in the right place on BOTH paths without
 * needing a new accumulator: on the pro-rata path it lands in `bookedPnl` (and
 * so in `realized_pnl`), and on the retained path it lands in `retainedGain`
 * (and so in the running premium), where it correctly leaves the survivors'
 * basis a touch higher than a free sale would have.
 *
 * @returns {{
 *   sharesOut: number, bookedPnl: number, premiumAttributed: number,
 *   retainedGain: number, shares: number, netPremium: number,
 *   avgAssignedStrike: number|null, flat: boolean
 * }}
 */
export function bookShareExit({ shares, avgAssignedStrike, netPremium }, { exitPrice, sharesOut, retainGain = false, fees = 0 }) {
  const held = Math.round(num(shares))
  if (held <= 0) throw new Error('No shares held to exit')

  const out       = Math.min(Math.round(num(sharesOut)) || held, held)
  const remaining = held - out
  const shareGain = out * (num(exitPrice) - num(avgAssignedStrike)) - num(fees)

  if (retainGain && remaining > 0) {
    return {
      sharesOut: out,
      shareGain,
      premiumAttributed: 0,
      retainedGain: shareGain,
      bookedPnl: 0,
      shares: remaining,
      netPremium: num(netPremium) + shareGain,
      avgAssignedStrike: num(avgAssignedStrike),
      flat: false,
    }
  }

  const premiumAttributed = num(netPremium) * (out / held)
  const bookedPnl         = shareGain + premiumAttributed

  return {
    sharesOut: out,
    shareGain,
    premiumAttributed,
    retainedGain: 0,
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
 *   realized_pnl = shares × (exit_price - avg_assigned_strike) + net_premium - fees
 *
 * `net_premium` already carries every option leg's commission (see
 * `legNetPremium`); `fees` here is only the share order's own commission.
 *
 * `bookShareExit` reduces to exactly this when the whole position leaves at once.
 */
export function realizedPnl({ shares, avgAssignedStrike, netPremium, exitPrice, fees = 0 }) {
  const n = Math.round(num(shares))
  if (n <= 0) return num(netPremium) - num(fees) // never assigned: the premium is the whole story
  return n * (num(exitPrice) - num(avgAssignedStrike)) + num(netPremium) - num(fees)
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
