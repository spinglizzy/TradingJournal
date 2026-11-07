/**
 * Dragon dates / FX / prices / format tests — independent review. No network, no database.
 * Date tests re-run in child processes under Adelaide, UTC and New York time zones.
 *
 *   node dragon-dates-prices-tests.mjs
 *
 * A test named "BUG: ..." reproduces a real defect and FAILS until it is fixed.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { auFY, fyLabel, incomeByMonth, replay, daysTo } from './server/lib/dragonEngine.js'
import { parseRbaF11, rateFor, taxLines } from './server/lib/fx.js'
import { finnhubQuote, refreshQuotes, applyQuotes, CACHE_MS } from './server/lib/quotes.js'
import { money, signed, pct, fmtShares, todayStr } from './src/components/dragon/format.js'
import { format, parseISO } from 'date-fns'

const CHILD = process.argv[2] === '--child'
let passed = 0, failed = 0
const fails = []
function check(name, actual, expected, eps = 1e-6) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? (Number.isNaN(expected) ? Number.isNaN(actual) : Math.abs(actual - expected) < eps)
    : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else { failed++; fails.push(name); console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

/** Run fn with the clock frozen at `iso` (new Date() / Date.now()). */
function atInstant(iso, fn) {
  const Real = Date, t = Real.parse(iso)
  globalThis.Date = class extends Real {
    constructor(...a) { super(...(a.length ? a : [t])) }
    static now() { return t }
  }
  try { return fn() } finally { globalThis.Date = Real }
}
const etDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ms)

// ═══ 1. Dates / time zones (run in every TZ) ═══════════════════════════════
function dateTests() {
  const tz = process.env.TZ
  console.log(`\nDates under TZ=${tz}`)
  check(`[${tz}] 2026-06-30 is FY2025-26`, fyLabel(auFY('2026-06-30')), 'FY2025-26')
  check(`[${tz}] 2026-07-01 is FY2026-27`, fyLabel(auFY('2026-07-01')), 'FY2026-27')

  const rates = [
    { date: '2026-06-29', aud_usd: 0.66, source: 'rba' }, { date: '2026-06-30', aud_usd: 0.65, source: 'rba' },
    { date: '2026-07-01', aud_usd: 0.64, source: 'rba' },
  ]
  const ev = (date, dividend) => ({ date, dividend, tax: 0, cc: 0, realized: 0, fees: 0, roc: 0 })
  const h = [{ ticker: 'SCHD', events: [ev('2026-06-30', 10), ev('2026-07-01', 20)] }]
  const fy26 = taxLines(h, 2026, rates), fy27 = taxLines(h, 2027, rates)
  check(`[${tz}] 30 Jun dividend only in FY2025-26, at the 30 Jun rate`, fy26.lines.map(l => [l.date, l.rateDate]), [['2026-06-30', '2026-06-30']])
  check(`[${tz}] 1 Jul dividend only in FY2026-27`, fy27.lines.map(l => l.date), ['2026-07-01'])
  check(`[${tz}] FY2025-26 AUD total = 10 / 0.65`, fy26.totals.aud.dividend, 10 / 0.65)

  check(`[${tz}] month-end dividend buckets into its own month`,
    incomeByMonth([ev('2026-06-30', 1), ev('2026-07-01', 2), ev('2026-12-31', 3), ev('2027-01-01', 4)]).map(m => m.month),
    ['2026-06', '2026-07', '2026-12', '2027-01'])

  // DatePicker: parseISO + format('yyyy-MM-dd') must round-trip the stored string.
  check(`[${tz}] DatePicker round-trips 2026-06-30 / 2026-07-01`,
    ['2026-06-30', '2026-07-01', '2026-12-31'].map(d => format(parseISO(d), 'yyyy-MM-dd')), ['2026-06-30', '2026-07-01', '2026-12-31'])

  // Ledger dates are Schwab's US-Eastern trade dates. 02:00Z on 7 Nov = 12:30 Adelaide 7 Nov,
  // 21:00 New York 6 Nov: the last session was 6 Nov, so a new entry should default to 6 Nov.
  const t = '2026-11-07T02:00:00Z'
  check(`BUG: [${tz}] form default date (todayStr) at ${t} is the US-Eastern trade date`,
    atInstant(t, () => todayStr()), etDate(Date.parse(t)))
  check(`BUG: [${tz}] DTE (daysTo) for a 2026-11-20 expiry at ${t} counts from the US date (14 days)`,
    atInstant(t, () => daysTo('2026-11-20')), 14)
}

// ═══ 2. RBA FX lookup ═══════════════════════════════════════════════════════
function fxTests() {
  console.log('\nRBA rate lookup')
  const rba = (date, v) => ({ date, aud_usd: v, source: 'rba' })
  const rates = [rba('2026-12-30', 0.66), rba('2026-12-31', 0.67), rba('2027-01-04', 0.68), rba('2027-01-05', 0.69)]
  check('New Year (Fri 1 Jan 2027) falls back across the year boundary to 31 Dec',
    rateFor('2027-01-01', rates), { date: '2026-12-31', aud_usd: 0.67, source: 'rba', fallback: true })
  check('Sun 3 Jan 2027 → prior business day 31 Dec, not next (4 Jan)', rateFor('2027-01-03', rates)?.date, '2026-12-31')
  check('before the cached range → null (missing), not 0 or a later rate', rateFor('2026-12-01', rates), null)
  check('after the last RBA day → null', rateFor('2027-01-06', rates), null)
  check('manual beats RBA on the same date (list order RBA first)',
    rateFor('2027-01-04', [...rates, { date: '2027-01-04', aud_usd: 0.7, source: 'manual' }])?.source, 'manual')
  check('manual beats RBA on the same date (list order manual first)',
    rateFor('2027-01-04', [{ date: '2027-01-04', aud_usd: 0.7, source: 'manual' }, ...rates])?.source, 'manual')
  check('manual rate for a day after the RBA range is used for that exact day',
    rateFor('2027-01-06', [...rates, { date: '2027-01-06', aud_usd: 0.7, source: 'manual' }])?.aud_usd, 0.7)
  check('only manual rates (no RBA at all) → exact date still works', rateFor('2027-01-06', [{ date: '2027-01-06', aud_usd: 0.7, source: 'manual' }])?.aud_usd, 0.7)

  const csv = 'Series ID,FXRTWI,FXRUSD\n02-Jul-2026,60,0\n03-Jul-2026,60,\n06-Jul-2026,60,NaN\n07-Jul-2026,60,0.6512\n'
  check('RBA parse drops 0 / blank / NaN rates', parseRbaF11(csv), [{ date: '2026-07-07', aud_usd: 0.6512 }])

  const missing = taxLines([{ ticker: 'X', events: [{ date: '2027-01-06', dividend: 5, tax: 0.88, cc: 0, realized: 0, fees: 0, roc: 0 }] }], 2027, rates)
  check('no rate → AUD null (not 0), date listed as missing, USD still totalled',
    [missing.lines.map(l => l.aud), missing.missing, missing.totals.usd.grossDividends], [[null, null], ['2027-01-06'], 5.88])
}

// ═══ 3. Finnhub prices ══════════════════════════════════════════════════════
async function priceTests() {
  const KEY = 'secret-key-XYZ'
  const NOW = Date.parse('2026-11-07T06:00:00Z')
  const old = new Date(NOW - CACHE_MS - 1000).toISOString()
  const H = (tickers) => tickers.map((t, i) => ({ id: i + 1, ticker: t, current_price: 10 + i, price_updated_at: old, price_source: 'auto', price_error: null }))
  function mockFetch(table) {
    const seen = []
    const fn = async (url, opts) => {
      seen.push({ url, opts })
      const sym = new URL(url).searchParams.get('symbol')
      const v = table[sym] ?? [200, { c: 0 }]
      if (v instanceof Error) throw v
      const [status, body] = v
      return { status, ok: status >= 200 && status < 300, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) }
    }
    fn.seen = seen
    return fn
  }
  const run = async (hs, table) => {
    const f = mockFetch(table)
    const res = await refreshQuotes(hs, finnhubQuote(KEY, f), { now: NOW })
    const changed = applyQuotes(hs, res, new Date(NOW).toISOString())
    // A write carries only the columns the route sets (plus `seen`, the guard), merged onto the row.
    return { res, after: hs.map(h => { const c = changed.find(c => c.id === h.id); if (!c) return h; const { seen: _seen, ...cols } = c; return { ...h, ...cols } }), calls: f.seen }
  }

  console.log('\nFinnhub responses')
  {
    const { after } = await run(H(['A', 'B', 'C', 'D', 'E']),
      { A: [200, { c: 0 }], B: [200, { c: null }], C: [200, {}], D: [200, '<html>oops</html>'], E: [200, { c: 51.2, d: 0, dp: 0 }] })
    check('c=0 / c=null / {} / non-JSON never overwrite the price', after.slice(0, 4).map(h => h.current_price), [10, 11, 12, 13])
    check('… and each carries a warning', after.slice(0, 4).every(h => h.price_error === 'No quote for this ticker'), true)
    check('weekend quote (Friday close, d=0) is a normal price', after[4].current_price, 51.2)
  }
  {
    const { after, calls } = await run(H(['A', 'B', 'C']), { A: [200, { c: 20 }], B: [429, {}], C: [200, { c: 30 }] })
    check('429 mid-refresh: earlier good price kept', after[0].current_price, 20)
    check('429 mid-refresh: later tickers not requested, keep their price', [calls.length, after[2].current_price], [2, 12])
    check('429 mid-refresh: later tickers warned', /Rate limited/.test(after[2].price_error), true)
  }
  {
    const { after } = await run(H(['A']), { A: [500, {}] })
    check('HTTP 500 → keeps price, generic message', [after[0].current_price, after[0].price_error], [10, 'Price service error (HTTP 500)'])
  }
  {
    const leaky = new Error(`request to https://finnhub.io/api/v1/quote?symbol=A&token=${KEY} failed, reason: ETIMEDOUT`)
    const { after } = await run(H(['A', 'B']), { A: leaky, B: [401, { error: 'Invalid API key' }] })
    check('fetch error text containing the URL+token is not passed through', after.every(h => !String(h.price_error).includes(KEY)), true)
  }
  {
    // Finnhub's free tier answers a premium-only symbol (e.g. non-US listings) with 403 "You don't have access
    // to this resource". quotes.js treats any 403 as a bad key and stops the whole run.
    const { after, calls } = await run(H(['AAA', 'BBB', 'CCC']), { AAA: [200, { c: 5 }], BBB: [403, { error: "You don't have access to this resource." }], CCC: [200, { c: 7 }] })
    check('BUG: one 403 symbol stops the run — later tickers never refreshed (sorted by ticker, so every refresh)',
      [calls.length, after[2].current_price], [3, 7])
    check('BUG: a per-symbol 403 is reported as "Finnhub rejected the API key"', after[1].price_error !== 'Finnhub rejected the API key', true)
  }
  {
    // No timeout: a hanging socket never settles, so the route never reaches its UPDATE loop.
    const f = mockFetch({})
    const hang = (url, opts) => { f(url, opts); return new Promise(() => {}) }
    const p = refreshQuotes(H(['A']), finnhubQuote(KEY, hang), { now: NOW })
    const settled = await Promise.race([p.then(() => true), new Promise(r => setTimeout(() => r(false), 300))])
    check('BUG: Finnhub fetch has a timeout (AbortSignal passed to fetch)', !!f.seen[0]?.opts?.signal, true)
    check('(info) hanging fetch: refresh still pending after 300 ms', settled, false)
  }

  console.log('\nManual price vs refresh')
  {
    const fresh = new Date(NOW - 60_000).toISOString()
    const hs = [{ id: 1, ticker: 'A', current_price: 9.99, price_updated_at: fresh, price_source: 'manual' }]
    const { calls, after } = await run(hs, { A: [200, { c: 50 }] })
    check('manual price < 15 min old is not refreshed', [calls.length, after[0].current_price, after[0].price_source], [0, 9.99, 'manual'])
    const hs2 = [{ ...hs[0], price_updated_at: old }]
    const r2 = await run(hs2, { A: [200, { c: 50 }] })
    check('manual price > 15 min old IS overwritten by auto (by design — no UI says so)', [r2.after[0].current_price, r2.after[0].price_source], [50, 'auto'])
  }
  {
    // Simulate the route: SELECT snapshot → (slow) Finnhub → UPDATE every changed row with ALL price columns.
    // Meanwhile the user types a manual price (PUT /holdings/:id). The failure write reverts it.
    const db = { 1: { id: 1, ticker: 'A', current_price: 10, price_updated_at: old, price_source: 'auto', price_error: null } }
    const snapshot = [{ ...db[1] }]
    const res = await refreshQuotes(snapshot, async () => {
      Object.assign(db[1], { current_price: 12.34, price_updated_at: new Date(NOW).toISOString(), price_source: 'manual', price_error: null })
      throw Object.assign(new Error('No quote for this ticker'), { kind: 'not_found' })
    }, { now: NOW })
    // The route's write (server/routes/dragon.js): only the columns in the write, and only
    // WHERE price_updated_at IS NOT DISTINCT FROM the value the refresh read (`seen`).
    const routeWrite = (w) => { if (db[1].price_updated_at !== w.seen) return; const { id: _id, seen: _seen, ...cols } = w; Object.assign(db[1], cols) }
    for (const w of applyQuotes(snapshot, res)) routeWrite(w)
    check('BUG: a manual price typed while a refresh is in flight survives a failed fetch', db[1].current_price, 12.34)
    // …and a successful fetch doesn't overwrite it either
    const db2 = { id: 1, ticker: 'A', current_price: 10, price_updated_at: old, price_source: 'auto', price_error: null }
    const snap2 = [{ ...db2 }]
    const res2 = await refreshQuotes(snap2, async () => { Object.assign(db2, { current_price: 12.34, price_updated_at: new Date(NOW).toISOString(), price_source: 'manual' }); return 99 }, { now: NOW })
    for (const w of applyQuotes(snap2, res2)) { if (db2.price_updated_at !== w.seen) continue; const { id: _id, seen: _seen, ...cols } = w; Object.assign(db2, cols) }
    check('a manual price typed while a refresh is in flight survives a successful fetch too', [db2.current_price, db2.price_source], [12.34, 'manual'])
  }
}

// ═══ 4. Display helpers / engine edge cases ═════════════════════════════════
function uiTests() {
  console.log('\nFormat helpers')
  check('negative basis money', money(-12.5), '-$12.50')
  check('null price → —', money(null), '—')
  check('pct of Infinity / NaN → —', [pct(Infinity), pct(NaN), pct(null)], ['—', '—', '—'])
  check('0.0001 shares shown as 0.0001', fmtShares(0.0001), '0.0001')
  check('6-dp shares', fmtShares(1.234567), '1.234567')
  check('signed(-5)', signed(-5), '-$5.00')

  console.log('\nEngine edge cases the UI depends on')
  const sold = replay([{ id: 1, type: 'BUY', date: '2026-01-02', shares: 10, amount: 100 }, { id: 2, type: 'SELL', date: '2026-02-02', shares: 10, amount: 120 }])
  check('fully sold: shares 0, basis null (not NaN), cost 0, realised 20', [sold.shares, sold.basis, sold.totalCost, sold.realized], [0, null, 0, 20])
  const paid = replay([{ id: 1, type: 'BUY', date: '2026-01-02', shares: 10, amount: 100 }, { id: 2, type: 'DIVIDEND', date: '2026-03-31', amount: 150 }])
  check('paid-off holding: basis -5/sh', paid.basis, -5)
  const tiny = replay([{ id: 1, type: 'BUY', date: '2026-01-02', shares: 0.0001, amount: 0.01 }])
  check('0.0001 share buy: basis 100/sh, finite', [tiny.shares, tiny.basis], [0.0001, 100])
}

// ═══ Runner ═════════════════════════════════════════════════════════════════
if (CHILD) {
  dateTests()
  console.log(`__RESULT__${JSON.stringify({ passed, failed, fails })}`)
  process.exit(0)
}

const self = fileURLToPath(import.meta.url)
for (const TZ of ['Australia/Adelaide', 'UTC', 'America/New_York']) {
  const out = execFileSync(process.execPath, [self, '--child'], { env: { ...process.env, TZ }, encoding: 'utf8' })
  const [text, json] = out.split('__RESULT__')
  process.stdout.write(text)
  const r = JSON.parse(json)
  passed += r.passed; failed += r.failed; fails.push(...r.fails)
}
fxTests()
await priceTests()
uiTests()

console.log(`\n${passed} passed, ${failed} failed`)
if (fails.length) console.log('Failing:\n  ' + fails.join('\n  '))
process.exit(failed ? 1 : 0)
