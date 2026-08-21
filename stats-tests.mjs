/**
 * Trade-stats regression tests — no database.
 *
 * These exist because the app once reported two different win rates for the
 * same 80 trades: 67.6% on the Dashboard, 57.5% in the Playbook. Nothing was
 * broken in an obvious way; the two pages simply spelled "loss" differently,
 * one as `pnl < 0` and the other as `pnl <= 0`, and twelve scratched MNQ trades
 * fell down the gap. The second half of this file is the guard that matters:
 * it fails if any route starts classifying trades inline again instead of
 * importing the shared definition.
 *
 * Run with: npm run test:stats
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BOOKED, RESULT, IS_WIN, IS_LOSS, IS_BREAKEVEN, IS_LEG, COUNTS_AS_TRADE,
  COUNT_WINS, COUNT_LOSSES, COUNT_BREAKEVENS, GROSS_PROFIT, GROSS_LOSS, PROFIT_FACTOR,
  winRate, profitFactor, expectancy, resultOf, isWin, isLoss, isBreakeven, isDecided,
  activeCycleCount, wheelStrategySelected,
} from './server/lib/tradeStats.js'

const HERE = dirname(fileURLToPath(import.meta.url))
let passed = 0, failed = 0
const group = (n) => console.log('\n' + n)
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log('  ok   ' + label) }
  else { failed++; console.log('  FAIL ' + label + (detail ? '\n         ' + detail : '')) }
}
const eq = (label, actual, want) =>
  ok(label, Object.is(actual, want) || (typeof actual === 'number' && Math.abs(actual - want) < 1e-9),
     `expected ${want}, got ${actual}`)

// ── The three verdicts ──────────────────────────────────────────────────────
group('a scratch is a breakeven, not a loss')
eq('a flat trade is not a loss',      isLoss({ pnl: 0, fees: 0 }), false)
eq('a flat trade is not a win',       isWin({ pnl: 0, fees: 0 }),  false)
eq('a flat trade is a breakeven',     isBreakeven({ pnl: 0, fees: 0 }), true)
eq('a real loser is a loss',          isLoss({ pnl: -50, fees: 0 }), true)
eq('a real winner is a win',          isWin({ pnl: 50, fees: 0 }),  true)

group('the verdict is taken before commissions')
eq('a winning read eaten by fees still reads as a win', isWin({ pnl: -1, fees: 4 }), true)
eq('...and is not counted as a loss',                   isLoss({ pnl: -1, fees: 4 }), false)
eq('fees that exactly eat the gain leave a breakeven',  isBreakeven({ pnl: -4, fees: 4 }), true)
eq('result adds fees back',                             resultOf({ pnl: -1, fees: 4 }), 3)
eq('a missing fee column means zero, not NaN',          resultOf({ pnl: 7 }), 7)

group('an unbooked row has no verdict at all')
eq('a NULL-P&L wheel leg is undecided', isDecided({ pnl: null, fees: 0.5 }), false)
eq('...and is not a win',               isWin({ pnl: null, fees: 0.5 }), false)
eq('...and is not a loss',              isLoss({ pnl: null, fees: 0.5 }), false)
eq('...and is not a breakeven',         isBreakeven({ pnl: null }), false)

// ── Rates ───────────────────────────────────────────────────────────────────
group('win rate counts decisive trades only')
eq('46W / 22L / 12BE is 67.65%, not 57.5%', Number(winRate(46, 22).toFixed(2)), 67.65)
eq('scratches never enter the denominator', winRate(1, 1), 50)
eq('no trades is zero, not NaN',            winRate(0, 0), 0)
eq('an unbeaten run is 100%',               winRate(5, 0), 100)

group('profit factor')
eq('2:1 gross',                    profitFactor(200, 100), 2)
eq('nothing lost is not a ratio',  profitFactor(200, 0), null)
eq('nothing at all is not a ratio',profitFactor(0, 0), null)

group('expectancy follows the same win rate')
eq('67.65% x 100 win, 32.35% x -100 loss', Number(expectancy(67.65, 100, -100).toFixed(2)), 35.30)
eq('a coin flip with equal sizes is flat', expectancy(50, 100, -100), 0)

// ── SQL fragments ───────────────────────────────────────────────────────────
group('SQL fragments say what they mean')
ok('IS_LOSS is a strict inequality',   /<\s*0/.test(IS_LOSS()) && !/<=/.test(IS_LOSS()), IS_LOSS())
ok('IS_WIN is a strict inequality',    />\s*0/.test(IS_WIN())  && !/>=/.test(IS_WIN()),  IS_WIN())
ok('IS_BREAKEVEN tests equality',      /=\s*0/.test(IS_BREAKEVEN()), IS_BREAKEVEN())
ok('RESULT adds fees back',            /pnl \+ COALESCE\(fees,0\)/.test(RESULT()), RESULT())
ok('BOOKED drops closed rows with no P&L', /status = 'closed' AND .*pnl IS NULL/.test(BOOKED()), BOOKED())
ok('GROSS_LOSS sums net P&L, not the result basis', /SUM\(CASE WHEN .* THEN pnl END\)/.test(GROSS_LOSS()), GROSS_LOSS())
ok('PROFIT_FACTOR guards divide-by-zero', /NULLIF/.test(PROFIT_FACTOR()), PROFIT_FACTOR())

// ── The counting unit ───────────────────────────────────────────────────────
group('a wheel run is one trade, however many legs it took')
ok('a leg is identified by leg_status',        /leg_status IS NOT NULL/.test(IS_LEG()), IS_LEG())
ok('COUNTS_AS_TRADE excludes legs',            /NOT .*leg_status IS NOT NULL/.test(COUNTS_AS_TRADE()), COUNTS_AS_TRADE())
ok('COUNTS_AS_TRADE still excludes unbooked rows', /pnl IS NULL/.test(COUNTS_AS_TRADE()), COUNTS_AS_TRADE())
ok('COUNTS_AS_TRADE is stricter than BOOKED',
   COUNTS_AS_TRADE().includes(BOOKED()) && COUNTS_AS_TRADE().length > BOOKED().length,
   'it must only ever remove rows BOOKED would have kept, never add any')

// A fake pool: records the SQL it is asked to run and reports one row back.
const fakePool = (n = 7) => {
  const seen = []
  return { seen, query: async (sql, params) => (seen.push({ sql, params }), { rows: [{ n, id: 42 }] }) }
}

group('open wheel runs are counted from cycles, not from rows')
{
  const p = fakePool(4)
  const got = await activeCycleCount(p, { userId: 'u' })
  eq('returns the cycle count', got, 4)
  ok('reads wheel_cycles, not trades', /FROM wheel_cycles/.test(p.seen[0].sql), p.seen[0].sql)
  ok('counts only active cycles',      /status = 'active'/.test(p.seen[0].sql), p.seen[0].sql)
  ok('always scopes to the user',      /user_id = \$1/.test(p.seen[0].sql), p.seen[0].sql)
  ok('does not look at open legs',     !/leg_status/.test(p.seen[0].sql), p.seen[0].sql)
}
{
  // The FIG case: a run holding assigned shares with no option written against
  // it has no open row in `trades`, and must still count as one open trade.
  const p = fakePool(1)
  eq('a run on bare shares still counts', await activeCycleCount(p, { userId: 'u' }), 1)
}
{
  const p = fakePool(4)
  await activeCycleCount(p, { userId: 'u', from: '2026-08-01', to: '2026-08-31', accountId: 3 })
  ok('windows on opened_at — a run is a trade from the day it started',
     /opened_at >= \$/.test(p.seen[0].sql) && /opened_at <= \$/.test(p.seen[0].sql), p.seen[0].sql)
  ok('honours the account filter', /account_id = \$/.test(p.seen[0].sql), p.seen[0].sql)
}
{
  const p = fakePool(4)
  eq('a strategy filter excluding Wheel Play counts no runs',
     await activeCycleCount(p, { userId: 'u', strategyOk: false }), 0)
  eq('...and issues no query at all', p.seen.length, 0)
}

group('does a strategy selection include the wheel?')
eq('no filter means everything',  await wheelStrategySelected(fakePool(), 'u', undefined), true)
eq('an empty filter means everything', await wheelStrategySelected(fakePool(), 'u', ''), true)
eq('a selection of only "unassigned" excludes it', await wheelStrategySelected(fakePool(), 'u', 'null'), false)
eq('a selection containing the wheel id includes it', await wheelStrategySelected(fakePool(), 'u', '42,7'), true)
eq('a selection without the wheel id excludes it',    await wheelStrategySelected(fakePool(), 'u', '7,9'), false)

group('fragments carry the table alias through')
for (const [name, f] of Object.entries({ BOOKED, RESULT, IS_WIN, IS_LOSS, IS_BREAKEVEN, IS_LEG, COUNTS_AS_TRADE,
                                         COUNT_WINS, COUNT_LOSSES, COUNT_BREAKEVENS,
                                         GROSS_PROFIT, GROSS_LOSS, PROFIT_FACTOR })) {
  const withAlias = f('t.')
  ok(`${name}('t.') prefixes every column`,
     !/(^|[^.\w])(pnl|fees|status)\b/.test(withAlias.replace(/t\.(pnl|fees|status)/g, 'X')),
     withAlias)
}

// ── The guard ───────────────────────────────────────────────────────────────
group('no route classifies wins and losses on its own')
const ROUTES = join(HERE, 'server', 'routes')
// `pnl <= 0` and `pnl > 0` as a verdict are the two spellings that drifted.
// Anything wanting a win/loss split imports it from server/lib/tradeStats.js.
const BANNED = [
  [/\bpnl\s*<=\s*0/,               'classifies a scratch as a loss (`pnl <= 0`)'],
  [/COUNT\(CASE WHEN\s*\(?\s*(t\.)?pnl\s*[<>]/, 'counts wins/losses inline instead of COUNT_WINS/COUNT_LOSSES'],
  [/NOT \((t\.)?status = 'closed' AND/, 'redefines BOOKED instead of importing it'],
]
for (const file of readdirSync(ROUTES).filter(f => f.endsWith('.js'))) {
  const src = readFileSync(join(ROUTES, file), 'utf8')
  for (const [re, why] of BANNED) {
    const hit = src.split('\n').findIndex(l => re.test(l) && !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    ok(`${file} — ${why}`, hit === -1, hit === -1 ? '' : `${file}:${hit + 1}  ${src.split('\n')[hit].trim()}`)
  }
}

console.log('\n' + '─'.repeat(60))
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
