/**
 * Wheel tracker — CYCLE LIFECYCLE tests.
 *
 *   node wheel-lifecycle-tests.mjs
 *
 * `wheel-tests.mjs` covers the pure engine (server/lib/wheelEngine.js). It cannot
 * catch a lifecycle bug, because every decision about when a cycle opens, stays
 * open, or closes lives in the ROUTE layer (server/routes/wheel.js) — in
 * `ensureActiveCycle` and `recomputeCycle`.
 *
 * So this file drives the real router. `server/db.js` exports a single `pool`
 * object, and the router holds a reference to it, so patching `pool.connect` /
 * `pool.query` after import swaps the database out from under the real handlers
 * without touching a line of production code. No Postgres, no network.
 *
 * The in-memory shim understands only the exact SQL this router issues, and
 * throws on anything it does not recognise — an unhandled statement fails the
 * run rather than quietly returning zero rows.
 *
 * ── The sequence under test ──────────────────────────────────────────────────
 *   RUN A:  sell CSP → expires worthless                        → play over
 *   RUN B:  sell CSP → assigned → sell CC → expires → sell CC → called away
 *
 * The two endings are the whole point, and they are NOT symmetric. Sam's rule,
 * in his words:
 *
 *   "If it's a CSP and I click expire it's basically the end of the play, log
 *    the win and move on. If it's covered calls the play is still live — me
 *    clicking expire means I still have the shares and just my cost basis is
 *    going down, but the trade isn't over until my shares are called away."
 *
 * So a put expiring while flat ENDS the run and books it; a call expiring while
 * shares are held does not. `isCycleFlat` draws exactly that line — shares are
 * zero AND nothing is still open — and these tests hold it there.
 *
 * The consequence run B checks hardest: run A's premium must NOT reach run B's
 * basis. They are separate plays on the same ticker, so the $50 banked in A is
 * settled money that has already booked, and letting it cut B's break-even
 * would make a marginal covered call look safer than it is.
 *
 * An earlier draft of this file asserted the opposite — one cycle spanning both
 * runs, with the first CSP's premium surviving into the assignment. That belief
 * is what produced 22 failures against a router that was right; the tests were
 * wrong, and this is the corrected version.
 */
import express from 'express'
import pool from './server/db.js'
import { effectiveBasis } from './server/lib/wheelEngine.js'

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Postgres shim
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  wheel_cycles: {
    shares: 0, avg_assigned_strike: null, net_premium: 0, shares_exited: 0,
    premium_attributed: 0, realized_pnl: 0, retained_share_gain: 0, closed_at: null,
    close_reason: null, exit_price: null, notes: null, account_id: null,
  },
  trades: {
    close_cost: null, leg_status: null, wheel_cycle_id: null, rolled_from_id: null,
    needs_roll: false, pnl: null, fees: 0, notes: null, account_id: null,
    strike_selection_snapshot: null, premium: null, contracts: null,
    strike: null, expiry: null, option_type: null, premium_already_logged: false,
    direct_pnl: null, entry_mode: null, status: null, strategy_tag: null,
  },
  share_lots: {},
  strategies: {},
}

let db, seq, savepoint

function resetDb() {
  db  = { wheel_cycles: [], trades: [], share_lots: [], strategies: [] }
  seq = { wheel_cycles: 0, trades: 0, share_lots: 0, strategies: 0 }
  savepoint = null
}

const norm  = (s) => String(s).replace(/\s+/g, ' ').trim()
const clone = (o) => JSON.parse(JSON.stringify(o))

/** Split a comma-separated SQL fragment (no nesting in this router's statements). */
const splitList = (s) => s.split(',').map(x => x.trim()).filter(Boolean)

/** Resolve one VALUES token: `$3` → params[2], `'wheel'` → "wheel", `NULL` → null. */
function literal(tok, params) {
  if (/^\$\d+$/.test(tok)) return params[Number(tok.slice(1)) - 1]
  if (/^'.*'$/.test(tok))  return tok.slice(1, -1)
  if (/^null$/i.test(tok)) return null
  if (/^(true|false)$/i.test(tok)) return tok.toLowerCase() === 'true'
  if (!Number.isNaN(Number(tok))) return Number(tok)
  throw new Error(`shim: cannot resolve VALUES token ${tok}`)
}

function runInsert(sql, params) {
  const m = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\)\s*(?:RETURNING (.+))?$/i.exec(sql)
  if (!m) throw new Error(`shim: unparsed INSERT: ${sql}`)
  const [, table, colSrc, valSrc, returning] = m

  const cols = splitList(colSrc)
  const vals = splitList(valSrc)
  if (cols.length !== vals.length) {
    throw new Error(`shim: ${table} INSERT has ${cols.length} columns but ${vals.length} values`)
  }

  const row = { ...DEFAULTS[table], id: ++seq[table] }
  cols.forEach((c, i) => { row[c] = literal(vals[i], params) })
  db[table].push(row)

  if (!returning) return { rows: [] }
  if (returning.trim() === '*') return { rows: [clone(row)] }
  const picked = {}
  for (const c of splitList(returning)) picked[c] = row[c]
  return { rows: [picked] }
}

/** Every SELECT / UPDATE this router issues, matched on its normalised text. */
function runStatement(sql, params) {
  const s = norm(sql)
  const p = params ?? []

  if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(s)) return { rows: [] }
  if (/^INSERT INTO/i.test(s)) return runInsert(s, p)

  // ── wheel_cycles reads ──
  if (s === 'SELECT * FROM wheel_cycles WHERE id = $1')
    return { rows: db.wheel_cycles.filter(c => c.id === Number(p[0])).map(clone) }

  if (s === 'SELECT * FROM wheel_cycles WHERE id = $1 AND user_id = $2')
    return { rows: db.wheel_cycles.filter(c => c.id === Number(p[0]) && c.user_id === p[1]).map(clone) }

  if (/^SELECT (\*|id) FROM wheel_cycles WHERE user_id = \$1 AND ticker = \$2 AND status = 'active'$/.test(s))
    return { rows: db.wheel_cycles
      .filter(c => c.user_id === p[0] && c.ticker === p[1] && c.status === 'active')
      .map(clone) }

  // ── trades / share_lots reads ──
  if (s === 'SELECT * FROM trades WHERE wheel_cycle_id = $1 ORDER BY id')
    return { rows: db.trades.filter(t => t.wheel_cycle_id === Number(p[0]))
                            .sort((a, b) => a.id - b.id).map(clone) }

  if (s === 'SELECT * FROM trades WHERE wheel_cycle_id = $1 AND leg_status IS NOT NULL ORDER BY id')
    return { rows: db.trades.filter(t => t.wheel_cycle_id === Number(p[0]) && t.leg_status != null)
                            .sort((a, b) => a.id - b.id).map(clone) }

  if (s === 'SELECT * FROM trades WHERE wheel_cycle_id = $1 AND leg_status IS NULL')
    return { rows: db.trades.filter(t => t.wheel_cycle_id === Number(p[0]) && t.leg_status == null).map(clone) }

  if (s === 'SELECT * FROM share_lots WHERE wheel_cycle_id = $1 ORDER BY id')
    return { rows: db.share_lots.filter(l => l.wheel_cycle_id === Number(p[0]))
                                .sort((a, b) => a.id - b.id).map(clone) }

  if (s === "SELECT * FROM trades WHERE id = $1 AND user_id = $2 AND strategy_tag = 'wheel'")
    return { rows: db.trades.filter(t => t.id === Number(p[0]) && t.user_id === p[1] && t.strategy_tag === 'wheel').map(clone) }

  if (s === 'SELECT * FROM trades WHERE id = $1')
    return { rows: db.trades.filter(t => t.id === Number(p[0])).map(clone) }

  if (s === "SELECT contracts FROM trades WHERE wheel_cycle_id = $1 AND leg_status = 'open' AND option_type = 'call'")
    return { rows: db.trades.filter(t => t.wheel_cycle_id === Number(p[0]) && t.leg_status === 'open' && t.option_type === 'call').map(t => ({ contracts: t.contracts })) }

  if (s === 'SELECT COUNT(*)::int AS legs FROM trades WHERE wheel_cycle_id = $1 AND leg_status IS NOT NULL')
    return { rows: [{ legs: db.trades.filter(t => t.wheel_cycle_id === Number(p[0]) && t.leg_status != null).length }] }

  if (s === 'SELECT COUNT(*)::int AS lots FROM share_lots WHERE wheel_cycle_id = $1')
    return { rows: [{ lots: db.share_lots.filter(l => l.wheel_cycle_id === Number(p[0])).length }] }

  if (s === 'SELECT id FROM strategies WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1')
    return { rows: db.strategies.filter(x => x.user_id === p[0] && String(x.name).toLowerCase() === String(p[1]).toLowerCase()).slice(0, 1).map(x => ({ id: x.id })) }

  // ── writes ──
  if (s.startsWith('UPDATE wheel_cycles SET shares = $1, avg_assigned_strike = $2')) {
    const c = db.wheel_cycles.find(x => x.id === Number(p[9]))
    if (c) Object.assign(c, {
      shares: p[0], avg_assigned_strike: p[1], net_premium: p[2],
      premium_attributed: p[3], realized_pnl: p[4], status: p[5],
      closed_at: p[6], close_reason: p[7], exit_price: p[8],
    })
    return { rows: [] }
  }

  if (s.startsWith('UPDATE wheel_cycles SET shares_exited = shares_exited + $1')) {
    // Two shapes: the call-away path books three accumulators, the share-sale
    // path books four (it carries retained_share_gain as well).
    const retains = s.includes('retained_share_gain')
    const c = db.wheel_cycles.find(x => x.id === Number(retains ? p[4] : p[3]))
    if (c) {
      c.shares_exited       += Number(p[0])
      c.premium_attributed  += Number(p[1])
      c.retained_share_gain += retains ? Number(p[2]) : 0
      c.realized_pnl        += Number(retains ? p[3] : p[2])
    }
    return { rows: [] }
  }

  if (s.startsWith('UPDATE trades SET leg_status = $1, close_cost = $2')) {
    // resolveLeg writes the leg's lifetime commission but never a P&L, so the
    // params are (leg_status, close_cost, fees, id).
    const t = db.trades.find(x => x.id === Number(p[3]))
    if (t) Object.assign(t, {
      leg_status: p[0], close_cost: p[1], status: 'closed', pnl: null, fees: p[2], needs_roll: false,
    })
    return { rows: [] }
  }

  if (s.startsWith('UPDATE trades SET pnl = NULL')) {
    // recomputeCycle clearing every real leg: the cycle books, the legs do not.
    for (const t of db.trades) {
      if (t.wheel_cycle_id === Number(p[0]) && t.leg_status != null) t.pnl = null
    }
    return { rows: [] }
  }

  if (s.startsWith('UPDATE trades SET date = $1, ticker = $2, pnl = $3')) {
    // syncCycleSummary refreshing an existing cycle result row.
    const t = db.trades.find(x => x.id === Number(p[5]))
    if (t) Object.assign(t, { date: p[0], ticker: p[1], pnl: p[2], direct_pnl: p[2], notes: p[3], account_id: p[4] })
    return { rows: t ? [clone(t)] : [] }
  }

  if (s.startsWith('DELETE FROM trades WHERE id = $1')) {
    db.trades = db.trades.filter(t => t.id !== Number(p[0]))
    return { rows: [] }
  }

  if (s.startsWith('DELETE FROM')) {
    throw new Error(`shim: DELETE is not exercised by these tests: ${s}`)
  }

  throw new Error(`shim: unhandled SQL → ${s}`)
}

const fakeClient = {
  query: async (sql, params) => {
    const s = norm(sql)
    if (/^BEGIN$/i.test(s))    { savepoint = clone({ db, seq }); return { rows: [] } }
    if (/^COMMIT$/i.test(s))   { savepoint = null; return { rows: [] } }
    if (/^ROLLBACK$/i.test(s)) {
      if (savepoint) { db = savepoint.db; seq = savepoint.seq; savepoint = null }
      return { rows: [] }
    }
    return runStatement(sql, params)
  },
  release: () => {},
}

pool.connect = async () => fakeClient
pool.query   = async (sql, params) => runStatement(sql, params)

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────

const USER = '00000000-0000-0000-0000-000000000001'
const TICKER = 'WHEELX'

const { default: wheelRouter } = await import('./server/routes/wheel.js')

const app = express()
app.use(express.json())
app.use((req, _res, next) => { req.userId = USER; next() })
app.use('/api/wheel', wheelRouter)

const server = app.listen(0)
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}/api/wheel`

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error}`)
  return json
}

let passed = 0, failed = 0
const near = (a, b, eps = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < eps

function check(name, actual, expected) {
  const ok = near(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

/**
 * A scenario. Errors are caught and recorded rather than left to reject.
 *
 * `call()` throws on any non-2xx, so a route that breaks badly enough to 500 —
 * or a change that makes the shim meet SQL it does not know — used to reject at
 * the top level and abort the process mid-run, taking the tally with it and
 * tripping a libuv assertion on the way out. A regression guard that aborts
 * instead of reporting is worse than useless: the failure it was built to catch
 * is exactly the one it hides.
 */
async function group(title, fn) {
  console.log(`\n${title}`)
  try {
    await fn()
  } catch (err) {
    failed++
    console.log(`  FAIL ${title}\n         threw: ${err.message}`)
  }
}

// Nothing should reach here, but an abort would still lose the tally.
process.on('unhandledRejection', (err) => {
  failed++
  console.log(`  FAIL unhandled rejection\n         ${err?.message ?? err}`)
})

/** Cycles this user holds on the ticker, oldest first — straight from the store. */
const cyclesFor = (ticker = TICKER) => db.wheel_cycles.filter(c => c.ticker === ticker)
const activeCycle = (ticker = TICKER) => cyclesFor(ticker).find(c => c.status === 'active') ?? null

/** The basis line the Wheel tab renders, computed the way GET /cycles computes it. */
const basisOf = (c) => c == null ? null : effectiveBasis({
  shares: c.shares, avgAssignedStrike: c.avg_assigned_strike, netPremium: c.net_premium,
})

const sellLeg = (body) => call('POST', '/legs', { ticker: TICKER, ...body })

// ─────────────────────────────────────────────────────────────────────────────
// The lifecycle walk
// ─────────────────────────────────────────────────────────────────────────────

resetDb()

const STRIKE   = 20        // both CSPs
const CALL_K   = 21        // both CCs
const SHARES   = 100
const CSP1     = 50        // total $ credit
const CSP2     = 60
const CC1      = 30
const CC2      = 25

let runA = null   // the CSP that simply expires
let runB = null   // the CSP that gets assigned and rides to a call-away

/** Summary rows — the one result row a finished run books. */
const resultRows   = () => db.trades.filter(t => t.leg_status == null)
const resultFor    = (cycleId) => resultRows().find(t => t.wheel_cycle_id === cycleId) ?? null
const cycleById    = (id) => db.wheel_cycles.find(c => c.id === id) ?? null
const openLeg      = () => db.trades.find(t => t.leg_status === 'open')

await group('1. Sell CSP #1 — opens the cycle', async () => {
  const { cycle } = await sellLeg({
    option_type: 'put', strike: STRIKE, expiry: '2026-08-07', premium: CSP1,
    contracts: 1, date: '2026-08-01',
  })
  runA = cycle.id

  check('exactly one cycle exists', cyclesFor().length, 1)
  check('cycle is active', cycle.status, 'active')
  check('no shares yet', cycle.shares, 0)
  check('net_premium = CSP #1 credit', cycle.net_premium, CSP1)
  check('basis is null while flat — never 0', basisOf(cycle), null)
  check('nothing has booked yet', resultRows().length, 0)
})

await group('2. CSP #1 expires worthless — that IS the end of the play', async () => {
  const leg = openLeg()
  const { cycle } = await call('POST', `/legs/${leg.id}/expire`, { date: '2026-08-07' })

  check('still exactly one cycle', cyclesFor().length, 1)
  check('same cycle id — expiring does not spawn anything', cycle.id, runA)
  check('the run is CLOSED — flat, with nothing still open', cycle.status, 'closed')
  check('closed on the expiry date', cycle.closed_at, '2026-08-07')
  check('the premium booked', Number(cycle.realized_pnl), CSP1)
  check('net_premium is fully attributed, so nothing carries forward',
    cycle.net_premium, 0)
  check('leg is marked expired', db.trades.find(t => t.id === leg.id).leg_status, 'expired')
  check('nothing is left running', activeCycle(), null)

  // The run books exactly one result row — never the leg.
  check('one result row for the run', resultRows().length, 1)
  check('it carries the run premium', resultFor(runA).pnl, CSP1)
  check('dated the day the run ended', resultFor(runA).date, '2026-08-07')
  check('the leg itself books nothing', db.trades.find(t => t.id === leg.id).pnl, null)
  check('basis is null once flat', basisOf(cycle), null)
})

await group('3. Sell CSP #2 — a NEW play, because the last one finished', async () => {
  const { cycle } = await sellLeg({
    option_type: 'put', strike: STRIKE, expiry: '2026-08-21', premium: CSP2,
    contracts: 1, date: '2026-08-08',
  })
  runB = cycle.id

  check('a second cycle now exists', cyclesFor().length, 2)
  check('it is not the finished one', cycle.id === runA, false)
  check('it is active', cycle.status, 'active')
  // The separation that matters: run A's $50 has booked and is gone from here.
  check('net_premium is THIS run only — run A does not carry over',
    cycle.net_premium, CSP2)
  check('run A is untouched and still closed', cycleById(runA).status, 'closed')
  check('run A keeps its booked result', Number(cycleById(runA).realized_pnl), CSP1)
})

await group('4. CSP #2 assigned — shares arrive at the strike', async () => {
  const leg = openLeg()
  const { cycle } = await call('POST', `/legs/${leg.id}/assign`, { date: '2026-08-21' })

  check('still exactly two cycles', cyclesFor().length, 2)
  check('cycle still active — shares are held', cycle.status, 'active')
  check('100 shares held', cycle.shares, SHARES)
  check('avg assigned strike', cycle.avg_assigned_strike, STRIKE)
  // The premium from the SETTLED run must not cut this run's break-even.
  check('net_premium is this run only', cycle.net_premium, CSP2)
  check('basis = 20 - 60/100', basisOf(cycle), STRIKE - CSP2 / SHARES)
  check('assignment books nothing — the play is still running',
    resultFor(runB), null)
  check('still just run A\'s result row', resultRows().length, 1)
})

let basisBeforeCC1 = null

await group('5. Sell CC #1 — basis drops by premium/shares', async () => {
  basisBeforeCC1 = basisOf(activeCycle())
  const { cycle } = await sellLeg({
    option_type: 'call', strike: CALL_K, expiry: '2026-09-18', premium: CC1,
    contracts: 1, date: '2026-08-22',
  })

  check('still exactly two cycles', cyclesFor().length, 2)
  check('attached to run B', cycle.id, runB)
  check('net_premium accumulates the call credit', cycle.net_premium, CSP2 + CC1)
  check('basis dropped by exactly CC1/shares',
    basisBeforeCC1 - basisOf(cycle), CC1 / SHARES)
  check('basis = 20 - 90/100', basisOf(cycle), STRIKE - (CSP2 + CC1) / SHARES)
})

await group('6. CC #1 expires — the play is STILL LIVE, because shares are held', async () => {
  const leg = openLeg()
  const before = basisOf(activeCycle())
  const { cycle } = await call('POST', `/legs/${leg.id}/expire`, { date: '2026-09-18' })

  check('still exactly two cycles', cyclesFor().length, 2)
  check('same cycle id', cycle.id, runB)
  // The asymmetry with step 2, on the same route, decided purely by the shares.
  check('cycle is STILL ACTIVE after a CC expiry', cycle.status, 'active')
  check('shares are still held', cycle.shares, SHARES)
  check('net_premium was NOT reset', cycle.net_premium, CSP2 + CC1)
  check('nothing booked to realized_pnl', Number(cycle.realized_pnl), 0)
  check('no result row for a run still going', resultFor(runB), null)
  // The credit was already banked into the basis when the leg was SOLD; expiring
  // worthless is what makes it permanent, so the line must not move again here.
  check('basis unchanged by the expiry itself', basisOf(cycle), before)
  check('cumulative drop from the CC premium is CC1/shares',
    basisBeforeCC1 - basisOf(cycle), CC1 / SHARES)
})

await group('7. Sell CC #2 — attaches to the running play, not a new one', async () => {
  const before = basisOf(activeCycle())
  const { cycle } = await sellLeg({
    option_type: 'call', strike: CALL_K, expiry: '2026-10-16', premium: CC2,
    contracts: 1, date: '2026-09-19',
  })

  check('still exactly two cycles — no new cycle after the CC expiry',
    cyclesFor().length, 2)
  check('attached to run B', cycle.id, runB)
  check('net_premium spans run B\'s three legs', cycle.net_premium, CSP2 + CC1 + CC2)
  check('basis dropped by exactly CC2/shares', before - basisOf(cycle), CC2 / SHARES)
  check('basis = 20 - 115/100', basisOf(cycle), STRIKE - (CSP2 + CC1 + CC2) / SHARES)
})

await group('8. CC #2 called away — and ONLY now does run B close', async () => {
  const leg = openLeg()
  const { cycle, booked } = await call('POST', `/legs/${leg.id}/call-away`, { date: '2026-10-16' })

  check('still exactly two cycles over both runs', cyclesFor().length, 2)
  check('cycle is CLOSED', cycle.status, 'closed')
  check('closed for the right reason', cycle.close_reason, 'called_away')
  check('exit price is the call strike', cycle.exit_price, CALL_K)
  check('flat on shares', cycle.shares, 0)
  check('net_premium fully attributed', cycle.net_premium, 0)

  // 100 x (21 - 20) share gain + every premium collected inside RUN B only.
  const expected = SHARES * (CALL_K - STRIKE) + (CSP2 + CC1 + CC2)
  check('booked P&L = share gain + run B premium', booked, expected)
  check('realized_pnl = 100x(21-20) + 115', Number(cycle.realized_pnl), expected)
  check('basis is null once flat', basisOf(cycle), null)

  // Two finished plays, two result rows, and nothing double-counted.
  check('one result row per run', resultRows().length, 2)
  check('run B books its own total', resultFor(runB).pnl, expected)
  check('run A still books only its premium', resultFor(runA).pnl, CSP1)
  check('dated the day run B ended', resultFor(runB).date, '2026-10-16')
  check('lifetime across both runs',
    resultRows().reduce((a, t) => a + t.pnl, 0), CSP1 + expected)
  check('no leg anywhere books a P&L',
    db.trades.filter(t => t.leg_status != null).every(t => t.pnl == null), true)
})

// ─────────────────────────────────────────────────────────────────────────────
// Roll path — same cycle, and a losing roll must RAISE the basis
// ─────────────────────────────────────────────────────────────────────────────

await group('9. Roll: debit and credit both land in the same cycle', async () => {
  resetDb()

  await sellLeg({ option_type: 'put', strike: STRIKE, expiry: '2026-08-07', premium: 40, contracts: 1, date: '2026-08-01' })
  const put = db.trades.find(t => t.leg_status === 'open')
  const { cycle: rolled } = await call('POST', `/legs/${put.id}/assign`, { date: '2026-08-07' })
  check('assigned, one cycle', cyclesFor().length, 1)
  check('basis after CSP assignment', basisOf(rolled), STRIKE - 40 / SHARES)

  await sellLeg({ option_type: 'call', strike: CALL_K, expiry: '2026-09-18', premium: 30, contracts: 1, date: '2026-08-08' })
  const cc = db.trades.find(t => t.leg_status === 'open')
  const beforeRoll = basisOf(activeCycle())
  check('basis with the call credit', beforeRoll, STRIKE - 70 / SHARES)

  // Losing roll: pay $90 to close a $30 call, take $60 on the new one.
  // Net on the roll = -90 + 60 = -30, so net_premium 70 → 40.
  const { cycle } = await call('POST', `/legs/${cc.id}/roll`, {
    close_cost: 90, strike: 22, expiry: '2026-10-16', premium: 60, date: '2026-09-10',
  })

  check('roll did not spawn a new cycle', cyclesFor().length, 1)
  check('old leg marked rolled', db.trades.find(t => t.id === cc.id).leg_status, 'rolled')
  check('buy-to-close debit stored on the closed leg', db.trades.find(t => t.id === cc.id).close_cost, 90)
  check('new leg points back at the old one',
    db.trades.find(t => t.leg_status === 'open').rolled_from_id, cc.id)
  check('debit and credit net inside one cycle', cycle.net_premium, 40 + 30 - 90 + 60)
  check('basis after the losing roll', basisOf(cycle), STRIKE - 40 / SHARES)
  // Sign convention: a roll taken at a net loss is a real cost, so the
  // break-even must move UP, never down.
  check('a losing roll RAISES the effective basis', basisOf(cycle) > beforeRoll, true)

  // A roll is not an outcome: the closed leg books NOTHING, or the dashboard
  // reports a loss on a position that is still running.
  check('rolled leg books no P&L', db.trades.find(t => t.id === cc.id).pnl, null)

  // Nor does the leg that ends the chain. Sam still holds the shares, so the
  // wheel play is still live: "the trade isn't over until my shares are called
  // away." No leg books, and no result row exists yet.
  const replacement = db.trades.find(t => t.leg_status === 'open')
  await call('POST', `/legs/${replacement.id}/expire`, { date: '2026-10-16' })
  check('the chain still books nothing on the roll', db.trades.find(t => t.id === cc.id).pnl, null)
  check('nor on the leg that ended it',  db.trades.find(t => t.id === replacement.id).pnl, null)
  check('the run is still going',        activeCycle().status, 'active')
  check('no result row while shares are held',
    db.trades.filter(t => t.leg_status == null).length, 0)

  // Sell the shares at 21: the run ends, and NOW one row carries the whole
  // thing — 40 + 30 - 90 + 60 of premium, plus 100 x (21 - 20) on the shares.
  const cycleId = activeCycle().id
  const { cycle: done } = await call('POST', `/cycles/${cycleId}/sell-shares`, { price: 21, date: '2026-10-20' })
  check('the run is over', done.status, 'closed')

  const result = db.trades.filter(t => t.leg_status == null)
  check('exactly one result row for the run', result.length, 1)
  check('it carries the whole run', result[0].pnl, 40 + 30 - 90 + 60 + 100)
  check('dated the day the run ended, not the day a leg opened', result[0].date, '2026-10-20')
  check('and every leg still books nothing',
    db.trades.filter(t => t.leg_status != null).every(t => t.pnl == null), true)
})


// ─────────────────────────────────────────────────────────────────────────────
// Buy-to-close — the losing ending, and the one route no test had ever driven
// ─────────────────────────────────────────────────────────────────────────────

await group('10. Buying a CSP back at a loss ends the play, and books the loss', async () => {
  resetDb()

  await sellLeg({ option_type: 'put', strike: STRIKE, expiry: '2026-08-07', premium: 40, contracts: 1, date: '2026-08-01' })
  const put = openLeg()

  // Paid 90 to buy back a put sold for 40 — a $50 loss, taken deliberately.
  const { cycle } = await call('POST', `/legs/${put.id}/close`, {
    close_cost: 90, date: '2026-08-05',
  })

  check('no new cycle', cyclesFor().length, 1)
  check('leg marked closed', db.trades.find(t => t.id === put.id).leg_status, 'closed')
  check('debit stored on the leg', db.trades.find(t => t.id === put.id).close_cost, 90)
  // Flat and nothing open — same test as a worthless expiry, opposite sign.
  check('the run is over', cycle.status, 'closed')
  check('it books the net loss', Number(cycle.realized_pnl), 40 - 90)
  check('net_premium fully attributed', cycle.net_premium, 0)

  const result = resultRows()
  check('one result row', result.length, 1)
  check('a losing run books as a loss', result[0].pnl, -50)
  check('dated the day it was closed', result[0].date, '2026-08-05')
  check('the leg itself books nothing', db.trades.find(t => t.id === put.id).pnl, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// Partial exits — the two treatments, which answer different questions
// ─────────────────────────────────────────────────────────────────────────────

await group('11. Partial call-away: pro rata, so the survivors\' basis does not move', async () => {
  resetDb()

  // 2 contracts assigned → 200 shares at 20, $100 of put premium.
  await sellLeg({ option_type: 'put', strike: STRIKE, expiry: '2026-08-07', premium: 100, contracts: 2, date: '2026-08-01' })
  await call('POST', `/legs/${openLeg().id}/assign`, { date: '2026-08-07' })
  check('200 shares held', activeCycle().shares, 200)
  check('basis = 20 - 100/200', basisOf(activeCycle()), STRIKE - 100 / 200)

  // One covered call against half the position.
  await sellLeg({ option_type: 'call', strike: CALL_K, expiry: '2026-09-18', premium: 40, contracts: 1, date: '2026-08-08' })
  const basisBefore = basisOf(activeCycle())
  check('basis = 20 - 140/200', basisBefore, STRIKE - 140 / 200)

  const cc1 = openLeg()
  const { cycle: mid, booked, shares_out } = await call('POST', `/legs/${cc1.id}/call-away`, { date: '2026-09-18' })

  check('100 shares left', shares_out, 100)
  check('the run is NOT over — half the position remains', mid.status, 'active')
  check('100 shares still held', mid.shares, 100)
  // Premium follows the shares out in the same proportion, which is precisely
  // what leaves B where it was. A partial call-away must not move the line.
  check('the survivors\' basis is unchanged', basisOf(mid), basisBefore)
  check('booked = share gain + pro-rata premium', booked, 100 * (CALL_K - STRIKE) + 70)
  check('no result row while shares remain', resultRows().length, 0)

  // Write another call against the rest, and let it go.
  await sellLeg({ option_type: 'call', strike: CALL_K, expiry: '2026-10-16', premium: 20, contracts: 1, date: '2026-09-19' })
  const { cycle: done } = await call('POST', `/legs/${openLeg().id}/call-away`, { date: '2026-10-16' })

  check('now the run is over', done.status, 'closed')
  check('closed as called away', done.close_reason, 'called_away')
  check('flat on shares', done.shares, 0)

  // 200 shares x $1, plus every dollar of premium across all three legs.
  const lifetime = 200 * (CALL_K - STRIKE) + (100 + 40 + 20)
  check('realized over both exits', Number(done.realized_pnl), lifetime)
  check('one result row for the whole run', resultRows().length, 1)
  check('it carries both exits', resultFor(done.id).pnl, lifetime)
})

await group('12. Partial sale: gain retained, so the survivors\' basis DROPS', async () => {
  resetDb()

  await sellLeg({ option_type: 'put', strike: STRIKE, expiry: '2026-08-07', premium: 100, contracts: 2, date: '2026-08-01' })
  await call('POST', `/legs/${openLeg().id}/assign`, { date: '2026-08-07' })

  const cycleId = activeCycle().id
  const bOld = basisOf(activeCycle())
  check('basis before the trim', bOld, STRIKE - 100 / 200)

  // Trim 100 of 200 at 25 — no calls written, so nothing is left naked.
  const { cycle: mid, booked, retained_gain, basis } = await call(
    'POST', `/cycles/${cycleId}/sell-shares`, { price: 25, shares: 100, date: '2026-09-01' }
  )

  check('the run continues', mid.status, 'active')
  check('100 shares left', mid.shares, 100)
  check('nothing booked — the gain stays in the position', booked, 0)
  check('the gain is retained', retained_gain, 100 * (25 - STRIKE))
  check('no result row', resultRows().length, 0)

  // B_new = B_old - (sharesOut / remaining) x (price - B_old)
  const expected = bOld - (100 / 100) * (25 - bOld)
  check('basis falls by the documented formula', basisOf(mid), expected)
  check('the route reports the same basis it stored', basis, expected)
  check('trimming a winner brings the break-even DOWN', basisOf(mid) < bOld, true)

  // Let the rest go at the same price. Deferring must not have changed the total.
  const { cycle: done } = await call('POST', `/cycles/${cycleId}/sell-shares`, { price: 25, date: '2026-09-02' })

  check('the run is over', done.status, 'closed')
  check('closed as sold', done.close_reason, 'sold')

  // The identity that makes retaining safe: 200 x (25 - 20) + 100 of premium,
  // exactly what a pro-rata booking would have totalled.
  const lifetime = 200 * (25 - STRIKE) + 100
  check('lifetime P&L is unchanged by deferring', Number(done.realized_pnl), lifetime)
  check('one result row', resultRows().length, 1)
  check('it carries the whole run', resultFor(cycleId).pnl, lifetime)
  check('no leg books anything',
    db.trades.filter(t => t.leg_status != null).every(t => t.pnl == null), true)
})

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`${passed} passed, ${failed} failed`)
// Close the listener and let the event loop drain on its own. Calling
// process.exit() here trips a libuv assertion on Windows while the pg Pool's
// (unused) handles are still closing.
server.close()
process.exitCode = failed ? 1 : 0
