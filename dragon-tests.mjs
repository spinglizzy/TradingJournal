/**
 * Dragon cost-basis engine tests — pure math, no database.
 *
 *   node dragon-tests.mjs
 */
import { replay, incomeByMonth, LedgerError } from './server/lib/dragonEngine.js'

let passed = 0, failed = 0
function check(name, actual, expected, eps = 0.005) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < eps : JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else    { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`) }
}
function throws(name, fn, re) {
  try { fn(); failed++; console.log(`  FAIL ${name} (did not throw)`) }
  catch (e) {
    const ok = e instanceof LedgerError && re.test(e.message)
    ok ? passed++ : failed++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${e.message}`}`)
  }
}

let id = 0
const tx = (type, date, f = {}) => ({ id: ++id, type, date, ...f })

console.log('\nWorked example')
const L = []
const step = (t) => { L.push(t); return replay(L) }
let s = step(tx('BUY', '2026-01-02', { shares: 10, price: 50, amount: 500 }))
check('1 shares', s.shares, 10); check('1 total', s.totalCost, 500); check('1 basis', s.basis, 50)
s = step(tx('DIVIDEND', '2026-01-15', { amount: 5 }))
check('2 total', s.totalCost, 495); check('2 basis', s.basis, 49.5)
s = step(tx('DRIP', '2026-01-15', { shares: 0.1, price: 50, amount: 5 }))
check('3 shares', s.shares, 10.1, 1e-9); check('3 total', s.totalCost, 500); check('3 basis', s.basis, 49.50495, 1e-4)
s = step(tx('BUY', '2026-02-02', { shares: 90, price: 40, amount: 3600 }))
check('4 shares', s.shares, 100.1, 1e-9); check('4 total', s.totalCost, 4100); check('4 basis', s.basis, 40.96)
const open = tx('CC_OPEN', '2026-02-05', { contracts: 1, strike: 45, expiry: '2026-03-20', premium: 1.2, amount: 120 })
s = step(open)
check('5 total', s.totalCost, 3980); check('5 basis', s.basis, 39.76); check('5 open calls', s.openCalls.length, 1)
s = step(tx('CC_CLOSE', '2026-02-20', { ref_id: open.id, premium: 0.3, amount: 30 }))
check('6 total', s.totalCost, 4010); check('6 basis', s.basis, 40.06); check('6 open calls', s.openCalls.length, 0)
s = step(tx('SELL', '2026-03-01', { shares: 10, price: 45, amount: 450 }))
check('7 realised', s.realized, 49.40); check('7 shares', s.shares, 90.1, 1e-9)
check('7 basis unchanged', s.basis, 40.06); check('7 total', s.totalCost, 4010 - 10 * (4010 / 100.1), 1e-9)
check('cash invested = buys only', s.cashInvested, 4100)
check('dividends', s.dividends, 5); check('cc net', s.ccNet, 90)
check('contracts available', s.contracts, 0); check('to next contract', s.toNextContract, 9.9, 1e-9)

console.log('\nOrdering — ledger is replayed by date, not entry order')
const shuffled = [L[6], L[3], L[0], L[5], L[2], L[4], L[1]]
check('same basis when entered out of order', replay(shuffled).basis, s.basis, 1e-12)

console.log('\nPaid-off position goes to zero / negative')
let p = replay([
  tx('BUY', '2026-01-01', { shares: 1, price: 10, amount: 10 }),
  tx('DIVIDEND', '2026-02-01', { amount: 12 }),
])
check('basis negative', p.basis, -2); check('total negative', p.totalCost, -2)
p = replay([
  tx('BUY', '2026-01-01', { shares: 2, price: 10, amount: 20 }),
  tx('DIVIDEND', '2026-02-01', { amount: 30 }),
  tx('SELL', '2026-03-01', { shares: 1, price: 10, amount: 10 }),
])
check('sell at negative basis books proceeds + cushion', p.realized, 15); check('remaining basis', p.basis, -5)

console.log('\nFull exit')
p = replay([
  tx('BUY', '2026-01-01', { shares: 3, price: 10, amount: 30 }),
  tx('SELL', '2026-02-01', { shares: 3, price: 12, amount: 36 }),
])
check('flat → zero cost', p.totalCost, 0); check('flat → basis null', p.basis, null); check('realised', p.realized, 6)

console.log('\nRoll + expire + called away')
const o2 = tx('CC_OPEN', '2026-01-02', { contracts: 2, strike: 20, expiry: '2026-01-30', amount: 100 })
const roll = tx('CC_ROLL', '2026-01-29', { ref_id: o2.id, contracts: 2, strike: 21, expiry: '2026-02-27', amount: 40 })
const base = [tx('BUY', '2026-01-01', { shares: 250, price: 18, amount: 4500 }), o2, roll]
p = replay(base)
check('roll nets both credits', p.ccNet, 140); check('one open call after roll', p.openCalls.map(c => c.id), [roll.id])
check('free contracts', p.freeContracts, 0)
p = replay([...base, tx('CC_EXPIRE', '2026-02-27', { ref_id: roll.id })])
check('expire: no cash change', p.totalCost, 4500 - 140); check('expire: call gone', p.openCalls.length, 0)
p = replay([...base, tx('SELL', '2026-02-27', { ref_id: roll.id, shares: 200, price: 21, amount: 4200 })])
check('called away closes the call', p.openCalls.length, 0); check('50 shares left', p.shares, 50)
check('called-away realised', p.realized, 4200 - 200 * (4360 / 250))
const debitRoll = { ...roll, amount: -15 }
check('debit roll raises cost', replay([base[0], o2, debitRoll]).totalCost, 4500 - 100 + 15)

console.log('\nValidation')
throws('oversell', () => replay([tx('BUY', '2026-01-01', { shares: 5, amount: 50 }), tx('SELL', '2026-01-02', { shares: 6, amount: 60 })]), /only 5 held/)
throws('sell dated before the buy', () => replay([tx('BUY', '2026-02-01', { shares: 5, amount: 50 }), tx('SELL', '2026-01-02', { shares: 1, amount: 10 })]), /only 0 held/)
throws('CC under 100 shares', () => replay([tx('BUY', '2026-01-01', { shares: 99.9, amount: 999 }), tx('CC_OPEN', '2026-01-02', { contracts: 1, expiry: '2026-02-01', amount: 10 })]), /free shares/)
throws('more contracts than shares (counting open)', () => replay([...base, tx('CC_OPEN', '2026-02-01', { contracts: 1, expiry: '2026-03-01', amount: 10 })]), /already open/)
throws('expiry not after open', () => replay([tx('BUY', '2026-01-01', { shares: 100, amount: 1 }), tx('CC_OPEN', '2026-01-02', { contracts: 1, expiry: '2026-01-02', amount: 10 })]), /expiry/)
throws('close a call that is not open', () => replay([...base, tx('CC_CLOSE', '2026-02-01', { ref_id: o2.id, amount: 5 })]), /isn't open/)
throws('sell that uncovers an open call', () => replay([...base, tx('SELL', '2026-02-01', { shares: 100, amount: 2000 })]), /uncovered/)
throws('fractional contracts', () => replay([tx('BUY', '2026-01-01', { shares: 300, amount: 1 }), tx('CC_OPEN', '2026-01-02', { contracts: 1.5, expiry: '2026-02-01', amount: 10 })]), /whole number/)

console.log('\nIncome by month')
check('dividend + net CC per month', incomeByMonth(replay(L).income), [
  { month: '2026-01', dividend: 5, cc: 0, total: 5 },
  { month: '2026-02', dividend: 0, cc: 90, total: 90 },
])

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
