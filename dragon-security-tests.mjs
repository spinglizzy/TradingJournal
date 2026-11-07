// Dragon API security / robustness tests. Pure: no database, no internet.
// The real router runs on a local express app; pool.query / pool.connect are swapped
// for a recorder, and outbound Finnhub calls are stubbed.
//   node dragon-security-tests.mjs        (exit 1 if any test fails)
// Tests named "BUG: ..." describe a real defect and FAIL until it's fixed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import express from 'express'
import pool from './server/db.js'
import router, { restoreStore } from './server/routes/dragon.js'
import { restoreBackup } from './server/lib/dragonBackup.js'

process.env.FINNHUB_API_KEY = 'TESTKEY_SECRET_123'
const KEY = process.env.FINNHUB_API_KEY
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'

// ── fake DB ──────────────────────────────────────────────────────────────────
let handler = () => ({ rows: [] }), log = []
const q = async (sql, params = []) => { log.push({ sql, params }); return (await handler(sql, params)) ?? { rows: [] } }
pool.query = q
pool.connect = async () => ({ query: q, release() {} })
const reset = (h) => { handler = h; log = [] }
const writes = () => log.filter(l => /^\s*(INSERT|UPDATE|DELETE)/i.test(l.sql))

// ── app, with the production error handler from server/app.js ───────────────
let userId = A
const app = express(); app.use(express.json({ limit: '10mb' }))
app.use((req, _r, n) => { req.userId = userId; n() }); app.use('/d', router)
app.use((err, _q, res, _n) => { const s = err.status || err.statusCode || 500; res.status(s).json({ error: s < 500 ? err.message : 'Internal server error' }) })
const srv = app.listen(0)
const base = `http://localhost:${srv.address().port}/d`
const realFetch = globalThis.fetch
let finnhub = null, finnhubCalls = 0
globalThis.fetch = (url, opts) => {
  if (String(url).startsWith('https://finnhub.io')) { finnhubCalls++; return finnhub(url) }
  return realFetch(url, opts)
}
const call = async (m, p, b) => { const r = await realFetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: m === 'GET' ? undefined : b && JSON.stringify(b) }); return { status: r.status, text: await r.text() } }

const holding = { id: 1, user_id: A, ticker: 'ZZ', pays_dividend: true, drip: true, current_price: 10, price_updated_at: null, price_source: 'manual', price_error: null }
/** A one-holding ledger owned by A; anything asked for as another user comes back empty. */
const ledgerDb = (txs = []) => (sql, p) => {
  if (/FROM dragon_holdings WHERE id = \$1 AND user_id = \$2/.test(sql)) return { rows: p[1] === A && Number(p[0]) === 1 ? [holding] : [] }
  if (/FROM dragon_transactions WHERE holding_id = \$1 AND user_id = \$2/.test(sql)) return { rows: p[1] === A ? txs : [] }
  if (/FROM dragon_transactions WHERE id = \$1 AND user_id = \$2/.test(sql)) return { rows: p[1] === A ? txs.filter(t => t.id === Number(p[0])) : [] }
  if (/FROM dragon_reconciliations WHERE id = \$1 AND user_id = \$2/.test(sql)) return { rows: p[1] === A ? [{ id: 3 }] : [] }
  if (/^\s*INSERT INTO dragon_transactions/.test(sql)) return { rows: [{ id: 99, shares: p[4], amount: p[6] }] }
  return { rows: [] }
}

const memStore = () => { let n = 0; return { isEmpty: async () => true, wipe: async () => {}, insertHolding: async () => ({ id: ++n }), insertTx: async (hid, t) => ({ ...t, id: ++n, holding_id: hid }) } }
const backup = (holdings, transactions) => ({ app: 'pulse-journal-dragon', version: 1, holdings, transactions })
const tx = (o) => ({ shares: null, price: null, amount: 0, fees: 0, tax_withheld: null, notes: null, strike: null, expiry: null, contracts: null, premium: null, ref_id: null, import_hash: null, ...o })

const CSV = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\r\n' +
  '01/03/2026,Buy,ZZT,ZZ TEST,5,$10.00,,-$50.00\r\n01/02/2026,Buy,ZZT,ZZ TEST,10,$10.00,,-$100.00\r\n'
const importDb = (onInsert) => { let n = 0; return (sql, p) => {
  if (/INSERT INTO dragon_holdings/.test(sql)) return { rows: [{ id: 1, ticker: p[1], pays_dividend: false }] }
  if (/^\s*INSERT INTO dragon_transactions/.test(sql)) { n++; onInsert?.(n); return { rows: [{ id: 100 + n, holding_id: p[0], date: p[2], type: p[3], shares: p[4], price: p[5], amount: p[6], fees: p[7], ref_id: null }] } }
  return { rows: [] }
} }

// ── tests ────────────────────────────────────────────────────────────────────
const tests = []
const test = (name, fn) => tests.push([name, fn])

test('user B gets 404 on every route that names A\'s rows, and nothing is written', async () => {
  const txs = [tx({ id: 7, holding_id: 1, date: '2026-01-02', type: 'BUY', shares: 200, price: 10, amount: 2000 }), tx({ id: 8, holding_id: 1, date: '2026-02-02', type: 'DIVIDEND', amount: 5 })]
  reset(ledgerDb(txs)); userId = B
  try {
    const probes = [
      ['PUT', '/holdings/1', { name: 'x', user_id: B }], ['DELETE', '/holdings/1'],
      ['POST', '/transactions', { holding_id: 1, type: 'BUY', date: '2026-01-03', shares: 1, price: 1 }],
      ['POST', '/transactions', { holding_id: 1, type: 'RECLASS', date: '2026-03-01', ref_id: 8, amount: 1 }],
      ['POST', '/transactions/batch', { date: '2026-01-03', buys: [{ holding_id: 1, shares: 1, price: 1 }] }],
      ['PUT', '/transactions/8', { date: '2026-02-02', amount: 9, holding_id: 1, user_id: B }], ['DELETE', '/transactions/7'],
      ['GET', '/reconciliations/3'],
    ]
    for (const [m, p, b] of probes) assert.equal((await call(m, p, b)).status, 404, `${m} ${p}`)
    assert.equal(writes().length, 0)
  } finally { userId = A }
})

test('restoreStore forces the signed-in user onto every row, whatever the backup says', async () => {
  reset(() => ({ rows: [{ id: 1 }] }))
  const s = restoreStore({ query: q }, A)
  await s.insertHolding({ user_id: B, ticker: 'X' })
  await s.insertTx(1, tx({ user_id: B, type: 'BUY', date: '2026-01-01' }))
  assert.equal(log[0].params[0], A); assert.equal(log[1].params[1], A)
})

test('restore rejects a close that points at another holding\'s call (replay)', async () => {
  const b = backup([{ id: 1, ticker: 'A' }, { id: 2, ticker: 'B' }], [
    tx({ id: 1, holding_id: 1, date: '2026-01-01', type: 'BUY', shares: 100, price: 1, amount: 100 }),
    tx({ id: 2, holding_id: 1, date: '2026-01-02', type: 'CC_OPEN', strike: 2, expiry: '2026-02-20', contracts: 1, premium: 0.1, amount: 10 }),
    tx({ id: 3, holding_id: 2, date: '2026-01-03', type: 'CC_CLOSE', ref_id: 2, premium: 0.05, amount: 5 })])
  await assert.rejects(restoreBackup(b, memStore()), /isn't open|Pick the covered call this closes/)   // now caught by normalize() before replay
})

test('restore: "__proto__" keys in a backup do not pollute Object.prototype', async () => {
  const b = JSON.parse('{"app":"pulse-journal-dragon","version":1,"holdings":[{"id":1,"ticker":"Z","__proto__":{"polluted":1}}],"transactions":[]}')
  await restoreBackup(b, memStore())
  assert.equal(({}).polluted, undefined)
})

test('the Finnhub key never reaches the response or the stored price_error', async () => {
  for (const f of [() => { throw new Error(`fetch failed https://finnhub.io/api/v1/quote?token=${KEY}`) }, async () => new Response('x', { status: 500 }), async () => new Response('{bad json')]) {
    finnhub = f
    reset((sql) => /^\s*SELECT id, ticker/.test(sql) ? { rows: [{ ...holding }] } : { rows: [] })
    const r = await call('POST', '/prices/refresh')
    assert.ok(!r.text.includes(KEY)); assert.ok(!JSON.stringify(log).includes(KEY))
  }
})

test('import COMMIT path is all-or-nothing: a DB error on a later row rolls everything back', async () => {
  reset(importDb((n) => { if (n === 2) throw Object.assign(new Error('boom'), { code: 'XX000' }) }))
  const r = await call('POST', '/import', { csv: CSV, commit: true })
  assert.equal(r.status, 500)
  const ctl = log.map(l => l.sql.trim()).filter(s => /^(BEGIN|COMMIT|ROLLBACK)$/.test(s))
  assert.deepEqual(ctl, ['BEGIN', 'ROLLBACK'])
})

// ── BUGS ─────────────────────────────────────────────────────────────────────
test('BUG: BUY shares 1e303 is stored as Infinity (num() checks finiteness before r6 rounds it)', async () => {
  reset(ledgerDb())
  const r = await call('POST', '/transactions', { holding_id: 1, type: 'BUY', date: '2026-01-05', shares: 1e303, price: 1 })
  assert.equal(r.status, 400, `got ${r.status}; INSERT shares param = ${writes()[0]?.params[4]}`)
})

test('BUG: BUY shares 1e-7 passes "greater than 0" then rounds to a 0-share buy', async () => {
  reset(ledgerDb())
  const r = await call('POST', '/transactions', { holding_id: 1, type: 'BUY', date: '2026-01-05', shares: 1e-7, price: 5 })
  assert.equal(r.status, 400, `got ${r.status}; INSERT shares param = ${writes()[0]?.params[4]}`)
})

test('BUG: POST /fx lets any signed-in user overwrite the shared rate (incl. RBA) in every user\'s tax report', async () => {
  reset(() => ({ rows: [{}] }))
  await call('POST', '/fx', { date: '2026-01-02', aud_usd: 0.0001 })
  const sql = log[0].sql
  assert.ok(/user_id/.test(sql) || !/DO UPDATE/.test(sql), 'manual rate is a global upsert with no owner')
})

test('BUG: restore accepts a BUY with negative shares (rows skip normalize(); replay never checks sign)', async () => {
  const b = backup([{ id: 1, ticker: 'Z' }], [tx({ id: 1, holding_id: 1, date: '2026-01-01', type: 'BUY', shares: -100, price: 10, amount: -1000 })])
  await assert.rejects(restoreBackup(b, memStore()))
})

test('BUG: restore accepts a negative DIVIDEND amount', async () => {
  const b = backup([{ id: 1, ticker: 'Z' }], [tx({ id: 1, holding_id: 1, date: '2026-01-01', type: 'DIVIDEND', amount: -500 })])
  await assert.rejects(restoreBackup(b, memStore()))
})

test('BUG: restore accepts ref_id on a row type that never uses it (pins a cross-holding FK, then that holding can\'t be deleted)', async () => {
  const b = backup([{ id: 1, ticker: 'A' }, { id: 2, ticker: 'B' }], [
    tx({ id: 1, holding_id: 1, date: '2026-01-01', type: 'BUY', shares: 1, price: 1, amount: 1 }),
    tx({ id: 2, holding_id: 2, date: '2026-01-01', type: 'BUY', shares: 1, price: 1, amount: 1, ref_id: 1 })])
  await assert.rejects(restoreBackup(b, memStore()))
})

test('BUG: a failed quote writes back the stale current_price it read before the fetch (lost update of a price typed meanwhile)', async () => {
  finnhub = async () => new Response('x', { status: 500 })
  reset((sql) => /^\s*SELECT id, ticker/.test(sql) ? { rows: [{ ...holding }] } : { rows: [] })
  await call('POST', '/prices/refresh')
  const u = writes().find(l => /UPDATE dragon_holdings/.test(l.sql))
  assert.ok(!/current_price\s*=/.test(u.sql), 'failure path re-sets current_price/price_source from the stale snapshot')
})

test('BUG: two refreshes at once (double click) both call Finnhub for the same ticker', async () => {
  finnhub = () => new Promise(r => setTimeout(() => r(new Response('{"c":11}')), 50))
  reset((sql) => /^\s*SELECT id, ticker/.test(sql) ? { rows: [{ ...holding }] } : { rows: [] })
  finnhubCalls = 0
  await Promise.all([call('POST', '/prices/refresh'), call('POST', '/prices/refresh')])
  assert.equal(finnhubCalls, 1, `${finnhubCalls} Finnhub calls`)
})

test('BUG: import with commit: "false" (a string) COMMITS', async () => {
  reset(importDb())
  await call('POST', '/import', { csv: CSV, commit: 'false' })
  assert.ok(!log.some(l => l.sql.trim() === 'COMMIT'), 'committed')
})

test('BUG: a concurrent import losing the import_hash race gets a bare 500, not a 409', async () => {
  reset(importDb(() => { throw Object.assign(new Error('duplicate key value violates unique constraint "dragon_transactions_import_hash_idx"'), { code: '23505' }) }))
  const r = await call('POST', '/import', { csv: CSV, commit: true })
  assert.equal(r.status, 409, `got ${r.status} ${r.text}`)
})

test('BUG: GET /fx?from=2026-13-45 passes the regex and crashes with a RangeError (500)', async () => {
  reset((sql) => /max\(date\)/.test(sql) ? { rows: [{ max: '2999-01-01' }] } : { rows: [] })
  const r = await call('GET', '/fx?from=2026-13-45')
  assert.ok(r.status < 500, `got ${r.status}`)
})

test('BUG: non-numeric :id goes straight to Postgres (22P02 -> 500, pg message leaks outside production)', async () => {
  reset((sql, p) => { if (p.includes('abc')) throw Object.assign(new Error('invalid input syntax for type integer: "abc"'), { code: '22P02' }) })
  for (const [m, p] of [['PUT', '/transactions/abc'], ['DELETE', '/transactions/abc'], ['PUT', '/holdings/abc'], ['GET', '/reconciliations/abc']]) {
    assert.equal((await call(m, p, {})).status, 400, `${m} ${p}`)
  }
})

test('BUG: null entries in batch buys / reconciliation rows throw a TypeError (500)', async () => {
  reset(ledgerDb())
  assert.equal((await call('POST', '/transactions/batch', { date: '2026-01-05', buys: [null] })).status, 400, 'batch')
  assert.equal((await call('POST', '/reconciliations', { source: 'manual', rows: [null] })).status, 400, 'reconciliations')
})

test('BUG: PUT /holdings passes pays_dividend / drip / name through unvalidated ("maybe" -> pg 22P02 500, objects stored as JSON text)', async () => {
  reset(ledgerDb())
  assert.equal((await call('PUT', '/holdings/1', { pays_dividend: 'maybe' })).status, 400)
})

test('BUG: anon/authenticated can write dragon_* via Supabase REST and FKs ignore user_id (another user can pin rows on yours)', () => {
  const sql = fs.readdirSync('.').filter(f => /^(dragon|security)_migration.*\.sql$/.test(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n')
  const revoked = /REVOKE[^;]+ON[^;]*dragon_transactions[^;]+FROM[^;]*(anon|authenticated)/i.test(sql)
  const compositeFk = /FOREIGN KEY\s*\(\s*ref_id\s*,\s*user_id\s*\)/i.test(sql)
  assert.ok(revoked || compositeFk, 'no REVOKE on dragon tables and ref_id/holding_id FKs are single-column')
})

let failed = 0
for (const [name, fn] of tests) {
  try { await fn(); console.log(`PASS  ${name}`) }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`) }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
srv.close()
process.exit(failed ? 1 : 0)
