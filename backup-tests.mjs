/**
 * Dragon backup round trip — export → wipe → restore → every total identical.
 * No database (in-memory store with the same interface the route uses).
 *
 *   node backup-tests.mjs
 */
import fs from 'node:fs'
import { buildBackup, backupToCsv, restoreBackup } from './server/lib/dragonBackup.js'
import { parseSchwab, planImport, runImport } from './server/lib/schwabImport.js'
import { replay, cashTotals } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}
async function rejects(name, p, re) {
  try { await p; failed++; console.log(`  FAIL ${name} (did not throw)`) }
  catch (e) { const ok = re.test(e.message); ok ? passed++ : failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${e.message}`}`) }
}

/** One store, both interfaces: the import's and the restore's. Ids keep counting up, like SERIAL. */
function memoryDb() {
  let nextId = 100
  let holdings = [], rows = []
  return {
    get holdingsList() { return holdings }, get rows() { return rows },
    // import
    hashes: async () => new Set(rows.map(r => r.import_hash).filter(Boolean)),
    holdings: async () => new Map(holdings.map(h => [h.ticker, h])),
    createHolding: async (h) => { const x = { id: nextId++, drip: h.pays_dividend, current_price: null, ...h }; holdings.push(x); return x },
    setPaysDividend: async (h) => { h.pays_dividend = true; return h },
    ledger: async (h) => rows.filter(r => r.holding_id === h.id),
    insert: async (h, tx, hash) => { const r = { ...tx, id: nextId++, holding_id: h?.id ?? null, import_hash: hash }; rows.push(r); return r },
    // restore
    isEmpty: async () => holdings.length === 0 && rows.length === 0,
    wipe: async () => { holdings = []; rows = [] },
    insertHolding: async (h) => { const x = { ...h, id: nextId++ }; holdings.push(x); return x },
    insertTx: async (hid, t) => { const r = { ...t, id: nextId++, holding_id: hid }; rows.push(r); return r },
  }
}
/** Every figure the tab shows, keyed by ticker — ids deliberately left out. */
function totals(db) {
  const per = Object.fromEntries(db.holdingsList.map(h => {
    const s = replay(db.rows.filter(r => r.holding_id === h.id))
    const pick = ['shares', 'totalCost', 'basis', 'schwabBasis', 'cashInvested', 'dividends', 'ccNet', 'realized', 'fees', 'taxWithheld', 'roc']
    return [h.ticker, { ...Object.fromEntries(pick.map(k => [k, s[k]])), openCalls: s.openCalls.length, lots: s.lots.length,
      flags: [h.pays_dividend, h.drip, h.current_price] }]
  }))
  return { per, cash: cashTotals(db.rows), rows: db.rows.length, hashes: db.rows.filter(r => r.import_hash).length }
}
async function roundTrip(db, label) {
  const before = totals(db)
  const json = JSON.stringify(buildBackup(db.holdingsList, db.rows))   // what the download holds
  await db.wipe()
  check(`${label}: wiped`, [db.holdingsList.length, db.rows.length], [0, 0])
  const r = await restoreBackup(JSON.parse(json), db)
  check(`${label}: restored counts`, [r.holdings, r.transactions], [Object.keys(before.per).length, before.rows])
  check(`${label}: every total identical after restore`, totals(db), before)
  return json
}

// ─────────────────────────────────────────────────────────────────────────────
const fixture = fs.existsSync('test-fixtures') && fs.readdirSync('test-fixtures').find(f => /^Dragon_Portfolio_.*Transactions.*\.csv$/i.test(f))
if (fixture) {
  console.log('\nRound trip — the real Schwab import')
  const db = memoryDb()
  await runImport(planImport(parseSchwab(fs.readFileSync(`test-fixtures/${fixture}`, 'utf8'))), db)
  const json = await roundTrip(db, 'real file')
  check('cash rows survive with no holding', db.rows.filter(r => r.type.startsWith('CASH')).every(r => r.holding_id === null), true)
  check('import hashes survive, so a re-import still adds 0', (await runImport(planImport(parseSchwab(fs.readFileSync(`test-fixtures/${fixture}`, 'utf8'))), db)).added.length, 0)
  check('CSV has a row per holding and transaction', backupToCsv(JSON.parse(json)).split('\r\n').length, 1 + 8 + 32)
} else {
  console.log('\nRound trip — real file SKIPPED (no transactions export in test-fixtures/)')
}

console.log('\nRound trip — calls, rolls, called away, reclass (ref_ids remapped)')
{
  const db = memoryDb()
  const h = await db.createHolding({ ticker: 'ABC', pays_dividend: true, current_price: 23 })
  const add = (t) => db.insert(h, { fees: 0, ...t }, null)
  await add({ type: 'BUY', date: '2026-01-02', shares: 250, price: 20, amount: 5000, fees: 1 })
  const o = await add({ type: 'CC_OPEN', date: '2026-01-05', strike: 22, expiry: '2026-02-20', contracts: 2, premium: 1, amount: 200, fees: 1.32 })
  const r = await add({ type: 'CC_ROLL', date: '2026-02-19', ref_id: o.id, strike: 23, expiry: '2026-03-20', contracts: 2, premium: 0.2, amount: 40, fees: 2.64 })
  const d = await add({ type: 'DIVIDEND', date: '2026-03-01', amount: 8.5, tax_withheld: 1.5 })
  await add({ type: 'SELL', date: '2026-03-20', ref_id: r.id, shares: 200, price: 23, amount: 4600, fees: 0.05 })
  await add({ type: 'RECLASS', date: '2027-02-01', ref_id: d.id, amount: 2 })
  await db.insert(null, { type: 'CASH_IN', date: '2026-01-01', amount: 5000 }, 'h1')
  await roundTrip(db, 'synthetic')
  const [, o2, r2, d2, s2, rc2] = db.rows
  check('roll still points at its open', r2.ref_id, o2.id)
  check('called-away sell still points at the roll', s2.ref_id, r2.id)
  check('reclass still points at its dividend', rc2.ref_id, d2.id)
  check('ids are new (restored, not copied)', o2.id !== o.id, true)
}

console.log('\nRestore safety')
{
  const db = memoryDb()
  const h = await db.createHolding({ ticker: 'X', pays_dividend: true })
  await db.insert(h, { type: 'BUY', date: '2026-01-01', shares: 1, price: 10, amount: 10, fees: 0 }, null)
  const backup = buildBackup(db.holdingsList, db.rows)
  await rejects('refuses a non-empty ledger without a wipe', restoreBackup(backup, db), /isn’t empty/)
  check('…and changed nothing', db.rows.length, 1)
  const r = await restoreBackup(backup, db, { wipe: true })
  check('with wipe confirmed: replaced, not added to', [r.transactions, db.rows.length], [1, 1])
  await rejects('refuses a file that isn’t a backup', restoreBackup({ foo: 1 }, memoryDb()), /Not a Dragon backup/)
  await rejects('refuses a dangling ref_id', restoreBackup({ ...backup, transactions: [{ ...backup.transactions[0], ref_id: 999 }] }, memoryDb()), /isn't earlier in the backup/)
  await rejects('refuses a ledger that no longer replays', restoreBackup({ ...backup, transactions: [
    ...backup.transactions, { ...backup.transactions[0], id: 999, type: 'SELL', shares: 5 }] }, memoryDb()), /only 1 held/)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
