/**
 * The one definition of what counts as a trade, and what counts as a win.
 *
 * These fragments existed five times over, spelled slightly differently each
 * time, and the pages disagreed with each other as a result: the Dashboard put
 * a scratched trade in its own bucket while the Playbook, the Goals tracker,
 * the weekly review and the Gate all called it a loss. On real data that was a
 * ten-point spread in win rate — 67.6% against 57.5% — over the same 80 trades.
 * A journal whose two pages report different win rates is not trusted, and
 * should not be.
 *
 * Everything that splits trades into wins and losses imports from here. If a
 * definition needs to change, it changes once.
 *
 * `p` is the column prefix for queries that alias the table (`'t.'`), or '' when
 * they do not.
 */

/**
 * A closed row carrying no P&L is a stage of something, not a result: a wheel
 * leg inside a run that is still going, or one whose run books its P&L on the
 * cycle's own summary row (see cycleJournalPnl in server/lib/wheelEngine.js).
 *
 * Sums and win/loss splits skip NULL on their own; trade COUNTS do not, and
 * without this the Playbook reports 72 "Wheel Play" trades for 29 completed
 * runs and the weekly review reports 126 trades where 83 were booked.
 */
export const BOOKED = (p = '') => `NOT (${p}status = 'closed' AND ${p}pnl IS NULL)`

/**
 * The figure a win/loss split is taken on: P&L before commissions.
 *
 * `pnl` is stored net of fees, so adding them back gives what the position
 * itself did. A trade that made $3 on the move and paid $4 to do it was a
 * winning read and a losing trade; the equity curve is what should carry that
 * verdict, not the win rate. Wheel summary rows are already net of every
 * commission and carry `fees = 0` on purpose, so this leaves them untouched.
 */
export const RESULT = (p = '') => `(${p}pnl + COALESCE(${p}fees,0))`

export const IS_WIN       = (p = '') => `${RESULT(p)} > 0`
export const IS_LOSS      = (p = '') => `${RESULT(p)} < 0`
export const IS_BREAKEVEN = (p = '') => `${RESULT(p)} = 0`

/**
 * A scratch is not a loss. `pnl <= 0` is the tempting shorthand and it is wrong:
 * it buries breakevens in the loss column, which drags the win rate down and
 * tells you that you lost on days you did not.
 */
export const COUNT_WINS       = (p = '') => `COUNT(CASE WHEN ${IS_WIN(p)}       THEN 1 END)`
export const COUNT_LOSSES     = (p = '') => `COUNT(CASE WHEN ${IS_LOSS(p)}      THEN 1 END)`
export const COUNT_BREAKEVENS = (p = '') => `COUNT(CASE WHEN ${IS_BREAKEVEN(p)} THEN 1 END)`

/** Gross profit and gross loss sum NET P&L over rows classified on RESULT. */
export const GROSS_PROFIT = (p = '') => `COALESCE(SUM(CASE WHEN ${IS_WIN(p)}  THEN ${p}pnl END), 0)`
export const GROSS_LOSS   = (p = '') => `ABS(COALESCE(SUM(CASE WHEN ${IS_LOSS(p)} THEN ${p}pnl END), 0))`

/** Profit factor as a single SQL expression, for GROUP BY queries. */
export const PROFIT_FACTOR = (p = '') =>
  `1.0 * ${GROSS_PROFIT(p)} / NULLIF(${GROSS_LOSS(p)}, 0)`

/**
 * The same three verdicts, in JavaScript, for the handful of places that pull
 * rows out and classify them in a loop rather than in SQL. A row needs `pnl`
 * and, to be judged on the same basis as everywhere else, `fees`.
 */
export const resultOf   = (t) => Number(t?.pnl ?? 0) + Number(t?.fees ?? 0)
export const isDecided  = (t) => t?.pnl != null
export const isWin      = (t) => isDecided(t) && resultOf(t) > 0
export const isLoss     = (t) => isDecided(t) && resultOf(t) < 0
export const isBreakeven = (t) => isDecided(t) && resultOf(t) === 0

/**
 * Win rate over DECISIVE trades only. Breakevens are excluded from both sides
 * rather than counted as losses — dividing by COUNT(*) instead is the other way
 * this used to go wrong, and it understates the win rate by exactly the scratch
 * rate.
 */
export function winRate(wins, losses) {
  const w = Number(wins) || 0
  const l = Number(losses) || 0
  return w + l > 0 ? (w / (w + l)) * 100 : 0
}

/** Null rather than Infinity when nothing was lost — "no losses yet" is not a ratio. */
export function profitFactor(grossProfit, grossLoss) {
  const gl = Number(grossLoss) || 0
  return gl > 0 ? Number(grossProfit) / gl : null
}

/** Expected value per trade, on the same decisive-trade win rate. */
export function expectancy(winRatePct, avgWin, avgLoss) {
  const wr = (Number(winRatePct) || 0) / 100
  return wr * (Number(avgWin) || 0) + (1 - wr) * (Number(avgLoss) || 0)
}
