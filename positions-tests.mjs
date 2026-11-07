/**
 * Schwab Positions CSV → Reconcile tests. No database.
 *
 *   node positions-tests.mjs
 *
 * The real-file section needs BOTH Sam's transactions export and his positions
 * export in test-fixtures/ (gitignored) and is skipped, loudly, without them.
 */
import fs from 'node:fs'
import { parsePositions, matchPositions } from './server/lib/schwabPositions.js'
import { parseSchwab, planImport, runImport } from './server/lib/schwabImport.js'
import { replay, reconcileMatch } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

console.log('\nParsing a Schwab positions export')
const SAMPLE = `"Positions for account Individual ...212 as of 07:43 PM ET, 2026/11/06","","",""
"","","",""
"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Security Type"
"TLTW","ISHARES 20+ YEAR TREASURY BOND BUYWRITE","3.7004","$21.05","$77.89","$76.24","ETFs & Closed End Funds"
"ORC","ORCHID IS CAP INC","14.2562","$5.10","$72.71","$75.56","Equity"
"PSLV","SPROTT PHYSICAL SILVER","3.8982","N/A","--","--","ETFs & Closed End Funds"
"SWVXX","SCHWAB VALUE ADVANTAGE MONEY INV","10","$1.00","$10.00","$10.00","Money Market Fund"
"Cash & Cash Investments","--","--","--","$12.34","--","Cash and Money Market"
"Account Total","--","--","--","$1,234.56","$1,111.00","--"
`
const pos = parsePositions(SAMPLE)
check('header found under the title lines; cash, money market and total rows skipped', pos.map(p => p.symbol), ['TLTW', 'ORC', 'PSLV'])
check('$ stripped', pos[0], { symbol: 'TLTW', shares: 3.7004, costBasis: 76.24 })
check('"--" and "N/A" → no value, not 0', pos[2].costBasis, null)
check('"Quantity" header spelt plainly also works', parsePositions('Symbol,Quantity,Cost Basis\nX,"1,200",$1.00\n'), [{ symbol: 'X', shares: 1200, costBasis: 1 }])
let threw = false
try { parsePositions('a,b\n1,2\n') } catch { threw = true }
check('a file with no positions header is refused', threw, true)

console.log('\nMatching against the ledger')
const m = matchPositions(pos, [{ ticker: 'TLTW', shares: 3.7004 }, { ticker: 'ORC', shares: 14.2562 }, { ticker: 'CVX', shares: 0.3476 }, { ticker: 'OLD', shares: 0 }])
check('found by ticker', Object.keys(m.found), ['TLTW', 'ORC'])
check('symbol in the file but not the ledger', m.notInLedger, ['PSLV'])
check('ledger holding missing from the file (fully sold ones ignored)', m.missingFromFile, ['CVX'])
check('match within tolerance', reconcileMatch(3.70045, 3.7004, 76.235, 76.24), true)
check('basis off by 2c → no match', reconcileMatch(3.7004, 3.7004, 76.22, 76.24), false)
check('shares off by 0.0002 → no match', reconcileMatch(3.7006, 3.7004, 76.24, 76.24), false)

// ─────────────────────────────────────────────────────────────────────────────
const dir = 'test-fixtures'
const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
const txFile = files.find(f => /^Dragon_Portfolio_.*Transactions.*\.csv$/i.test(f))
const posFile = files.find(f => /positions/i.test(f) && f.endsWith('.csv'))
if (!txFile || !posFile) {
  console.log(`\nReal positions file — SKIPPED (needs a *Positions*.csv${txFile ? '' : ' and the transactions export'} in test-fixtures/)`)
} else {
  console.log(`\nReal positions file (${posFile}) against the imported ledger`)
  let id = 1
  const holdings = new Map(), rows = []
  await runImport(planImport(parseSchwab(fs.readFileSync(`${dir}/${txFile}`, 'utf8'))), {
    hashes: async () => new Set(), holdings: async () => new Map(holdings),
    createHolding: async (h) => { const x = { id: id++, ...h }; holdings.set(h.ticker, x); return x },
    setPaysDividend: async (h) => h, ledger: async (h) => rows.filter(r => r.holding_id === h.id),
    insert: async (h, tx, hash) => { const r = { ...tx, id: id++, holding_id: h?.id ?? null, import_hash: hash }; rows.push(r); return r },
  })
  const ledger = [...holdings.values()].map(h => ({ ticker: h.ticker, state: replay(rows.filter(r => r.holding_id === h.id)) }))
  const mp = matchPositions(parsePositions(fs.readFileSync(`${dir}/${posFile}`, 'utf8')), ledger.map(l => ({ ticker: l.ticker, shares: l.state.shares })))
  check('every ledger holding is in the file', mp.missingFromFile, [])
  check('no unknown symbols in the file', mp.notInLedger, [])
  for (const l of ledger) {
    const f = mp.found[l.ticker]
    check(`${l.ticker} ✅ (ledger ${l.state.shares} / $${l.state.schwabBasis.toFixed(2)} vs Schwab ${f?.shares} / $${f?.costBasis})`,
      !!f && reconcileMatch(l.state.shares, f.shares, l.state.schwabBasis, f.costBasis), true)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
