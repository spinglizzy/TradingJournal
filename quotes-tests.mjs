/**
 * Auto-price tests — Finnhub is mocked, no network, no database.
 *
 *   node quotes-tests.mjs
 */
import { finnhubQuote, refreshQuotes, applyQuotes, CACHE_MS } from './server/lib/quotes.js'
import { replay } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
function check(name, actual, expected, eps = 0.005) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < eps : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

const NOW = Date.parse('2026-11-07T06:00:00Z')
const old = new Date(NOW - CACHE_MS - 1000).toISOString()
const KEY = 'secret-key-123'

// Two holdings, each 10 shares bought for $100 total.
const ledgers = { 1: [{ id: 11, type: 'BUY', date: '2026-01-01', shares: 10, amount: 100 }],
                  2: [{ id: 21, type: 'BUY', date: '2026-01-01', shares: 10, amount: 100 }] }
const holdingsAt = (p1, p2) => [
  { id: 1, ticker: 'JEPI', current_price: p1, price_updated_at: old, price_source: 'auto' },
  { id: 2, ticker: 'ORC',  current_price: p2, price_updated_at: old, price_source: 'manual' },
]
/** What the Dragon tab computes from a holding: market value and unrealised P/L. */
const value = (h) => {
  const s = replay(ledgers[h.id])
  const mv = h.current_price != null ? s.shares * h.current_price : null
  return { mv, unreal: mv != null ? mv - s.totalCost : null }
}
/** Mock fetch: a map of symbol → [status, body]. Records the URLs it saw. */
function mockFetch(table) {
  const seen = []
  const fn = async (url) => {
    seen.push(url)
    const sym = new URL(url).searchParams.get('symbol')
    const [status, body] = table[sym] ?? [200, { c: 0 }]
    return { status, ok: status >= 200 && status < 300, json: async () => body }
  }
  fn.seen = seen
  return fn
}
const run = async (holdings, table) => {
  const f = mockFetch(table)
  const res = await refreshQuotes(holdings, finnhubQuote(KEY, f), { now: NOW })
  const changed = applyQuotes(holdings, res, new Date(NOW).toISOString())
  const after = holdings.map(h => changed.find(c => c.id === h.id) ?? h)
  return { res, after, calls: f.seen }
}

console.log('\nSuccess')
{
  const { after, calls } = await run(holdingsAt(9, 4), { JEPI: [200, { c: 57.5 }], ORC: [200, { c: 5.2 }] })
  check('both prices updated', after.map(h => h.current_price), [57.5, 5.2])
  check('source becomes auto (manual overwritten by a successful refresh)', after.map(h => h.price_source), ['auto', 'auto'])
  check('timestamp set to now', after[0].price_updated_at, new Date(NOW).toISOString())
  check('JEPI market value uses the new price', value(after[0]).mv, 575)
  check('JEPI unrealised P/L uses the new price', value(after[0]).unreal, 475)
  check('key sent only to Finnhub, as a query param', calls.every(u => u.startsWith('https://finnhub.io/api/v1/quote?') && u.includes(KEY)), true)
}

console.log('\nOne ticker failing')
{
  const { res, after } = await run(holdingsAt(9, 4), { JEPI: [200, { c: 57.5 }], ORC: [200, { c: 0 }] })
  check('JEPI updated', after[0].current_price, 57.5)
  check('ORC keeps its last price — never blanked or 0', after[1].current_price, 4)
  check('ORC keeps its source', after[1].price_source, 'manual')
  check('ORC carries a warning', after[1].price_error, 'No quote for this ticker')
  check('ORC market value still uses the last price', value(after[1]).mv, 40)
  check('ORC unrealised P/L still uses the last price', value(after[1]).unreal, -60)
  check('reported as one failure', res.failures.length, 1)
}

console.log('\nRate limited')
{
  const { res, after, calls } = await run(holdingsAt(9, 4), { JEPI: [429, {}], ORC: [200, { c: 5.2 }] })
  check('stops after the 429 — ORC never requested', calls.length, 1)
  check('both keep their prices', after.map(h => h.current_price), [9, 4])
  check('both warned', after.every(h => /Rate limited/.test(h.price_error)), true)
  check('market values unchanged', after.map(h => value(h).mv), [90, 40])
  check('2 failures', res.failures.length, 2)
}

console.log('\nBad key')
{
  const { after, calls } = await run(holdingsAt(9, null), { JEPI: [401, { error: 'Invalid API key' }] })
  check('stops after the 401', calls.length, 1)
  check('prices untouched (a missing price stays missing, not 0)', after.map(h => h.current_price), [9, null])
  check('warning says the key was rejected', after[0].price_error, 'Finnhub rejected the API key')
  check('no market value without a price', value(after[1]).mv, null)
  check('the key never appears in any warning', after.every(h => !String(h.price_error).includes(KEY)), true)
}

console.log('\n15-minute cache')
{
  const fresh = new Date(NOW - 5 * 60 * 1000).toISOString()
  const hs = [
    { id: 1, ticker: 'JEPI', current_price: 9, price_updated_at: fresh, price_source: 'auto' },
    { id: 2, ticker: 'ORC',  current_price: 4, price_updated_at: fresh, price_source: 'manual' },
  ]
  const { res, after, calls } = await run(hs, { JEPI: [200, { c: 57.5 }], ORC: [200, { c: 5.2 }] })
  check('no API calls inside 15 minutes', calls.length, 0)
  check('a just-typed manual price survives', after[1], hs[1])
  check('both skipped', res.skipped, [1, 2])
}

console.log('\nNetwork error')
{
  const res = await refreshQuotes(holdingsAt(9, 4), finnhubQuote(KEY, async () => { throw new Error('ECONNRESET') }), { now: NOW })
  check('unreachable → per-ticker failure, run continues', res.failures.map(f => f.error), ['Price service unreachable', 'Price service unreachable'])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
