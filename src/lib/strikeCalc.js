/**
 * Strike Selection Calculator — pure math (spec §9).
 *
 * Everything here is PER SHARE. The caller multiplies by N for dollar figures;
 * the UI must carry a persistent unit label, because per-share vs per-contract
 * is the single most likely data-entry error in this whole feature (spec §6).
 *
 * This module CONSUMES the basis engine's `B`. It never derives basis itself.
 * When `B` is null (nothing assigned yet) the safety check is skipped and the
 * caller is told so — B is never silently defaulted to zero (spec §9.12).
 */

export const DEFAULT_THRESHOLD_PCT    = 0.015 // 1.5% of basis — scales with price
export const DEFAULT_MIN_WEEKLY_PREM  = 0.07  // per share, per week

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

/** Calendar days to expiry. Both args 'YYYY-MM-DD'. */
export function dte(expiry, from) {
  const today = from || new Date().toISOString().slice(0, 10)
  const ms = Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)
  return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000)
}

/**
 * Value per share at expiry for a covered call written at strike K for premium P.
 * Shares are capped at K if the call finishes in the money.
 */
export function valueAtExpiry(sExp, K, P) {
  return Math.min(sExp, K) + P
}

/** Price above which the higher strike outperforms the lower one. */
export function crossover(lower, higher) {
  return lower.strike + (lower.premium - higher.premium)
}

/**
 * Breakeven probability implied by the premium the market charges for the gap
 * between two strikes.
 *
 *   impliedProb = (P1 - P2) / (K2 - K1)
 *
 * SIMPLIFICATION, and it must be labelled as one in the UI. This is the
 * breakeven for a binary framing — finish below K1, or finish above K2 — and it
 * ignores the middle zone entirely. Between `crossover` and K2 the higher strike
 * is already winning without ever being called, so the true threshold you need
 * to beat is LOWER than this figure. The bias is conservative (it makes the
 * higher strike look worse than it is), which is an acceptable default, but the
 * user has to know it is there.
 */
export function impliedProb(lower, higher) {
  const width = higher.strike - lower.strike
  if (width === 0) return null
  return (lower.premium - higher.premium) / width
}

/**
 * Time normalisation (spec §9.7). Without this a longer-dated candidate always
 * looks fatter purely because it holds more time, and weekly-vs-monthly
 * comparisons are meaningless.
 */
export function annualised({ premium, strike, basis, days }) {
  if (!basis || !days || days <= 0) return { premiumYield: null, calledReturn: null }
  const scale = 365 / days
  return {
    premiumYield: (premium / basis) * scale,
    calledReturn: ((strike + premium - basis) / basis) * scale,
  }
}

/**
 * Basis safety check (spec §9.8).
 *
 * `separation` is measured BEFORE this candidate's premium is applied. That is
 * the whole point: a call whose own premium is the only thing lifting the basis
 * under its strike is the exact failure mode this flag exists to catch, and the
 * amber band names that situation rather than mislabelling it as a loss.
 */
export function safetyFlag({ strike, premium, basis, thresholdPct = DEFAULT_THRESHOLD_PCT }) {
  if (basis == null) {
    return {
      level: 'unknown',
      separation: null,
      netIfCalled: null,
      message: 'No assignment recorded yet — no cost basis to check this strike against.',
    }
  }

  const separation  = strike - basis
  const netIfCalled = strike + premium - basis
  const threshold   = basis * thresholdPct
  const f = (v) => `$${Math.abs(v).toFixed(2)}`

  if (netIfCalled < 0) {
    return {
      level: 'red', separation, netIfCalled, threshold,
      message: `Called away books a loss of ${f(netIfCalled)} per share even including this premium.`,
    }
  }
  if (separation < 0) {
    return {
      level: 'amber', separation, netIfCalled, threshold,
      message: `Strike sits ${f(separation)} below basis — only this premium (${f(premium)}) makes it profitable. Net +${f(netIfCalled)} if called.`,
    }
  }
  if (separation < threshold) {
    return {
      level: 'amber', separation, netIfCalled, threshold,
      message: `Thin margin — only ${f(separation)} above basis (threshold ${f(threshold)}).`,
    }
  }
  return {
    level: 'green', separation, netIfCalled, threshold,
    message: `Clear separation — ${f(separation)} above basis.`,
  }
}

/**
 * Dead-chain test (spec §9.9). The floor scales with DTE: $0.07 is a WEEKLY
 * figure, so a 45-day contract at $0.30 must not pass just because the raw
 * number is bigger.
 */
export function deadChain({ premium, days, minWeeklyPremium = DEFAULT_MIN_WEEKLY_PREM }) {
  if (!days || days <= 0) return { dead: false, weeklyEquivalent: null }
  const weeklyEquivalent = premium * (7 / days)
  return { dead: weeklyEquivalent < minWeeklyPremium, weeklyEquivalent, minWeeklyPremium }
}

/**
 * One-line guidance derived from where basis sits relative to the chain — not
 * from premium size (spec §9.9).
 */
export function guidance({ candidates, basis }) {
  if (!candidates.length) return null

  const allDead = candidates.every(c => c.deadChain.dead)
  if (allDead) {
    return {
      tone: 'warn',
      text: 'Chain is dead — every candidate pays less than the weekly premium floor. Sitting flat this week is a legitimate option; a week of surrendered optionality costs more than this credit.',
    }
  }

  if (basis == null) {
    return {
      tone: 'neutral',
      text: 'No cost basis recorded, so there is no break-even line to lean against. Compare on annualised return and cushion alone.',
    }
  }

  const strikes = candidates.map(c => c.strike)
  const lowest  = Math.min(...strikes)
  const highest = Math.max(...strikes)

  if (basis > highest) {
    return {
      tone: 'lower',
      text: 'Basis sits above every candidate strike — lean lower. Grind the basis down; capital preservation is the job here, not upside.',
    }
  }
  if (basis < lowest) {
    return {
      tone: 'higher',
      text: 'Basis sits below every candidate strike — lean higher. Safety is already bought and paid for; take the upside room.',
    }
  }
  return {
    tone: 'neutral',
    text: 'Basis sits inside the candidate range — strikes below it only clear on premium. Check each separation flag before writing.',
  }
}

/**
 * Main entry point.
 *
 * @param {object}   input
 * @param {number|null} input.basis   B, per share, from the basis engine. null if unassigned.
 * @param {number}   input.shares     N
 * @param {number|null} input.underlying  S, manual in v1 (no quote feed)
 * @param {Array}    input.candidates [{ strike, premium, expiry, delta? }] — premium PER SHARE
 * @param {string}   [input.today]    'YYYY-MM-DD' override, for tests
 * @param {number}   [input.thresholdPct]
 * @param {number}   [input.minWeeklyPremium]
 */
export function analyseStrikes({
  basis,
  shares,
  underlying,
  candidates: raw = [],
  today,
  thresholdPct = DEFAULT_THRESHOLD_PCT,
  minWeeklyPremium = DEFAULT_MIN_WEEKLY_PREM,
}) {
  const N = num(shares) || 0
  const B = num(basis)
  const S = num(underlying)
  const errors = []
  const warnings = []

  // Keep only rows the user has actually filled in, then sort by strike so
  // "lower" / "higher" language is always true regardless of entry order.
  const parsed = raw
    .map((c, i) => ({
      index: i,
      strike:  num(c.strike),
      premium: num(c.premium),
      expiry:  c.expiry || null,
      delta:   num(c.delta),
    }))
    .filter(c => c.strike != null && c.premium != null)
    .sort((a, b) => a.strike - b.strike)

  if (parsed.length < 2) {
    return {
      ready: false, errors, warnings,
      candidates: [], pairs: [], basis: B, shares: N, underlying: S,
      differingExpiries: false, guidance: null, chart: [],
    }
  }

  // Duplicate strikes are genuinely invalid — K2 - K1 == 0 has no crossover.
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].strike === parsed[i - 1].strike) {
      errors.push(`Two candidates share strike $${parsed[i].strike.toFixed(2)} — strikes must differ.`)
    }
  }

  const expiries = [...new Set(parsed.map(c => c.expiry).filter(Boolean))]
  const differingExpiries = expiries.length > 1

  const candidates = parsed.map(c => {
    const days = c.expiry ? dte(c.expiry, today) : null
    const ann  = annualised({ premium: c.premium, strike: c.strike, basis: B, days })
    return {
      ...c,
      days,
      calledProfitPerShare: B == null ? null : c.strike + c.premium - B,
      calledProfit:         B == null ? null : (c.strike + c.premium - B) * N,
      calledProfitPct:      B == null ? null : (c.strike + c.premium - B) / B,
      cushion:              c.premium,
      cushionTotal:         c.premium * N,
      premiumTotal:         c.premium * N,
      annualisedPremiumYield: ann.premiumYield,
      annualisedCalledReturn: ann.calledReturn,
      safety:    safetyFlag({ strike: c.strike, premium: c.premium, basis: B, thresholdPct }),
      deadChain: deadChain({ premium: c.premium, days, minWeeklyPremium }),
    }
  })

  if (candidates.some(c => c.days != null && c.days <= 0)) {
    warnings.push('A candidate expires today or earlier — annualised figures are omitted for it.')
  }

  // Crossovers pairwise between ADJACENT strikes (spec §9.12).
  const pairs = []
  for (let i = 0; i < candidates.length - 1; i++) {
    const lower  = candidates[i]
    const higher = candidates[i + 1]
    if (higher.strike === lower.strike) continue

    const certainCost = (lower.premium - higher.premium) * N
    if (lower.premium <= higher.premium) {
      // Legitimate on thin chains with wide spreads — warn, do not reject.
      warnings.push(
        `$${higher.strike.toFixed(2)} is quoted at or above the $${lower.strike.toFixed(2)} premium — check your quotes. The comparison still runs, but the usual "give up premium for upside" tradeoff is inverted.`
      )
    }

    const deltas = lower.delta != null && higher.delta != null
      ? (lower.delta + higher.delta) / 2
      : null

    pairs.push({
      lower, higher,
      crossover:   crossover(lower, higher),
      impliedProb: impliedProb(lower, higher),
      avgDelta:    deltas,
      certainCost,
      width: higher.strike - lower.strike,
    })
  }

  // Payoff chart series — value per share vs price at expiry.
  const strikes = candidates.map(c => c.strike)
  const anchors = [B, S, ...strikes, ...pairs.map(p => p.crossover)].filter(v => v != null && v > 0)
  const lo = Math.max(0, Math.min(...anchors) * 0.88)
  const hi = Math.max(...anchors) * 1.12
  const STEPS = 80
  const chart = Array.from({ length: STEPS + 1 }, (_, i) => {
    const price = lo + ((hi - lo) * i) / STEPS
    const point = { price }
    candidates.forEach(c => { point[`k${c.index}`] = valueAtExpiry(price, c.strike, c.premium) })
    return point
  })

  return {
    ready: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)],
    candidates,
    pairs,
    basis: B,
    shares: N,
    underlying: S,
    differingExpiries,
    guidance: guidance({ candidates, basis: B }),
    chart,
    chartDomain: [lo, hi],
  }
}

/**
 * Build the snapshot persisted alongside the resulting trade row (spec §9.11).
 * Stored so that, once the cycle closes, the actual outcome can be compared
 * against the strike NOT chosen — not to induce regret over near-EV-neutral
 * calls, but to surface systematic bias across many cycles.
 */
export function buildSnapshot(analysis, chosenStrike) {
  const firstPair = analysis.pairs[0]
  const chosen = analysis.candidates.find(c => c.strike === chosenStrike)
  return {
    candidates: analysis.candidates.map(c => ({
      strike: c.strike, premium: c.premium, delta: c.delta ?? null, expiry: c.expiry,
    })),
    chosen: chosenStrike,
    basis_at_decision:      analysis.basis,
    underlying_at_decision: analysis.underlying,
    expiry:      chosen?.expiry ?? null,
    crossover:   firstPair?.crossover ?? null,
    implied_prob: firstPair?.impliedProb ?? null,
    recorded_at: new Date().toISOString(),
  }
}
