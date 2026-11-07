/**
 * Schwab CSV import tests — no database. Runs the real planImport/runImport
 * against an in-memory store, then replays the result with the engine.
 *
 *   node schwab-import-tests.mjs
 *
 * The real-file section needs test-fixtures/Dragon_Portfolio_*.csv (gitignored:
 * it's personal account data) and is skipped, loudly, if it isn't there.
 */
import fs from 'node:fs'
import { parseSchwab, planImport, runImport, parseOption } from './server/lib/schwabImport.js'
import { replay, cashTotals } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
function check(name, actual, expected, eps = 0.005) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < eps : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

/** In-memory stand-in for the Postgres store the route uses. */
function memoryStore() {
  let nextId = 1
  const holdings = new Map(), rows = []
  return {
    rows, holdingsMap: holdings,
    hashes: async () => new Set(rows.map(r => r.import_hash).filter(Boolean)),
    holdings: async () => new Map(holdings),
    createHolding: async (h) => { const made = { id: nextId++, ...h }; holdings.set(h.ticker, made); return made },
    setPaysDividend: async (h) => { const u = { ...h, pays_dividend: true }; holdings.set(h.ticker, u); return u },
    ledger: async (h) => rows.filter(r => r.holding_id === h.id),
    insert: async (h, tx, hash) => { const r = { ...tx, id: nextId++, holding_id: h?.id ?? null, import_hash: hash }; rows.push(r); return r },
    adopt: async (row, merged) => { const i = rows.indexOf(row); rows[i] = { ...merged }; return rows[i] },
    /** A hand-entered row (no import_hash), as the Monthly DCA or quick-add forms write it. */
    manual: async (ticker, tx) => {
      let h = holdings.get(ticker)
      if (!h) { h = { id: nextId++, ticker, pays_dividend: true }; holdings.set(ticker, h) }
      const r = { fees: 0, tax_withheld: null, ref_id: null, ...tx, id: nextId++, holding_id: h.id, import_hash: null }; rows.push(r); return r
    },
  }
}
const importText = async (store, text, mappings) => runImport(planImport(parseSchwab(text), mappings), store)
const stateOf = (store, ticker) => replay(store.rows.filter(r => r.holding_id === store.holdingsMap.get(ticker).id))

// ─────────────────────────────────────────────────────────────────────────────
const fixture = fs.existsSync('test-fixtures') && fs.readdirSync('test-fixtures').find(f => /^Dragon_Portfolio_.*\.csv$/.test(f))
if (!fixture) {
  console.log('\nReal Schwab file — SKIPPED (put the export in test-fixtures/)')
} else {
  console.log(`\nReal Schwab file (${fixture})`)
  const text = fs.readFileSync(`test-fixtures/${fixture}`, 'utf8')
  const store = memoryStore()
  const rep = await importText(store, text)
  check('nothing sent to review', rep.review.length, 0)

  const expect = {
    CVX:  { shares: 0.3476,  schwab: 74.98, div: 0 },
    NLY:  { shares: 3.9357,  schwab: 76.16, div: 1.16 },
    ORC:  { shares: 14.2562, schwab: 75.56, div: 0.56 },
    GDXJ: { shares: 0.6722,  schwab: 74.99, div: 0 },
    JEPI: { shares: 1.3276,  schwab: 75.59, div: 0.59 },
    TLTW: { shares: 3.7004,  schwab: 76.24, div: 1.24 },
    URNM: { shares: 1.6330,  schwab: 75.00, div: 0 },
    PSLV: { shares: 3.8982,  schwab: 75.00, div: 0 },
  }
  let schwabTotal = 0, divTotal = 0, adjTotal = 0
  for (const [t, e] of Object.entries(expect)) {
    const s = stateOf(store, t)
    check(`${t} shares ${e.shares}`, s.shares, e.shares, 1e-9)
    check(`${t} Schwab basis $${e.schwab}`, s.schwabBasis, e.schwab)
    if (e.div) check(`${t} net dividends $${e.div}`, s.dividends, e.div)
    schwabTotal += s.schwabBasis; divTotal += s.dividends; adjTotal += s.totalCost
  }
  check('Schwab basis total $603.52', schwabTotal, 603.52)
  check('net dividends total $3.55', divTotal, 3.55)
  check('adjusted total cost $599.97', adjTotal, 599.97)
  check('TLTW adjusted basis ≈ $20.27', stateOf(store, 'TLTW').basis, 20.27)
  check('ORC adjusted basis ≈ $5.26', stateOf(store, 'ORC').basis, 5.26)
  check('PSLV pays_dividend = false', store.holdingsMap.get('PSLV').pays_dividend, false)
  check('TLTW pays_dividend = true', store.holdingsMap.get('TLTW').pays_dividend, true)
  check('TLTW US tax withheld $0.22 kept for reporting', stateOf(store, 'TLTW').taxWithheld, 0.22)
  check('dividend + NRA tax combined: 6 dividend rows, not 12', store.rows.filter(r => r.type === 'DIVIDEND').length, 6)
  const cash = cashTotals(store.rows)
  check('CASH_IN $1,160.00', cash.cashIn, 1160)
  check('CASH_OUT $560.00', cash.cashOut, 560)
  check('net cash contributed $600.00', cash.net, 600)
  check('cash rows have no holding', store.rows.filter(r => r.type.startsWith('CASH')).every(r => r.holding_id === null), true)
  const n = store.rows.length
  const again = await importText(store, text)
  check('second import adds 0 rows', again.added.length, 0)
  check('…and reports every row as a duplicate', again.duplicates, rep.added.length)
  check('row count unchanged', store.rows.length, n)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nParsing')
check('option symbol', parseOption('CVX 12/19/2026 230.00 C', ''), { underlying: 'CVX', expiry: '2026-12-19', strike: 230, right: 'C' })
check('option from description', parseOption('CVX', 'CALL CHEVRON CORP $230 EXP 12/19/26'), { underlying: 'CVX', expiry: '2026-12-19', strike: 230, right: 'C' })
const H = '"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n'
const sorted = parseSchwab(H + '"02/01/2026","Buy","X","X","1","$10","","-$10.00"\n"01/01/2026 as of 12/31/2025","Buy","X","X","1","$9","","-$9.00"\n"Transactions Total","","","","","","","-$19.00"\n')
// Re-specified (#12, 2026-11-07): the ledger date is the effective "as of" date; the posting date stays in the hash.
check('"as of" uses the effective date, file sorted oldest-first, footer dropped', sorted.map(l => [l.date, l.post]), [['2025-12-31', '2026-01-01'], ['2026-02-01', '2026-02-01']])
const twins = parseSchwab(H + '"01/02/2026","Buy","X","X","1","$10","","-$10.00"\n"01/02/2026","Buy","X","X","1","$10","","-$10.00"\n')
check('identical same-day rows get distinct hashes', twins[0].hash !== twins[1].hash, true)
check('"$1,234.50" parses', parseSchwab(H + '"01/02/2026","Buy","X","X","1","$1,234.50","","-$1,234.50"\n')[0].amount, -1234.5)

console.log('\nFees: Amount is net, fee stored once')
{
  const store = memoryStore()
  await importText(store, H + '"01/02/2026","Buy","ABC","ABC CORP","100","$20.00","$1.00","-$2,001.00"\n'
    + '"01/03/2026","Sell to Open","ABC 02/20/2026 22.00 C","CALL ABC CORP $22 EXP 02/20/26","1","$1.20","$0.66","$119.34"\n')
  const s = stateOf(store, 'ABC')
  const buy = store.rows.find(r => r.type === 'BUY')
  check('BUY stored gross $2,000 + fee $1', [buy.amount, buy.fees], [2000, 1])
  check('BUY cost = Schwab Amount $2,001 (not $2,002)', replay([buy]).totalCost, 2001)
  check('CC premium = Schwab Amount $119.34 (not $118.68)', s.ccNet, 119.34)
  check('total fees $1.66', s.fees, 1.66)
  check('basis = 2001 − 119.34', s.totalCost, 1881.66)
}

console.log('\nCovered calls: open → close / expire / assigned, linked by ref_id')
{
  const store = memoryStore()
  const rep = await importText(store, H
    + '"03/20/2026","Sell","ABC","ABC CORP","100","$22.00","$0.05","$2,199.95"\n'
    + '"03/20/2026","Assigned","ABC 03/20/2026 22.00 C","CALL ABC CORP $22 EXP 03/20/26","1","","",""\n'
    + '"03/02/2026","Sell to Open","ABC 03/20/2026 22.00 C","CALL ABC CORP $22 EXP 03/20/26","1","$0.50","$0.66","$49.34"\n'
    + '"02/20/2026","Expired","ABC 02/20/2026 23.00 C","CALL ABC CORP $23 EXP 02/20/26","1","","",""\n'
    + '"02/10/2026","Sell to Open","ABC 02/20/2026 23.00 C","CALL ABC CORP $23 EXP 02/20/26","1","$0.40","$0.66","$39.34"\n'
    + '"02/05/2026","Buy to Close","ABC 02/20/2026 22.00 C","CALL ABC CORP $22 EXP 02/20/26","1","$0.30","$0.66","-$30.66"\n'
    + '"01/03/2026","Sell to Open","ABC 02/20/2026 22.00 C","CALL ABC CORP $22 EXP 02/20/26","1","$1.20","$0.66","$119.34"\n'
    + '"01/02/2026","Buy","ABC","ABC CORP","200","$20.00","","-$4,000.00"\n'
    + '"01/15/2026","Buy to Close","ABC 06/19/2026 99.00 C","CALL ABC CORP $99 EXP 06/19/26","1","$0.10","","-$10.00"\n'
    + '"01/16/2026","Bank Interest","","BANK INT","","","","$0.12"\n'
    + '"01/17/2026","Sell to Open","ABC 02/20/2026 18.00 P","PUT ABC CORP $18 EXP 02/20/26","1","$0.50","","$50.00"\n')
  const types = store.rows.map(r => r.type)
  check('imported in order', types, ['BUY', 'CC_OPEN', 'CC_CLOSE', 'CC_OPEN', 'CC_EXPIRE', 'CC_OPEN', 'SELL'])
  const [, o1, c1, o2, e2, o3, sell] = store.rows
  check('close → first open', c1.ref_id, o1.id)
  check('expire → second open', e2.ref_id, o2.id)
  check('assigned share sale → called away, linked to third open', sell.ref_id, o3.id)
  const s = stateOf(store, 'ABC')
  check('no calls left open', s.openCalls.length, 0)
  check('100 shares left', s.shares, 100)
  check('net CC = 119.34 − 30.66 + 39.34 + 49.34', s.ccNet, 177.36)
  const reasons = rep.review.map(r => r.reason)
  check('unmatched close → review, not guessed', reasons.some(r => /No open 1× \$99 call/.test(r)), true)
  check('unknown action → review and mappable', rep.review.some(r => r.action === 'Bank Interest' && r.mappable), true)
  check('put → review', reasons.some(r => /Puts are not tracked/.test(r)), true)
  check('3 rows in review', rep.review.length, 3)

  const interest = rep.review.find(r => r.action === 'Bank Interest')
  const again = await importText(store, H + '"01/16/2026","Bank Interest","","BANK INT","","","","$0.12"\n', { [interest.hash]: 'CASH_IN' })
  check('mapped review row imports as the chosen type', again.added.map(a => a.type), ['CASH_IN'])
}

console.log('\nLedger replay still guards imports')
{
  const store = memoryStore()
  const rep = await importText(store, H
    + '"01/02/2026","Buy","ABC","ABC","5","$10","","-$50.00"\n'
    + '"01/03/2026","Sell","ABC","ABC","9","$10","","$90.00"\n'
    + '"01/04/2026","NRA Tax Adj","ABC","ABC","","","","-$0.10"\n')
  check('oversell → review with the engine’s reason', rep.review.some(r => /only 5 held/.test(r.reason)), true)
  check('tax line with no dividend → review', rep.review.some(r => /NRA Tax Adj with no dividend/.test(r.reason)), true)
  check('only the valid buy stored', store.rows.map(r => r.type), ['BUY'])
}

console.log('\nReturn of capital, reclassification, cash in lieu')
{
  const store = memoryStore()
  const rep = await importText(store, H
    + '"02/10/2027","Return Of Capital","ORC","ORCHID IS CAP INC","","","","$0.40"\n'
    + '"02/10/2027","Div Adjustment","ORC","ORCHID IS CAP INC","","","","-$0.40"\n'
    + '"01/20/2027","Return Of Capital","ORC","ORCHID IS CAP INC","","","","$0.25"\n'
    + '"10/29/2026","Non-Qualified Div","ORC","ORCHID IS CAP INC","","","","$0.47"\n'
    + '"10/29/2026","NRA Tax Adj","ORC","ORCHID IS CAP INC","","","","-$0.07"\n'
    + '"09/29/2026","Non-Qualified Div","ORC","ORCHID IS CAP INC","","","","$0.50"\n'
    + '"09/02/2026","Buy","ORC","ORCHID IS CAP INC","20","$5.00","","-$100.00"\n')
  check('lone Return Of Capital → ROC; adjustment + equal ROC → RECLASS', store.rows.map(r => r.type), ['BUY', 'DIVIDEND', 'DIVIDEND', 'ROC', 'RECLASS'])
  const [, d1, d2, , rc] = store.rows
  check('reclass linked to the one dividend of that size ($0.40 net, Oct)', rc.ref_id, d2.id)
  check('…and not the September one', rc.ref_id !== d1.id, true)
  const s = stateOf(store, 'ORC')
  check('ROC lowers adjusted cost; reclass moves no cash', s.totalCost, 100 - 0.5 - 0.4 - 0.25)
  check('Schwab lots: $100 − ROC $0.25 − reclass $0.40', s.schwabBasis, 99.35)
  check('dividend income $0.90 → $0.50 after the reclass', s.dividends, 0.5)
  check('ROC total $0.65', s.roc, 0.65)
  check('reclass lands in the Oct dividend’s tax year, not Feb’s', s.events.find(e => e.type === 'RECLASS').date, '2026-10-29')
  check('nothing to review', rep.review.length, 0)

  const amb = await importText(memoryStore(), H
    + '"02/10/2027","Return Of Capital","NLY","ANNALY","","","","$0.50"\n'
    + '"02/10/2027","Div Adjustment","NLY","ANNALY","","","","-$0.50"\n'
    + '"11/30/2026","Cash Dividend","NLY","ANNALY","","","","$0.50"\n'
    + '"10/30/2026","Cash Dividend","NLY","ANNALY","","","","$0.50"\n'
    + '"10/01/2026","Buy","NLY","ANNALY","5","$20","","-$100.00"\n')
  check('two dividends could match → review, not guessed', amb.review.some(r => /2 dividends of that size/.test(r.reason)), true)
  const lone = await importText(memoryStore(), H + '"02/10/2027","Div Adjustment","NLY","ANNALY","","","","-$0.30"\n')
  check('adjustment with no ROC partner → review', lone.review.some(r => /Dividend adjustment without an equal Return Of Capital/.test(r.reason)), true)

  const cil = memoryStore()
  const cr = await importText(cil, H
    + '"03/01/2027","Cash In Lieu","ABC","ABC CORP","0.25","","","$5.00"\n'
    + '"03/02/2027","Cash In Lieu","ABC","ABC CORP","","","","$1.00"\n'
    + '"01/02/2027","Buy","ABC","ABC CORP","10.25","$20","","-$205.00"\n')
  check('Cash In Lieu with a quantity → SELL of the fraction', cil.rows.map(r => [r.type, r.shares, r.amount]), [['BUY', 10.25, 205], ['SELL', 0.25, 5]])
  check('Cash In Lieu without a quantity → review', cr.review.some(r => /Cash In Lieu without a share quantity/.test(r.reason)), true)
}

console.log('\nHand-entered rows are adopted, not doubled')
{
  const store = memoryStore()
  // Monthly DCA logged by hand: $37.50 at the quoted price, shares × price = 37.488
  await store.manual('CVX', { type: 'BUY', date: '2026-10-21', shares: 0.1659, price: 225.9664, amount: 0.1659 * 225.9664 })
  const r1 = await importText(store, H + '"10/21/2026","Buy","CVX","CHEVRON CORP NEW","0.1659","$225.9664","","-$37.49"\n')
  check('0 rows added', r1.added.length, 0)
  check('1 row adopted', r1.adopted.length, 1)
  check('still one CVX buy', store.rows.filter(r => r.type === 'BUY').length, 1)
  check('it now carries Schwab’s exact $37.49', store.rows[0].amount, 37.49)
  check('…and the import hash, so the next import skips it', !!store.rows[0].import_hash, true)
  const r2 = await importText(store, H + '"10/21/2026","Buy","CVX","CHEVRON CORP NEW","0.1659","$225.9664","","-$37.49"\n')
  check('re-import: a plain duplicate now', [r2.added.length, r2.adopted.length, r2.duplicates], [0, 0, 1])
  await store.manual('CVX', { type: 'BUY', date: '2026-11-21', shares: 0.2, price: 200, amount: 40 })
  const r3 = await importText(store, H + '"11/21/2026","Buy","CVX","CHEVRON CORP NEW","0.1800","$200","","-$36.00"\n')
  check('different share count → not the same entry, both kept', [r3.added.length, r3.adopted.length], [1, 0])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
