/**
 * AUD conversion tests — RBA parsing, rate lookup, report lines. No network.
 *
 *   node fx-tests.mjs
 */
import { parseRbaF11, rateFor, toAud, taxLines } from './server/lib/fx.js'

let passed = 0, failed = 0
function check(name, actual, expected, eps = 0.00005) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < eps : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}

// Same layout as the real F11.1 file (title block, Series ID row, DD-Mon-YYYY rows).
const RBA = `﻿F11.1  EXCHANGE RATES
Title,Trade-weighted Index May 1970 = 100,A$1=USD
Units,Index,USD
Series ID,FXRTWI,FXRUSD
02-Jul-2026,60.1,0.6500
03-Jul-2026,60.2,0.6600
06-Jul-2026,60.3,0.6400
`
console.log('\nParsing the RBA file')
const rates = parseRbaF11(RBA).map(r => ({ ...r, source: 'rba' }))
check('finds the USD column by series id, not position', rates.map(r => [r.date, r.aud_usd]), [['2026-07-02', 0.65], ['2026-07-03', 0.66], ['2026-07-06', 0.64]])

console.log('\nConversion maths')
check('AUD = USD ÷ (A$1 = USD)', toAud(65, 0.65), 100)
check('$0.93 at 0.6600 → A$1.4091', toAud(0.93, 0.66), 1.409090909)

console.log('\nRate lookup')
check('business day uses its own rate', rateFor('2026-07-03', rates), { date: '2026-07-03', aud_usd: 0.66, source: 'rba', fallback: false })
check('Saturday falls back to Friday', rateFor('2026-07-04', rates), { date: '2026-07-03', aud_usd: 0.66, source: 'rba', fallback: true })
check('Sunday falls back to Friday', rateFor('2026-07-05', rates)?.date, '2026-07-03')
check('before any rate → missing', rateFor('2026-07-01', rates), null)
check('after the last RBA day → missing, not stale', rateFor('2026-07-07', rates), null)
check('a gap longer than a week → missing', rateFor('2026-07-20', [...rates, { date: '2026-07-21', aud_usd: 0.7, source: 'rba' }]), null)
const withManual = [...rates, { date: '2026-07-07', aud_usd: 0.6450, source: 'manual' }]
check('manual rate fills a missing day', rateFor('2026-07-07', withManual), { date: '2026-07-07', aud_usd: 0.645, source: 'manual', fallback: false })
check('manual rate wins over RBA on the same day', rateFor('2026-07-06', [...rates, { date: '2026-07-06', aud_usd: 0.6, source: 'manual' }]).source, 'manual')

console.log('\nReport lines')
const holdings = [{
  ticker: 'TLTW',
  events: [
    { date: '2026-06-30', dividend: 1, tax: 0, cc: 0, realized: 0, fees: 0, roc: 0 },                 // FY2025-26 — excluded
    { date: '2026-07-04', dividend: 0.79, tax: 0.14, cc: 0, realized: 0, fees: 0, roc: 0 },          // Saturday
    { date: '2026-07-06', dividend: 0, tax: 0, cc: 50, realized: 0, fees: 0.66, roc: 0 },
    { date: '2026-07-07', dividend: 0, tax: 0, cc: 0, realized: 10, fees: 0, roc: 0 },               // no rate yet
  ],
}]
const rep = taxLines(holdings, 2027, rates)
check('one line per non-zero amount, FY only', rep.lines.map(l => `${l.date} ${l.type}`), [
  '2026-07-04 Net dividend', '2026-07-04 US tax withheld', '2026-07-06 Net CC premium', '2026-07-06 Fees', '2026-07-07 Realised P/L'])
check('weekend line uses Friday’s rate', [rep.lines[0].rate, rep.lines[0].rateDate], [0.66, '2026-07-03'])
check('line AUD', rep.lines[0].aud, 0.79 / 0.66)
check('missing-rate line flagged, no AUD invented', [rep.lines[4].missing, rep.lines[4].aud], [true, null])
check('missing dates listed for manual entry', rep.missing, ['2026-07-07'])
check('USD totals', [rep.totals.usd.dividend, rep.totals.usd.tax, rep.totals.usd.grossDividends, rep.totals.usd.cc, rep.totals.usd.fees], [0.79, 0.14, 0.93, 50, 0.66])
check('AUD gross dividends = (0.79 + 0.14) ÷ 0.66', rep.totals.aud.grossDividends, 0.93 / 0.66)
check('AUD CC premium at 0.64', rep.totals.aud.cc, 50 / 0.64)
const fixed = taxLines(holdings, 2027, withManual)
check('after a manual rate: no missing, line marked manual', [fixed.missing, fixed.lines[4].manual, fixed.lines[4].aud], [[], true, 10 / 0.645])

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
