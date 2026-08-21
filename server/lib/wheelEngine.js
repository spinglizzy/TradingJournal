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

/** Round to cents — leg P&L lands in a money column and 0.1 + 0.2 is not 0.3. */
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100

/**
 * Booked P&L for every leg of a cycle, keyed by leg id. `null` means "not an
 * outcome yet — do not count this row".
 *
 * A ROLL IS NOT AN OUTCOME. The buy-to-close debit and the credit on the
 * replacement leg are two halves of one position that is still running, so
 * booking the debit the moment the roll is entered reports a loss on a trade
 * that has not finished. That is what made a rolled RGTI put read -$193.55 on
 * the dashboard while the position was, across the roll, up $127.35.
 *
 * So a leg that was rolled INTO a leg that still exists books nothing, and its
 * realised premium is carried forward: whichever leg finally ENDS the chain —
 * expired, assigned, called away, bought back — books the whole chain at once.
 * Lifetime P&L is identical either way. What changes is the timing, and that one
 * roll chain now counts as one trade instead of one per roll.
 *
 * `null` is the marker rather than 0 because 0 is a real, countable outcome: the
 * win/loss split is taken on `pnl + fees`, so a zeroed row still carrying its
 * commissions would be counted as a WIN. NULL is also the convention the
 * `already_logged` seed leg already uses, and every stats query either sums
 * `pnl` (NULL skipped) or filters `pnl IS NOT NULL`.
 *
 * Two kinds of leg come back unchanged, so this is idempotent over a whole
 * cycle: legs still open, and legs deliberately left unbooked — a NULL `pnl` on
 * a leg that neither was rolled nor came out of a roll. That combination is the
 * `already_logged` seed leg and nothing else: `resolveLeg` always writes a
 * figure for a standalone outcome, so the only other way a closed leg holds NULL
 * is that it is part of a chain. Booking the seed leg here would double-count a
 * credit the Trade Log has already recorded on its own row.
 *
 * A rolled leg whose successor was DELETED is not deferred: with nothing left to
 * carry it into, it books on its own. That is what stops a mis-entered roll from
 * silently losing its premium when the replacement leg is removed.
 */
export function legPnl(legs = []) {
  const byId       = new Map(legs.map(l => [l.id, l]))
  const rolledInto = new Set(legs.map(l => l.rolled_from_id).filter(id => id != null))
  const out        = new Map()

  for (const leg of legs) {
    const unresolved           = leg.leg_status === 'open' || leg.status === 'open'
    const deliberatelyUnbooked = leg.pnl == null && leg.leg_status !== 'rolled' && leg.rolled_from_id == null
    if (unresolved || deliberatelyUnbooked) {
      out.set(leg.id, leg.pnl == null ? null : num(leg.pnl))
      continue
    }
    if (leg.leg_status === 'rolled' && rolledInto.has(leg.id)) { out.set(leg.id, null); continue }

    // Walk back up the roll chain, adding every deferred leg's realised premium.
    // `seen` guards a self-referential row rather than trusting the data.
    let total  = legNetPremium(leg)
    const seen = new Set([leg.id])
    let prev   = leg.rolled_from_id != null ? byId.get(leg.rolled_from_id) : null
    while (prev && prev.leg_status === 'rolled' && !seen.has(prev.id)) {
      seen.add(prev.id)
      total += legNetPremium(prev)
      prev = prev.rolled_from_id != null ? byId.get(prev.rolled_from_id) : null
    }
    out.set(leg.id, round2(total))
  }
  return out
}

/**
 * Premium a set of legs has actually settled — what the Wheel tab reports as
 * "banked", and the figure that has to agree with the Playbook's "Wheel Play".
 *
 * It reads `pnl` wherever a leg has one, so a roll chain contributes its
 * rolled-up total on the leg that ended it and nothing on the rolls in between.
 * The fallback to `legNetPremium` covers the `already_logged` leg, which carries
 * real premium that the journal books on another row; a leg deferred into a live
 * roll chain contributes zero, because that money is not settled until the chain
 * ends. So does an open leg: its credit can still be bought back at a loss. The
 * callers filter to closed legs already, but the name promises settled money and
 * the function should keep that promise on its own.
 */
export function settledPremium(legs = []) {
  return legs.reduce((acc, leg) => {
    if (leg.pnl != null) return acc + num(leg.pnl)
    if (leg.leg_status === 'rolled' || leg.leg_status === 'open' || leg.status === 'open') return acc
    return acc + legNetPremium(leg)
  }, 0)
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
