/**
 * Dragon engine — property / fuzz tests against an independent model. Pure math, no database.
 *
 *   node dragon-fuzz-tests.mjs            (seed defaults to 20261107)
 *   SEED=123 RUNS=5000 node dragon-fuzz-tests.mjs
 *
 * Tests named "BUG:" fail on purpose until the engine is fixed.
 */
import { replay, LedgerError, taxYear } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
const fails = []
function check(name, actual, expected, eps = 0.005) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < eps : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else { failed++; fails.push(name); console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}
function throws(name, fn, re) {
  try { fn(); failed++; fails.push(name); console.log(`  FAIL ${name} (did not throw)`) }
  catch (e) {
    const ok = e instanceof LedgerError && re.test(e.message)
    if (ok) passed++; else { failed++; fails.push(name) }
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${e.message}`}`)
  }
}
const tryReplay = (L) => { try { return replay(L) } catch (e) { if (e instanceof LedgerError) return { error: e.message }; throw e } }

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
const SEED = Number(process.env.SEED ?? 20261107)
const RUNS = Number(process.env.RUNS ?? 1500)
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
let rnd = mulberry32(SEED)
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const rf = (a, b) => a + rnd() * (b - a)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const cents = (v) => Math.round(v * 100) / 100
const r6 = (v) => Math.round(v * 1e6) / 1e6
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

// ── Independent model of the owner's rules ───────────────────────────────────
// Same-day order (owner's decision, 2026-11-07): BUY/DRIP, DIVIDEND, ROC, RECLASS,
// call closes, rolls, opens, SELL — a close/roll of a call opened that day after it —
// then amount, shares, id. Amounts gross; fees always against you; DIVIDEND.amount
// is the net cash, tax never in any basis. A dividend with 0 shares is income only.
// Lots never go below $0: ROC beyond them (or RECLASS for shares sold since the
// dividend) is a capital gain (rocGain).
class Invalid extends Error {}
const RANK = { BUY: 0, DRIP: 0, DIVIDEND: 1, ROC: 2, RECLASS: 3, CC_CLOSE: 4, CC_EXPIRE: 4, CC_ROLL: 5, CC_OPEN: 6, SELL: 10 }
function order(ledger) {
  const byId = new Map(ledger.map(t => [t.id, t]))
  const rank = (t) => { const ref = t.type.startsWith('CC_') && byId.get(t.ref_id); return ref && ref.date === t.date ? Math.max(RANK[t.type], rank(ref) + 0.5) : RANK[t.type] }
  return [...ledger].sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) || (a.amount ?? 0) - (b.amount ?? 0) || (a.shares ?? 0) - (b.shares ?? 0) || a.id - b.id)
}
function model(ledger) {
  const rows = order(ledger)
  let shares = 0, cost = 0, realized = 0, dividends = 0, roc = 0, cc = 0, tax = 0, rocGain = 0
  let lots = []
  const open = new Map(), divLeft = new Map()
  const lotShares = (ls = lots) => ls.reduce((s, l) => s + l.shares, 0)
  const cut = (ls, perShare) => { let g = 0; for (const l of ls) { const c = perShare * l.shares; if (c > l.cost) { g += c - l.cost; l.cost = 0 } else l.cost -= c } return g }
  const openN = () => [...open.values()].reduce((s, c) => s + c.contracts, 0)
  for (const t of rows) {
    const amt = t.amount ?? 0, fee = t.fees ?? 0
    if (t.type === 'BUY' || t.type === 'DRIP') {
      const c = t.type === 'BUY' ? amt + fee : amt
      shares = r6(shares + t.shares); cost += c; lots.push({ id: t.id, shares: t.shares, cost: c })
    } else if (t.type === 'DIVIDEND') {
      if (shares > 1e-9) cost -= amt
      dividends += amt; tax += t.tax_withheld ?? 0; divLeft.set(t.id, { left: amt, sharesAt: shares, lots: [...lots] })
    } else if (t.type === 'ROC') {
      if (!(shares > 0)) throw new Invalid('roc no shares')
      cost -= amt; roc += amt; rocGain += cut(lots, amt / lotShares())
    } else if (t.type === 'RECLASS') {
      const d = divLeft.get(t.ref_id)
      if (d == null || amt > d.left + 1e-9) throw new Invalid('reclass')
      d.left -= amt; dividends -= amt; roc += amt
      const still = lots.filter(l => d.lots.includes(l)), per = d.sharesAt > 1e-9 ? amt / d.sharesAt : 0
      rocGain += cut(still, per) + amt - per * lotShares(still)
    } else if (t.type === 'CC_OPEN' || t.type === 'CC_ROLL') {
      if (t.type === 'CC_ROLL') { if (!open.has(t.ref_id)) throw new Invalid('roll'); open.delete(t.ref_id) }
      if ((openN() + t.contracts) * 100 > shares + 1e-9) throw new Invalid('uncovered')
      open.set(t.id, t); cost -= amt - fee; cc += amt - fee
    } else if (t.type === 'CC_CLOSE' || t.type === 'CC_EXPIRE') {
      if (!open.has(t.ref_id)) throw new Invalid('close'); open.delete(t.ref_id)
      if (t.type === 'CC_CLOSE') { cost += amt + fee; cc -= amt + fee }
    } else if (t.type === 'SELL') {
      if (t.ref_id != null) { const c = open.get(t.ref_id); if (!c || Math.abs(c.contracts * 100 - t.shares) > 1e-9) throw new Invalid('called'); open.delete(t.ref_id) }
      if (t.shares > shares + 1e-9) throw new Invalid('oversell')
      const removed = cost * t.shares / shares
      realized += amt - fee - removed
      let left = t.shares
      for (const l of lots) { const take = Math.min(l.shares, left); l.cost *= 1 - take / l.shares; l.shares = r6(l.shares - take); left = r6(left - take) }
      lots = lots.filter(l => l.shares > 1e-9)
      shares = r6(shares - t.shares)
      if (shares === 0) { cost = 0; lots = [] } else cost -= removed
      if (openN() * 100 > shares + 1e-9) throw new Invalid('uncovers')
    }
  }
  return { shares, totalCost: cost, schwabBasis: lots.reduce((s, l) => s + l.cost, 0), lots, realized, dividends, roc, rocGain, ccNet: cc, taxWithheld: tax }
}
const isValid = (L) => { try { model(L); return true } catch (e) { if (e instanceof Invalid) return false; throw e } }

// ── Generator: walk (date, id) slots in replay order, pick a type valid at that point
function genLedger({ n = ri(3, 35), roc = true } = {}) {
  const days = ri(2, 12)
  const ids = shuffle(Array.from({ length: n }, (_, i) => i + 1))   // ids NOT in date order (backfilled rows)
  const slots = ids.map(id => ({ id, date: `2026-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, days)).padStart(2, '0')}` }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const L = []
  for (const s of slots) {
    const st = model(L)
    const open = (() => { const m = new Map(); for (const t of order(L)) {
      if (t.type === 'CC_OPEN' || t.type === 'CC_ROLL') { if (t.type === 'CC_ROLL') m.delete(t.ref_id); m.set(t.id, t) }
      if (['CC_CLOSE', 'CC_EXPIRE'].includes(t.type) || (t.type === 'SELL' && t.ref_id != null)) m.delete(t.ref_id) } return m })()
    const openN = [...open.values()].reduce((a, c) => a + c.contracts, 0)
    const free = r6(st.shares - openN * 100)
    const divsLeft = L.filter(t => t.type === 'DIVIDEND').map(d => ({ d, left: d.amount - L.filter(r => r.type === 'RECLASS' && r.ref_id === d.id).reduce((a, r) => a + r.amount, 0) })).filter(x => x.left > 0.01)
    const opts = ['BUY', 'BUY', 'DIVIDEND', 'DRIP']
    if (st.shares > 0) opts.push('SELL', 'SELL')
    if (st.shares > 0 && roc && st.schwabBasis > 1) opts.push('ROC')
    if (divsLeft.length && roc && st.schwabBasis > 1 && st.shares > 0) opts.push('RECLASS')
    if (Math.floor((free + 1e-9) / 100) >= 1) opts.push('CC_OPEN', 'CC_OPEN')
    if (open.size) opts.push('CC_CLOSE', 'CC_EXPIRE', 'CC_ROLL', 'CALLED')
    const type = pick(opts)
    const base = { id: s.id, date: s.date }
    let t
    const tiny = rnd() < 0.2
    if (type === 'BUY' || type === 'DRIP') {
      const sh = r6(tiny ? rf(0.000001, 0.01) : type === 'DRIP' ? rf(0.001, 3) : rnd() < 0.3 ? ri(100, 400) : rf(0.01, 150))
      const price = cents(rf(1, 120))
      t = { ...base, type, shares: sh, price, amount: cents(sh * price), fees: type === 'BUY' && rnd() < 0.4 ? cents(rf(0, 5)) : 0 }
    } else if (type === 'DIVIDEND') {
      const net = cents(rf(0.01, 40)); t = { ...base, type, amount: net, tax_withheld: rnd() < 0.6 ? cents(net * 0.15) : null }
    } else if (type === 'SELL') {
      const max = free
      if (!(max > 0)) { t = { ...base, type: 'DIVIDEND', amount: 1 } } else {
        const sh = rnd() < 0.3 ? max : r6(Math.max(0.000001, rf(0, max)))
        t = { ...base, type, shares: sh, price: cents(rf(1, 150)), fees: rnd() < 0.4 ? cents(rf(0, 5)) : 0 }; t.amount = cents(t.shares * t.price)
      }
    } else if (type === 'ROC') {
      t = { ...base, type, amount: Math.max(0.01, cents(rf(0, st.schwabBasis * 0.3))) }
    } else if (type === 'RECLASS') {
      const x = pick(divsLeft)
      t = { ...base, type, ref_id: x.d.id, amount: Math.max(0.01, cents(Math.min(x.left, rf(0, st.schwabBasis * 0.3)))) }
    } else if (type === 'CC_OPEN' || type === 'CC_ROLL') {
      const ref = type === 'CC_ROLL' ? pick([...open.values()]) : null
      const room = Math.floor((free + 1e-9) / 100) + (ref ? ref.contracts : 0)
      if (room < 1) { t = { ...base, type: 'DIVIDEND', amount: 1 } } else {
        const contracts = ri(1, room), premium = cents(rf(type === 'CC_ROLL' ? -1 : 0.05, 3))
        t = { ...base, type, contracts, strike: 50, expiry: '2027-12-31', premium, amount: cents(premium * 100 * contracts), fees: rnd() < 0.5 ? cents(0.66 * contracts) : 0, ...(ref ? { ref_id: ref.id } : {}) }
      }
    } else if (type === 'CC_CLOSE' || type === 'CC_EXPIRE') {
      const ref = pick([...open.values()])
      t = type === 'CC_EXPIRE' ? { ...base, type, ref_id: ref.id } : { ...base, type, ref_id: ref.id, premium: 0.2, amount: cents(20 * ref.contracts), fees: rnd() < 0.5 ? 0.66 : 0 }
    } else { // CALLED: assignment sells contracts × 100 at the strike
      const ref = pick([...open.values()])
      t = { ...base, type: 'SELL', ref_id: ref.id, shares: ref.contracts * 100, price: 50, amount: ref.contracts * 5000, fees: 0 }
    }
    if (!isValid([...L, t])) t = { ...base, type: 'DIVIDEND', amount: 0.5 }   // never emit an invalid row
    L.push(t)
  }
  return L
}

// ── Shrinker: drop rows (and anything that refers to them) while the failure holds
function shrink(L, fails) {
  let cur = L, changed = true
  while (changed) {
    changed = false
    for (const row of cur) {
      const drop = new Set([row.id]); let grew = true
      while (grew) { grew = false; for (const r of cur) if (r.ref_id != null && drop.has(r.ref_id) && !drop.has(r.id)) { drop.add(r.id); grew = true } }
      const next = cur.filter(r => !drop.has(r.id))
      if (next.length < cur.length && isValid(next) && fails(next)) { cur = next; changed = true; break }
    }
  }
  return cur
}
const show = (L) => [...L].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  .map(t => '      ' + JSON.stringify(Object.fromEntries(Object.entries(t).filter(([, v]) => v != null && v !== 0 || ['amount'].includes(''))))).join('\n')

const near = (a, b, e) => Math.abs(a - b) < e
const sameLots = (a, b) => a.length === b.length && a.every((l, i) => l.id === b[i].id && near(l.shares, b[i].shares, 1e-9) && near(l.cost, b[i].cost, 0.005))
const sig = (s) => s.error ? `ERR ${s.error}` : JSON.stringify([s.shares, s.totalCost, s.schwabBasis, s.realized, s.dividends, s.roc, s.ccNet, s.lots])

/** Run a property over RUNS random ledgers; report first failure shrunk. */
function property(name, fn, opts) {
  rnd = mulberry32(SEED ^ [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))
  let bad = 0, first = null
  for (let i = 0; i < RUNS; i++) {
    const L = genLedger(opts)
    const r = fn(L)
    if (r !== true) { bad++; if (!first) first = { L, r } }
  }
  if (!bad) { passed++; console.log(`  ok   ${name} (${RUNS} ledgers)`); return }
  failed++; fails.push(name)
  const min = shrink(first.L, (x) => fn(x) !== true)
  console.log(`  FAIL ${name} — ${bad}/${RUNS} ledgers (seed ${SEED})\n         ${fn(min)}\n      minimal ledger:\n${show(min)}`)
}

console.log(`\nseed ${SEED}, ${RUNS} ledgers per property`)

console.log('\n1–3. Engine vs independent model (shares, adjusted total, FIFO Schwab basis, lots)')
property('shares = BUY + DRIP − SELL, never negative', (L) => {
  const s = tryReplay(L); if (s.error) return `engine rejected a valid ledger: ${s.error}`
  const sum = L.reduce((a, t) => a + (t.type === 'SELL' ? -t.shares : ['BUY', 'DRIP'].includes(t.type) ? t.shares : 0), 0)
  if (s.shares < 0 || Object.is(s.shares, -0) && false) return `negative shares ${s.shares}`
  return near(s.shares, sum, 1e-6) && near(s.shares, model(L).shares, 1e-9) || `shares ${s.shares} vs ${sum}`
})
property('adjusted total = BUY(+fee) + DRIP − net div − net CC − ROC − cost removed by sells', (L) => {
  const s = tryReplay(L); if (s.error) return s.error
  const m = model(L)
  return near(s.totalCost, m.totalCost, 0.005) || `engine ${s.totalCost} vs model ${m.totalCost}`
})
property('realised / dividends / roc / rocGain / ccNet / tax match the model', (L) => {
  const s = tryReplay(L); if (s.error) return s.error
  const m = model(L)
  for (const k of ['realized', 'dividends', 'roc', 'rocGain', 'ccNet', 'taxWithheld']) if (!near(s[k], m[k], 0.005)) return `${k}: engine ${s[k]} vs model ${m[k]}`
  return true
})
property('Schwab basis = remaining FIFO lots (no dividends, no premium, ROC pro rata)', (L) => {
  const s = tryReplay(L); if (s.error) return s.error
  const m = model(L)
  if (!near(s.schwabBasis, m.schwabBasis, 0.005)) return `schwab ${s.schwabBasis} vs ${m.schwabBasis}`
  if (!near(s.schwabBasis, s.lots.reduce((a, l) => a + l.cost, 0), 1e-9)) return 'schwabBasis ≠ Σ lots'
  if (!near(s.lots.reduce((a, l) => a + l.shares, 0), s.shares, 1e-6)) return `Σ lot shares ${s.lots.reduce((a, l) => a + l.shares, 0)} ≠ shares ${s.shares}`
  return sameLots(s.lots, m.lots) || `lots differ: ${JSON.stringify(s.lots)} vs ${JSON.stringify(m.lots)}`
})
property('Schwab basis with no ROC/RECLASS = cost of the shares still held, FIFO (never touched by div/premium)', (L) => {
  const s = tryReplay(L); if (s.error) return s.error
  // straight FIFO over BUY/DRIP/SELL only
  const q = []; for (const t of order(L)) {
    if (t.type === 'BUY' || t.type === 'DRIP') q.push({ sh: t.shares, c: t.amount + (t.type === 'BUY' ? t.fees ?? 0 : 0) })
    if (t.type === 'SELL') { let left = t.shares; while (left > 1e-9 && q.length) { const l = q[0], take = Math.min(l.sh, left); l.c -= l.c * take / l.sh; l.sh = r6(l.sh - take); left = r6(left - take); if (l.sh <= 1e-9) q.shift() } }
  }
  const fifo = s.shares === 0 ? 0 : q.reduce((a, l) => a + l.c, 0)
  return near(s.schwabBasis, fifo, 0.005) || `schwab ${s.schwabBasis} vs plain FIFO ${fifo}`
}, { roc: false })

console.log('\n4. Insertion order / id relabelling')
property('shuffled input → identical result (exact)', (L) => sig(tryReplay(L)) === sig(tryReplay(shuffle(L))) || 'differs after shuffle')
property('ids relabelled monotonically (id·7+1000) → identical result', (L) => {
  const f = (x) => x == null ? x : x * 7 + 1000
  const L2 = L.map(t => ({ ...t, id: f(t.id), ref_id: f(t.ref_id) }))
  const a = tryReplay(L), b = tryReplay(L2)
  return (!a.error && !b.error && sig({ ...a, lots: [] }) === sig({ ...b, lots: [] })) || 'differs after relabel'
})
// ids are SERIAL (int4) so pg returns numbers; string ids would break ref_id lookups (Map keys) — not tested.
console.log('\n5. Delete then re-add the same row (re-added row gets a fresh, higher id)')
property('BUG: delete + re-add an unreferenced row returns every total exactly', (L) => {
  const before = tryReplay(L)
  const maxId = Math.max(...L.map(t => t.id))
  for (const row of L) {
    if (L.some(r => r.ref_id === row.id) || row.ref_id != null) continue   // route blocks deleting referenced rows
    const after = tryReplay([...L.filter(r => r !== row), { ...row, id: maxId + 1 }])
    if (after.error) return `re-adding ${row.type} id ${row.id} on ${row.date} is REJECTED: ${after.error}`
    for (const k of ['shares', 'totalCost', 'schwabBasis', 'realized']) if (!near(after[k], before[k], 0.005)) return `re-adding ${row.type} id ${row.id} on ${row.date} moves ${k}: ${before[k]} → ${after[k]}`
  }
  return true
})

console.log('\n6. Float drift')
{
  const L = [{ id: 1, type: 'BUY', date: '2026-01-01', shares: 10, amount: 100 }]
  for (let i = 0; i < 500; i++) L.push({ id: 2 + i, type: 'DRIP', date: '2026-02-01', shares: 0.0001, amount: 0.03 })
  L.push({ id: 1000, type: 'DIVIDEND', date: '2026-01-15', amount: 15 })
  let s = replay(L)
  check('500 × DRIP $0.03: total to the cent', s.totalCost, 100 - 15 + 15)
  check('500 × DRIP 0.0001 sh: shares exactly 10.05', s.shares, 10.05, 1e-12)
  check('Schwab basis to the cent', s.schwabBasis, 115)
  s = replay([...L, { id: 2000, type: 'SELL', date: '2026-03-01', shares: 10.05, amount: 120 }])
  check('sell everything → shares exactly 0 (no phantom)', s.shares === 0, true)
  check('sell everything → no lots left', s.lots.length, 0)
  check('sell everything → total cost exactly 0', s.totalCost === 0, true)
  const tenths = [1, 2, 3].map(i => ({ id: i, type: 'BUY', date: '2026-01-01', shares: 0.1, amount: 1 }))
  s = tryReplay([...tenths, { id: 9, type: 'SELL', date: '2026-01-02', shares: 0.3, amount: 3 }])
  check('0.1 + 0.1 + 0.1 then sell 0.3 is accepted and flat', s.error ?? s.shares === 0, true)
  s = tryReplay([{ id: 1, type: 'BUY', date: '2026-01-01', shares: 0.000001, amount: 0.01 }, { id: 2, type: 'SELL', date: '2026-01-02', shares: 0.000001, amount: 0.01 }])
  check('smallest r6 share buy/sell round-trips to 0', s.error ?? s.shares === 0, true)
  // FIFO partial lots, many times
  const P = [{ id: 1, type: 'BUY', date: '2026-01-01', shares: 1, amount: 33.33 }]
  for (let i = 0; i < 300; i++) P.push({ id: 2 + i, type: 'SELL', date: '2026-02-01', shares: 0.003, amount: 0.1 })
  s = replay(P)
  check('300 partial sells of 0.003: shares 0.1', s.shares, 0.1, 1e-12)
  check('… Schwab lot cost = 10% of 33.33', s.schwabBasis, 3.333, 0.001)
  check('… adjusted total = 10% of 33.33', s.totalCost, 3.333, 0.001)
}

console.log('\nSELL edge cases')
const B = (id, date, shares, amount, f = {}) => ({ id, type: 'BUY', date, shares, amount, ...f })
throws('SELL more than held is rejected', () => replay([B(1, '2026-01-01', 5, 50), { id: 2, type: 'SELL', date: '2026-01-02', shares: 5.0001, amount: 1 }]), /only 5 held/)
throws('SELL dated before the BUY is rejected', () => replay([B(1, '2026-02-01', 5, 50), { id: 2, type: 'SELL', date: '2026-01-01', shares: 1, amount: 1 }]), /only 0 held/)
// Re-specified for the fixed same-day order (owner's decision #2): BUYs run before a same-day SELL whatever the ids.
check('SELL with a LOWER id than a same-day BUY is accepted (same-day BUYs run first)', tryReplay([B(5, '2026-01-01', 5, 50), { id: 4, type: 'SELL', date: '2026-01-01', shares: 5, amount: 60 }]).error ?? 'accepted', 'accepted')
{
  // Sam enters BUY then SELL on the same day; later deletes the BUY to fix a typo and re-enters it → new higher id
  const L = [B(1, '2026-01-01', 5, 50), { id: 2, type: 'SELL', date: '2026-01-01', shares: 5, amount: 60 }]
  check('BUG: same-day BUY deleted and re-added (new id) is accepted again', tryReplay([L[1], { ...L[0], id: 3 }]).error ?? 'accepted', 'accepted')
  // same-day DIVIDEND and SELL: which went first is decided only by entry order
  const D = [B(1, '2026-01-01', 10, 1000), { id: 2, type: 'SELL', date: '2026-02-01', shares: 5, amount: 600 }, { id: 3, type: 'DIVIDEND', date: '2026-02-01', amount: 10 }]
  check('BUG: same-day SELL + DIVIDEND total does not depend on entry order', replay([D[0], D[1], { ...D[2], id: 0.5 + 1 }]).totalCost, replay(D).totalCost)
}

console.log('\nDividends / ROC / RECLASS probes')
{
  // Re-specified per the owner's decision #9: a 0-share dividend is legitimate (ex-date vs pay-date) -
  // accepted, booked as income in the tax report, and never touches basis.
  const early = tryReplay([{ id: 1, type: 'DIVIDEND', date: '2026-01-01', amount: 5, tax_withheld: 0.75 }, B(2, '2026-02-01', 10, 100)])
  check('BUG: DIVIDEND with 0 shares is accepted, the later BUY keeps its full basis', early.error ?? [early.totalCost, early.schwabBasis, early.dividends], [100, 100, 5])
  check('... and it is income in that tax year (net 5, tax 0.75, gross 5.75)', early.error ?? (({ netDividends, taxWithheld, grossDividends }) => [netDividends, taxWithheld, grossDividends])(taxYear(early.events, 2026)), [5, 0.75, 5.75])
  const re = replay([B(1, '2026-01-01', 10, 100), { id: 2, type: 'SELL', date: '2026-02-01', shares: 10, amount: 120 },
    { id: 3, type: 'DIVIDEND', date: '2026-02-15', amount: 5 }, B(4, '2026-06-01', 10, 100)])
  check('BUG: dividend paid after a full exit must not lower a later re-buy\'s basis', re.totalCost, 100)
  const flat = replay([B(1, '2026-01-01', 10, 100), { id: 2, type: 'SELL', date: '2026-02-01', shares: 10, amount: 120 }, { id: 3, type: 'DIVIDEND', date: '2026-02-15', amount: 5 }])
  check('BUG: flat holding (0 shares) shows total cost 0, not a negative orphan', flat.totalCost, 0)
  throws('ROC on a day with 0 shares is rejected', () => replay([B(1, '2026-01-01', 1, 10), { id: 2, type: 'SELL', date: '2026-01-02', shares: 1, amount: 10 }, { id: 3, type: 'ROC', date: '2026-01-03', amount: 1 }]), /no shares/)

  const big = replay([B(1, '2026-01-01', 10, 100), { id: 2, type: 'ROC', date: '2026-02-01', amount: 150 }])
  check('ROC > basis: adjusted total may go negative (by design)', big.totalCost, -50)
  check('BUG: ROC > basis: Schwab lot basis floors at 0 (excess is a capital gain), not negative', big.schwabBasis, 0)
  check('... the $50 excess is a capital gain in that tax year', [big.rocGain, taxYear(big.events, 2026).rocGain], [50, 50])

  const rocSell = replay([B(1, '2026-01-01', 10, 100), B(2, '2026-02-01', 10, 200), { id: 3, type: 'ROC', date: '2026-03-01', amount: 20 }, { id: 4, type: 'SELL', date: '2026-04-01', shares: 15, amount: 300 }])
  check('sell after ROC: FIFO carries the ROC-reduced lot cost (lot2 half of 190)', rocSell.lots.map(l => [l.id, l.shares, cents(l.cost)]), [[2, 5, 95]])
  check('sell after ROC: adjusted total = 5 × (280/20)', rocSell.totalCost, 70)

  // RECLASS
  const div = { id: 2, type: 'DIVIDEND', date: '2026-02-01', amount: 10 }
  const partial = replay([B(1, '2026-01-01', 10, 100), div, { id: 3, type: 'SELL', date: '2026-03-01', shares: 9, amount: 90 }, { id: 4, type: 'RECLASS', date: '2026-04-01', ref_id: 2, amount: 10 }])
  check('BUG: RECLASS after a partial sell only lowers the remaining share\'s lot by its $1/sh (not all $10)', partial.schwabBasis, 9)
  check('... the $9 that belonged to the 9 sold shares is a capital gain', partial.rocGain, 9)
  const neg = replay([B(1, '2026-01-01', 10, 10), { ...div, amount: 5 }, { id: 3, type: 'SELL', date: '2026-03-01', shares: 9, amount: 9 }, { id: 4, type: 'RECLASS', date: '2026-04-01', ref_id: 2, amount: 5 }])
  check('BUG: RECLASS after a partial sell never drives a lot negative', neg.schwabBasis >= 0, true)
  const afterExit = tryReplay([B(1, '2026-01-01', 10, 100), div, { id: 3, type: 'SELL', date: '2026-03-01', shares: 10, amount: 120 }, { id: 4, type: 'RECLASS', date: '2026-04-01', ref_id: 2, amount: 10 }])
  check('RECLASS after a full sell is accepted (lots empty, ROC +10, dividends 0)', afterExit.error ?? [afterExit.schwabBasis, afterExit.roc, afterExit.dividends], [0, 10, 0])
  throws('RECLASS referencing another holding\'s dividend id is rejected', () => replay([B(1, '2026-01-01', 10, 100), { id: 3, type: 'RECLASS', date: '2026-04-01', ref_id: 99, amount: 1 }]), /pick the earlier dividend/)
  throws('RECLASS dated before its dividend is rejected', () => replay([B(1, '2026-01-01', 10, 100), { ...div, date: '2026-05-01' }, { id: 4, type: 'RECLASS', date: '2026-04-01', ref_id: 2, amount: 1 }]), /pick the earlier dividend/)
  throws('RECLASS capped at the dividend\'s net amount (+ a cent)', () => replay([B(1, '2026-01-01', 10, 100), div, { id: 4, type: 'RECLASS', date: '2026-04-01', ref_id: 2, amount: 10.01 }]), /only has/)
  const tx = replay([B(1, '2026-01-01', 10, 100), { ...div, tax_withheld: 1.5 }])
  check('tax withheld never touches either basis', [tx.totalCost, tx.schwabBasis], [90, 100])
}

console.log('\nFees')
{
  const f = replay([B(1, '2026-01-01', 10, 100, { fees: 1 }), { id: 2, type: 'SELL', date: '2026-02-01', shares: 5, amount: 60, fees: 1 }])
  check('BUY fee in adjusted total and in Schwab lot', [f.totalCost, f.schwabBasis], [50.5, 50.5])
  check('SELL fee comes off realised only', f.realized, 59 - 50.5)
  const g = replay([B(1, '2026-01-01', 10, 100), { id: 2, type: 'DRIP', date: '2026-02-01', shares: 1, amount: 10, fees: 3 }, { id: 3, type: 'DIVIDEND', date: '2026-02-01', amount: 10, fees: 3 }])
  check('fees on DRIP/DIVIDEND are ignored by the engine (the route also zeroes them)', [g.totalCost, g.fees], [100, 0])
}

console.log('\nCovered-call probes')
{
  const o = { id: 2, type: 'CC_OPEN', date: '2026-01-02', contracts: 1, expiry: '2026-02-20', amount: 100 }
  check('BUG: called-away SELL must deliver contracts × 100 shares (50 for 1 contract accepted?)',
    tryReplay([B(1, '2026-01-01', 200, 2000), o, { id: 3, type: 'SELL', date: '2026-02-20', ref_id: 2, shares: 50, amount: 2500 }]).error ? 'rejected' : 'accepted', 'rejected')
}

console.log('\nZero / negative amounts (engine alone; the route rejects these first)')
{
  const z = tryReplay([B(1, '2026-01-01', 10, 100), { id: 2, type: 'SELL', date: '2026-01-02', shares: 0, amount: 0 }])
  check('SELL of 0 shares leaves totals finite', z.error ?? Number.isFinite(z.totalCost), true)
  const z2 = tryReplay([{ id: 1, type: 'SELL', date: '2026-01-02', shares: 0, amount: 0 }])
  check('SELL of 0 shares on an empty holding leaves totals finite (no NaN)', z2.error ?? Number.isFinite(z2.totalCost), true)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (fails.length) console.log('failing:\n  - ' + fails.join('\n  - '))
process.exit(failed ? 1 : 0)
