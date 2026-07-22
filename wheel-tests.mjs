/**
 * Wheel tracker — engine + calculator tests.
 *
 *   node wheel-tests.mjs
 *
 * Pure math only, no database. Covers the spec's worked example (§8.1), the
 * partial call-away path, and every branch of the strike-selection module that
 * the spec singles out as a correction to the original design.
 */
import {
  legNetPremium, sumLegPremium, effectiveBasis, addLot, rollupLots,
  bookShareExit, realizedPnl, isCycleFlat, sharesFor,
} from './server/lib/wheelEngine.js'
import {
  analyseStrikes, crossover, impliedProb, safetyFlag, deadChain,
  annualised, valueAtExpiry, buildSnapshot,
} from './src/lib/strikeCalc.js'

let passed = 0, failed = 0
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

function check(name, actual, expected) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? near(actual, expected)
    : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

function group(title, fn) { console.log(`\n${title}`); fn() }

// ─────────────────────────────────────────────────────────────────────────────
group('§8.1 worked example — HL, end to end', () => {
  // 1. Sell CSP HL $17.50 for +$30 (1 contract)
  let legs = [{ premium: 30, close_cost: null, leg_status: 'open' }]
  check('net premium after CSP', sumLegPremium(legs), 30)

  // 2. Assigned -> 100 sh @ 17.50
  legs[0].leg_status = 'assigned'
  const afterAssign = addLot({ shares: 0, avgAssignedStrike: null }, { shares: 100, assigned_strike: 17.50 })
  check('shares held', afterAssign.shares, 100)
  check('avg assigned strike', afterAssign.avgAssignedStrike, 17.50)
  check('basis B = 17.50 - 30/100', effectiveBasis({ ...afterAssign, netPremium: 30 }), 17.20)

  // 3. Sell CC $18.00 for +$25
  legs.push({ premium: 25, close_cost: null, leg_status: 'open' })
  check('net premium after CC', sumLegPremium(legs), 55)
  check('basis B = 17.50 - 55/100', effectiveBasis({ ...afterAssign, netPremium: 55 }), 16.95)

  // 4. Called away at $18
  check('realized P&L = 100 x (18 - 17.50) + 55',
    realizedPnl({ shares: 100, avgAssignedStrike: 17.50, netPremium: 55, exitPrice: 18 }), 105)

  const exit = bookShareExit(
    { shares: 100, avgAssignedStrike: 17.50, netPremium: 55 },
    { exitPrice: 18, sharesOut: 100 }
  )
  check('bookShareExit agrees with realizedPnl', exit.bookedPnl, 105)
  check('cycle goes flat', exit.flat, true)
  check('net premium fully attributed', exit.netPremium, 0)
})

group('Conventions', () => {
  check('100 shares per contract', sharesFor(3), 300)
  check('roll debit nets against credit', legNetPremium({ premium: 30, close_cost: 12 }), 18)
  check('net-debit roll goes negative', legNetPremium({ premium: 10, close_cost: 45 }), -35)
  // Commissions must reach the basis line — a break-even that ignores them
  // reads low, in the direction that flatters a marginal strike.
  check('fees reduce realised premium', legNetPremium({ premium: 30, fees: 1.30 }), 28.7)
  check('fees, debit and credit together', legNetPremium({ premium: 30, close_cost: 12, fees: 2 }), 16)
  check('missing fees treated as zero', legNetPremium({ premium: 30 }), 30)
  check('no basis without shares', effectiveBasis({ shares: 0, avgAssignedStrike: null, netPremium: 30 }), null)
  check('basis is null, never 0', effectiveBasis({ shares: 0, avgAssignedStrike: 17, netPremium: 0 }), null)
})

group('Losing wheel books a loss', () => {
  // Assigned 100 @ 30, collected 200 premium, called away at 25.
  check('negative realized P&L',
    realizedPnl({ shares: 100, avgAssignedStrike: 30, netPremium: 200, exitPrice: 25 }), -300)
})

group('Multiple assignments average share-weighted', () => {
  const rolled = rollupLots([
    { shares: 100, assigned_strike: 17.50 },
    { shares: 200, assigned_strike: 16.00 },
  ])
  check('300 shares', rolled.shares, 300)
  check('avg = (100*17.5 + 200*16)/300', rolled.avgAssignedStrike, (100 * 17.5 + 200 * 16) / 300)
})

group('Partial call-away leaves basis unchanged', () => {
  // 200 shares @ 20 avg, $400 net premium -> B = 20 - 400/200 = 18.00
  const before = { shares: 200, avgAssignedStrike: 20, netPremium: 400 }
  check('basis before', effectiveBasis(before), 18)

  const exit = bookShareExit(before, { exitPrice: 22, sharesOut: 100 })
  check('half the premium attributed', exit.premiumAttributed, 200)
  check('booked = 100*(22-20) + 200', exit.bookedPnl, 400)
  check('100 shares remain', exit.shares, 100)
  check('cycle not flat', exit.flat, false)
  check('basis unchanged after partial exit',
    effectiveBasis({ shares: exit.shares, avgAssignedStrike: exit.avgAssignedStrike, netPremium: exit.netPremium }), 18)

  // Selling the rest at the same price must total the same as one exit at once.
  const rest = bookShareExit(
    { shares: exit.shares, avgAssignedStrike: exit.avgAssignedStrike, netPremium: exit.netPremium },
    { exitPrice: 22, sharesOut: 100 }
  )
  check('two partial exits == one full exit',
    exit.bookedPnl + rest.bookedPnl,
    realizedPnl({ ...before, exitPrice: 22 }))
})

group('Cycle boundary detection', () => {
  check('flat with no shares and no open legs',
    isCycleFlat({ shares: 0, legs: [{ leg_status: 'expired' }] }), true)
  check('not flat while a leg is open',
    isCycleFlat({ shares: 0, legs: [{ leg_status: 'open' }] }), false)
  check('not flat while shares are held',
    isCycleFlat({ shares: 100, legs: [{ leg_status: 'assigned' }] }), false)
})

// ─────────────────────────────────────────────────────────────────────────────
group('§9.4 crossover', () => {
  const K1 = { strike: 16.00, premium: 0.24 }
  const K2 = { strike: 17.00, premium: 0.12 }
  check('crossover = K1 + (P1 - P2)', crossover(K1, K2), 16.12)
  check('below crossover the lower strike wins',
    valueAtExpiry(16.05, K1.strike, K1.premium) > valueAtExpiry(16.05, K2.strike, K2.premium), true)
  check('above crossover the higher strike wins',
    valueAtExpiry(16.50, K2.strike, K2.premium) > valueAtExpiry(16.50, K1.strike, K1.premium), true)
  check('lines meet exactly at the crossover',
    valueAtExpiry(16.12, K1.strike, K1.premium), valueAtExpiry(16.12, K2.strike, K2.premium))
})

group('§9.5 implied probability', () => {
  check('impliedProb = (P1-P2)/(K2-K1)',
    impliedProb({ strike: 16, premium: 0.24 }, { strike: 17, premium: 0.12 }), 0.12)
  check('zero width returns null',
    impliedProb({ strike: 16, premium: 0.24 }, { strike: 16, premium: 0.12 }), null)
})

group('§9.8 basis safety check — the case that broke the original design', () => {
  // basis 16.08, strike 16.00, premium 0.24: separation is NEGATIVE but the
  // candidate is still profitable. Must be amber and must NOT say "locks in a loss".
  const f = safetyFlag({ strike: 16.00, premium: 0.24, basis: 16.08 })
  check('amber, not red', f.level, 'amber')
  check('separation before premium', f.separation, -0.08000000000000185)
  check('net if called is positive', f.netIfCalled > 0, true)
  check('message names the premium rescue', /only this premium/.test(f.message), true)
  check('message does not claim a loss', /loss/.test(f.message), false)

  check('genuine loss is red',
    safetyFlag({ strike: 15.50, premium: 0.10, basis: 16.08 }).level, 'red')
  check('thin margin is amber',
    safetyFlag({ strike: 16.15, premium: 0.24, basis: 16.08 }).level, 'amber')
  check('clear separation is green',
    safetyFlag({ strike: 17.00, premium: 0.24, basis: 16.08 }).level, 'green')

  // Threshold must scale with price, not be a flat $0.25.
  check('1.5% of $16 basis', safetyFlag({ strike: 20, premium: 0.5, basis: 16 }).threshold, 0.24)
  check('1.5% of $200 basis', safetyFlag({ strike: 220, premium: 5, basis: 200 }).threshold, 3)
  check('$0.30 separation is thin on a $200 stock',
    safetyFlag({ strike: 200.30, premium: 5, basis: 200 }).level, 'amber')
  check('$0.30 separation is fine on a $16 stock',
    safetyFlag({ strike: 16.30, premium: 0.24, basis: 16 }).level, 'green')

  check('no basis -> unknown, not zero',
    safetyFlag({ strike: 16, premium: 0.24, basis: null }).level, 'unknown')
})

group('§9.9 dead chain floor scales with DTE', () => {
  check('$0.07 weekly is the floor', deadChain({ premium: 0.06, days: 7 }).dead, true)
  check('$0.08 weekly passes', deadChain({ premium: 0.08, days: 7 }).dead, false)
  // The spec's example: $0.30 over 45 days must FAIL despite the bigger number.
  const long = deadChain({ premium: 0.30, days: 45 })
  check('$0.30 / 45 DTE is worse per unit time', long.weeklyEquivalent < 0.07, true)
  check('$0.30 / 45 DTE flagged dead', long.dead, true)
})

group('§9.7 annualised return', () => {
  const a = annualised({ premium: 0.24, strike: 16, basis: 16.08, days: 7 })
  check('premium yield annualised', a.premiumYield, (0.24 / 16.08) * (365 / 7))
  check('called return annualised', a.calledReturn, ((16 + 0.24 - 16.08) / 16.08) * (365 / 7))
  check('no basis -> no annualised figure',
    annualised({ premium: 0.24, strike: 16, basis: null, days: 7 }).premiumYield, null)
})

// ─────────────────────────────────────────────────────────────────────────────
group('analyseStrikes — full run', () => {
  const a = analyseStrikes({
    basis: 16.08, shares: 100, underlying: 15.90, today: '2026-07-22',
    candidates: [
      { strike: 16.00, premium: 0.24, expiry: '2026-07-31', delta: 0.30 },
      { strike: 17.00, premium: 0.12, expiry: '2026-07-31', delta: 0.14 },
    ],
  })
  check('ready', a.ready, true)
  check('one adjacent pair', a.pairs.length, 1)
  check('crossover', a.pairs[0].crossover, 16.12)
  check('implied prob', a.pairs[0].impliedProb, 0.12000000000000001)
  check('avg delta shown alongside', a.pairs[0].avgDelta, 0.22)
  check('certain cost of choosing the higher strike', a.pairs[0].certainCost, 11.999999999999998)
  check('same expiry detected', a.differingExpiries, false)

  // The spec's point: raw premium comparison hides a large outcome difference.
  check('called profit at K1', a.candidates[0].calledProfit, 15.999999999999062)
  check('called profit at K2', a.candidates[1].calledProfit, 104.00000000000091)
  check('cushion is the premium', a.candidates[0].cushion, 0.24)
  check('premium total shown as x N', a.candidates[0].premiumTotal, 24)
})

group('analyseStrikes — guidance rules', () => {
  const above = analyseStrikes({
    basis: 20, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.30, expiry: '2026-07-31' },
      { strike: 17, premium: 0.20, expiry: '2026-07-31' },
    ],
  })
  check('basis above all strikes -> lean lower', above.guidance.tone, 'lower')

  const below = analyseStrikes({
    basis: 14, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.30, expiry: '2026-07-31' },
      { strike: 17, premium: 0.20, expiry: '2026-07-31' },
    ],
  })
  check('basis below all strikes -> lean higher', below.guidance.tone, 'higher')

  const dead = analyseStrikes({
    basis: 16, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16.5, premium: 0.02, expiry: '2026-07-31' },
      { strike: 17.0, premium: 0.01, expiry: '2026-07-31' },
    ],
  })
  check('dead chain wins over everything', dead.guidance.tone, 'warn')
  check('dead chain names sitting flat', /sitting flat/i.test(dead.guidance.text), true)
})

group('§9.12 edge cases', () => {
  // P1 <= P2 must warn, not reject.
  const inverted = analyseStrikes({
    basis: 16, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.10, expiry: '2026-07-31' },
      { strike: 17, premium: 0.20, expiry: '2026-07-31' },
    ],
  })
  check('inverted quotes still compute', inverted.ready, true)
  check('inverted quotes warn', inverted.warnings.some(w => /check your quotes/.test(w)), true)

  // Identical strikes are genuinely invalid.
  const dupe = analyseStrikes({
    basis: 16, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.20, expiry: '2026-07-31' },
      { strike: 16, premium: 0.10, expiry: '2026-07-31' },
    ],
  })
  check('duplicate strikes rejected', dupe.ready, false)
  check('duplicate strikes explained', dupe.errors.length > 0, true)

  // No basis: run without the safety check, say so, never default B to 0.
  const noBasis = analyseStrikes({
    basis: null, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.24, expiry: '2026-07-31' },
      { strike: 17, premium: 0.12, expiry: '2026-07-31' },
    ],
  })
  check('still computes the crossover', noBasis.pairs[0].crossover, 16.12)
  check('called profit withheld', noBasis.candidates[0].calledProfit, null)
  check('safety flag is unknown', noBasis.candidates[0].safety.level, 'unknown')
  check('basis stays null', noBasis.basis, null)

  // Three candidates -> crossovers pairwise between adjacent strikes.
  const three = analyseStrikes({
    basis: 16, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.30, expiry: '2026-07-31' },
      { strike: 17, premium: 0.18, expiry: '2026-07-31' },
      { strike: 18, premium: 0.10, expiry: '2026-07-31' },
    ],
  })
  check('two adjacent pairs', three.pairs.length, 2)
  check('first crossover', three.pairs[0].crossover, 16.12)
  check('second crossover', three.pairs[1].crossover, 17.08)

  // Entry order must not matter.
  const reversed = analyseStrikes({
    basis: 16, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 18, premium: 0.10, expiry: '2026-07-31' },
      { strike: 16, premium: 0.30, expiry: '2026-07-31' },
      { strike: 17, premium: 0.18, expiry: '2026-07-31' },
    ],
  })
  check('sorted by strike regardless of entry order',
    reversed.candidates.map(c => c.strike), [16, 17, 18])

  // Fewer than two filled rows -> not ready, no crash.
  check('single candidate is not ready',
    analyseStrikes({ basis: 16, shares: 100, candidates: [{ strike: 16, premium: 0.2 }] }).ready, false)
})

group('§9.7 differing expiries flagged', () => {
  const a = analyseStrikes({
    basis: 16, shares: 100, today: '2026-07-22',
    candidates: [
      { strike: 16, premium: 0.24, expiry: '2026-07-31' },
      { strike: 17, premium: 0.60, expiry: '2026-09-18' },
    ],
  })
  check('differing expiries detected', a.differingExpiries, true)
  check('annualised is what makes them comparable',
    a.candidates[1].annualisedPremiumYield < a.candidates[0].annualisedPremiumYield * 3, true)
})

group('§9.11 snapshot shape', () => {
  const a = analyseStrikes({
    basis: 16.08, shares: 100, underlying: 15.90, today: '2026-07-22',
    candidates: [
      { strike: 16.00, premium: 0.24, expiry: '2026-07-31', delta: 0.30 },
      { strike: 17.00, premium: 0.12, expiry: '2026-07-31', delta: 0.14 },
    ],
  })
  const snap = buildSnapshot(a, 16.00)
  check('records both candidates', snap.candidates.length, 2)
  check('records the chosen strike', snap.chosen, 16.00)
  check('records basis at decision', snap.basis_at_decision, 16.08)
  check('records underlying at decision', snap.underlying_at_decision, 15.90)
  check('records crossover', snap.crossover, 16.12)
  check('records expiry', snap.expiry, '2026-07-31')
})

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
