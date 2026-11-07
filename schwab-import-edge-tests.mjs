/**
 * Schwab CSV import — adversarial edge cases. No database, no network: the real
 * planImport/runImport against an in-memory store (same pattern as
 * schwab-import-tests.mjs). All CSV rows are synthetic.
 *
 *   node schwab-import-edge-tests.mjs
 *
 * Tests named "BUG: ..." reproduce a real defect and FAIL until it is fixed.
 */
import { parseSchwab, planImport, runImport } from './server/lib/schwabImport.js'
import { replay } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
function check(name, actual, expected, eps = 0.005) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < eps : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

function memoryStore({ failOnInsert = 0 } = {}) {
  let nextId = 1, inserts = 0
  const holdings = new Map(), rows = []
  return {
    rows, holdingsMap: holdings,
    hashes: async () => new Set(rows.map(r => r.import_hash).filter(Boolean)),
    holdings: async () => new Map(holdings),
    createHolding: async (h) => { const made = { id: nextId++, ...h }; holdings.set(h.ticker, made); return made },
    setPaysDividend: async (h) => { const u = { ...h, pays_dividend: true }; holdings.set(h.ticker, u); return u },
    ledger: async (h) => rows.filter(r => r.holding_id === h.id),
    insert: async (h, tx, hash) => {
      if (failOnInsert && ++inserts === failOnInsert) throw new Error('db down')
      const r = { ...tx, id: nextId++, holding_id: h?.id ?? null, import_hash: hash }; rows.push(r); return r
    },
    adopt: async (row, merged) => { const i = rows.indexOf(row); rows[i] = { ...merged }; return rows[i] },
    manual: async (ticker, tx) => {
      let h = holdings.get(ticker)
      if (!h) { h = { id: nextId++, ticker, pays_dividend: true }; holdings.set(ticker, h) }
      const r = { fees: 0, tax_withheld: null, ref_id: null, ...tx, id: nextId++, holding_id: h.id, import_hash: null }; rows.push(r); return r
    },
  }
}
const H = '"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n'
const imp = async (store, text, maps) => runImport(planImport(parseSchwab(text), maps), store)
const stateOf = (store, t) => replay(store.rows.filter(r => r.holding_id === store.holdingsMap.get(t).id))
const buy = (d, s, q, amt) => `"${d}","Buy","${s}","${s} CO","${q}","$10.00","","${amt}"\n`

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. Hand-entered row adoption')
{
  const s = memoryStore()
  await s.manual('AAA', { type: 'BUY', date: '2026-03-02', shares: 1, price: 10, amount: 10 })
  const r = await imp(s, H + buy('03/02/2026', 'AAA', '1', '-$10.00') + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  check('1 hand row + 2 identical Schwab rows → 1 adopted, 1 added (no wrong merge)', [r.adopted.length, r.added.length], [1, 1])
  check('…2 shares held', stateOf(s, 'AAA').shares, 2)
}
{
  const s = memoryStore()
  await s.manual('AAA', { type: 'BUY', date: '2026-03-02', shares: 1, price: 10, amount: 10 })
  await s.manual('AAA', { type: 'BUY', date: '2026-03-02', shares: 2, price: 10, amount: 20 })
  const r = await imp(s, H + buy('03/02/2026', 'AAA', '2', '-$20.00') + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  check('2 hand rows + 2 Schwab rows (different sizes) → each adopts its own twin', [r.adopted.length, r.added.length, stateOf(s, 'AAA').shares], [2, 0, 3])
}
{
  const s = memoryStore()
  await s.manual('AAA', { type: 'BUY', date: '2026-03-02', shares: 0.1660, price: 225, amount: 37.35 })
  const r = await imp(s, H + '"03/02/2026","Buy","AAA","AAA CO","0.1659","$225.00","","-$37.33"\n')
  check('BUG: shares off by exactly 0.0001 (0.1660 vs 0.1659) is adopted — float makes |diff| > 1e-4', r.adopted.length, 1)
}
{
  const s = memoryStore()
  await s.manual('AAA', { type: 'DIVIDEND', date: '2026-06-30', amount: 1.25 })
  const r = await imp(s, H + '"07/01/2026 as of 06/30/2026","Qualified Dividend","AAA","AAA CO","","","","$1.25"\n')
  check('BUG: "07/01 as of 06/30" dividend adopts the one hand-entered on 06/30 (not doubled)', [r.adopted.length, r.added.length], [1, 0])
  check('BUG: …and lands in the AU tax year of its effective date (06/30 = FY2025-26)', s.rows.filter(x => x.type === 'DIVIDEND').map(x => x.date), ['2026-06-30'])
}
{
  const s = memoryStore()
  await s.manual('AAA', { type: 'BUY', date: '2026-03-02', shares: 1, price: 10, amount: 10 })
  await imp(s, H + buy('03/02/2026', 'AAA', '0.6', '-$6.00') + buy('03/02/2026', 'AAA', '0.4', '-$4.00'))
  check('BUG: one hand-entered order filled in two Schwab lots is not double-counted (or is sent to review)', stateOf(s, 'AAA').shares, 1)
}
{
  const s = memoryStore()
  await s.manual('JEPI', { type: 'BUY', date: '2026-03-02', shares: 1, price: 10, amount: 10 })
  await imp(s, H + buy('03/02/2026', 'jepi', '1', '-$10.00'))
  check('BUG: lowercase Schwab symbol "jepi" matches the JEPI holding (no second holding)', [...s.holdingsMap.keys()], ['JEPI'])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. Identical same-day rows and hash stability')
{
  const a = buy('03/02/2026', 'AAA', '1', '-$10.00')
  const s = memoryStore()
  const r1 = await imp(s, H + a + a)
  check('two identical rows → both imported', r1.added.length, 2)
  const r2 = await imp(s, H + a + a)
  check('re-import adds 0, 2 duplicates', [r2.added.length, r2.duplicates], [0, 2])
  const r3 = await imp(s, H + buy('03/05/2026', 'AAA', '3', '-$30.00') + '"03/02/2026","Sell","AAA","AAA CO","1","$11","","$11.00"\n' + a + a)
  check('newer rows added above + interleaved row → only the new 2 added', [r3.added.length, r3.duplicates], [2, 2])
  const r4 = await imp(s, H + a + '"03/02/2026","Sell","AAA","AAA CO","1","$11","","$11.00"\n' + a + buy('03/05/2026', 'AAA', '3', '-$30.00'))
  check('same rows reordered → still 0 added', r4.added.length, 0)
  const r5 = await imp(s, H + a + a + a)
  check('a third identical row in a later export → exactly 1 added', r5.added.length, 1)
}
{
  const s = memoryStore()
  await imp(s, H + '"03/02/2026","Buy","AAA","AAA CO","1","$1,234.50","","-$1,234.50"\n')
  const r = await imp(s, H + '"03/02/2026","Buy","AAA","AAA CO","1.0000","$1234.50","","-1234.50"\n')
  check('BUG: same row re-exported with different number formatting (Excel re-save) is a duplicate, not re-added', r.added.length, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // Rows imported before the v2 hash (or not yet re-hashed) carry the old raw-text hash.
  const s = memoryStore()
  const text = H + '"03/02/2026","Buy","AAA","AAA CO","1","$10.00","","-$10.00"\n'
  await imp(s, text)
  const [line] = parseSchwab(text)
  s.rows[0].import_hash = line.hashV1
  const r = await imp(s, text)
  check('a row stored under the v1 hash is still a duplicate (no re-hash needed to stay safe)', [r.added.length, r.duplicates], [0, 1])
  check('v1 hash differs from v2 (so the re-hash script has work to do)', line.hash !== line.hashV1, true)
}
console.log('\n3. Dividends, tax, DRIP')
{
  const s = memoryStore()
  await imp(s, H + '"04/01/2026","Qualified Dividend","AAA","AAA CO","","","","$2.00"\n' + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  const d = s.rows.find(r => r.type === 'DIVIDEND')
  check('dividend with no NRA tax → amount 2.00, tax null', [d.amount, d.tax_withheld], [2, null])
}
{
  const s = memoryStore()
  const r = await imp(s, H + '"04/01/2026","NRA Tax Adj","AAA","AAA CO","","","","-$0.30"\n')
  check('tax with no dividend → review, mappable, nothing stored', [r.review.length, r.review[0]?.mappable, s.rows.length], [1, true, 0])
}
{
  const s = memoryStore()
  await imp(s, H
    + '"04/01/2026","Reinvest Shares","AAA","AAA CO","0.1","$9.90","","-$0.99"\n'
    + '"04/01/2026","Reinvest Dividend","AAA","AAA CO","","","","$1.30"\n'
    + '"04/01/2026","NRA Tax Adj","AAA","AAA CO","","","","-$0.30"\n'
    + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  const st = stateOf(s, 'AAA')
  check('DRIP 0.99 vs net dividend 1.00 (cent off): both stored as given', s.rows.map(r => [r.type, r.amount]), [['BUY', 10], ['DIVIDEND', 1], ['DRIP', 0.99]])
  check('…shares 1.1, cost 10 − 1.00 + 0.99', [st.shares, +st.totalCost.toFixed(2), st.taxWithheld], [1.1, 9.99, 0.3])
}
{
  const s = memoryStore()
  await imp(s, H
    + '"04/01/2026","Qualified Dividend","AAA","AAA CO","","","","$1.00"\n'
    + '"04/01/2026","Non-Qualified Div","AAA","AAA CO","","","","$0.50"\n'
    + '"05/01/2026","Pr Yr Div Reinvest","AAA","AAA CO","","","","$0.20"\n'
    + '"05/02/2026","Cash Dividend","AAA","AAA CO","","","","$0.40"\n'
    + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  check('Qualified + Non-Qualified same day → one $1.50 dividend; Pr Yr / Cash Dividend recognised',
    s.rows.filter(r => r.type === 'DIVIDEND').map(r => r.amount), [1.5, 0.2, 0.4])
}
{
  const s = memoryStore()
  await imp(s, H + '"04/01/2026","Reinvest Dividend","AAA","AAA CO","","","","$1.00"\n' + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  const r = await imp(s, H
    + '"04/01/2026","Reinvest Dividend","AAA","AAA CO","","","","$1.00"\n'
    + '"04/01/2026","NRA Tax Adj","AAA","AAA CO","","","","-$0.30"\n'
    + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  check('BUG: NRA tax that posts in a later export is not silently swallowed as a "duplicate"',
    r.added.length + r.adopted.length + r.review.length > 0 || stateOf(s, 'AAA').dividends === 0.7, true)
}
{
  const s = memoryStore()
  const p = planImport(parseSchwab(H + '"04/01/2026","Bank Interest","","BANK INT","","","","$0.12"\n'))
  const r = await runImport(planImport(parseSchwab(H + '"04/01/2026","Bank Interest","","BANK INT","","","","$0.12"\n'), { [p.review[0].hash]: 'DIVIDEND' }), s)
  check('BUG: Bank Interest mapped to "Dividend" (a choice the modal offers) does not create a holding with an empty ticker',
    [...s.holdingsMap.keys()].includes(''), false)
  void r
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. CSV quirks')
{
  const text = '﻿' + '"Transactions for account ...","","","","","","",""\r\n' + H.replace('\n', '\r\n')
    + '"03/03/2026","Buy","AAA","AAA, THE CO ""A""","1,000","$1.00","","($1,000.00)"\r\n'
    + '"03/02/2026","Journal","","MONEY, JOURNAL","","","","$1,234.56"\r\n'
    + '"03/02/2026","Bank Interest","","BANK INT","","","","-$0.00"\r\n'
    + '"Transactions Total","","","","","","","$234.56"\r\n\r\n\r\n'
  const lines = parseSchwab(text)
  check('BOM + preamble + CRLF + footer + blank lines → 3 lines', lines.length, 3)
  const b = lines.find(l => l.action === 'Buy')
  check('quoted comma/quote in Description kept', b.description, 'AAA, THE CO "A"')
  check('"1,000" qty and "($1,000.00)" amount', [b.quantity, b.amount, b.fees], [1000, -1000, 0])
  check('"-$0.00" parses to 0', Object.is(lines.find(l => l.action === 'Bank Interest').amount + 0, 0), true)
  const s = memoryStore()
  const r = await imp(s, text)
  check('journal → CASH_IN 1234.56, $0 interest → review', [s.rows.find(x => x.type === 'CASH_IN')?.amount, r.review.length], [1234.56, 1])
}
{
  const lines = parseSchwab(H + '"3/2/2026","Buy","AAA","AAA CO","1","$10","","-$10.00"\n')
  check('BUG: M/D/YYYY date (Excel re-save) is read — or rejected loudly — never silently dropped', lines.length, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5. Re-import after deleting an imported row')
{
  // Re-specified (#17): the store remembers deleted import hashes (dragon_deleted_imports), and the
  // re-added row is marked so the preview can say "deleted before".
  const s = memoryStore()
  await imp(s, H + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  const gone = s.rows.splice(0, 1)[0]
  s.deletedHashes = async () => new Set([gone.import_hash])
  const r = await imp(s, H + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  check('deleted imported row comes back, marked previouslyDeleted for the preview', [r.added.length, r.added[0].previouslyDeleted], [1, true])
  const fresh = memoryStore()
  const r2 = await imp(fresh, H + buy('03/02/2026', 'AAA', '1', '-$10.00'))
  check('…a row never deleted carries no mark', 'previouslyDeleted' in r2.added[0], false)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6. Options')
{
  const s = memoryStore()
  const r = await imp(s, H
    + '"04/20/2026","Expired","JEPI 04/17/2026 60.00 C","CALL JPMORGAN $60 EXP 04/17/26","1","","",""\n'
    + '"04/10/2026","Buy to Close","JEPI 05/15/2026 61.00 C","CALL JPMORGAN $61 EXP 05/15/26","1","$0.10","$0.66","-$10.66"\n'
    + '"04/09/2026","Sell to Open","JEPI 04/17/2026 60.00 C","CALL JPMORGAN $60 EXP 04/17/26","2","$0.30","$1.32","$58.68"\n'
    + '"04/08/2026","Buy to Open","JEPI 06/19/2026 62.00 C","CALL JPMORGAN $62 EXP 06/19/26","1","$0.20","","-$20.00"\n'
    + '"04/07/2026","Sell to Open","JEPI 04/17/2026 60.00 C","CALL JPMORGAN $60 EXP 04/17/26","1","$0.40","$0.66","$39.34"\n'
    + '"04/06/2026","Sell to Close","JEPI 06/19/2026 62.00 C","CALL","1","$0.20","","$20.00"\n'
    + '"04/02/2026","Buy","JEPI","JPMORGAN","150","$57","","-$8,550.00"\n')
  check('stock rows never created for option symbols', [...s.holdingsMap.keys()], ['JEPI'])
  check('STO 1 → CC_OPEN on JEPI; 2nd STO 2× on 150 sh → review; expiry w/ 1 vs 2 contracts', s.rows.map(r => r.type), ['BUY', 'CC_OPEN', 'CC_EXPIRE'])
  const why = r.review.map(x => x.reason).join(' | ')
  check('uncovered STO → review', /free shares/.test(why), true)
  check('close with no open call → review', /No open 1× \$61 call/.test(why), true)
  check('Buy to Open / Sell to Close → review (unrecognised)', r.review.filter(x => /Unrecognised/.test(x.reason)).length, 2)
}
{
  const s = memoryStore()
  const r = await imp(s, H
    + '"04/17/2026","Assigned","AAA 04/17/2026 10.00 C","CALL AAA $10 EXP 04/17/26","1","","",""\n'
    + '"04/17/2026","Sell","AAA","AAA CO","50","$10","","$500.00"\n'
    + '"04/02/2026","Sell to Open","AAA 04/17/2026 10.00 C","CALL AAA $10 EXP 04/17/26","1","$0.30","","$30.00"\n'
    + buy('04/01/2026', 'AAA', '100', '-$1,000.00'))
  check('assignment with partial share sale → both in review, no SELL stored', [r.review.length, s.rows.some(x => x.type === 'SELL')], [2, false])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n7. Unknown actions, dots, cash')
{
  const s = memoryStore()
  const r = await imp(s, H
    + '"04/01/2026","ADR Mgmt Fee","AAA","AAA ADR","","","","-$0.05"\n'
    + '"04/01/2026","Stock Split","AAA","AAA","10","","",""\n'
    + '"04/01/2026","MoneyLink Transfer","","TFR","","","","-$100.00"\n'
    + buy('03/02/2026', 'BRK.B', '1', '-$400.00'))
  check('ADR fee + split → review (mappable); MoneyLink out → CASH_OUT; BRK.B kept verbatim',
    [r.review.length, r.review.every(x => x.mappable), s.rows.map(x => x.type).sort(), [...s.holdingsMap.keys()]],
    [2, true, ['BUY', 'CASH_OUT'], ['BRK.B']])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n8. Store failure mid-import')
{
  const s = memoryStore({ failOnInsert: 2 })
  let threw = false
  try { await imp(s, H + buy('03/03/2026', 'AAA', '1', '-$10.00') + buy('03/02/2026', 'AAA', '1', '-$10.00')) } catch { threw = true }
  check('store error propagates (route rolls back the whole transaction)', [threw, s.rows.length], [true, 1])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
