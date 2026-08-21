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

/**
 * A wheel contract, as opposed to a trade.
 *
 * Sam's rule: *"if it's a separate ticker it's an individual play; multiple legs
 * within the same ticker, it's the same trade."* That is exactly what
 * `wheel_cycles` is keyed on, so the CYCLE is the trade and a leg is never one —
 * not the put, not the nine rolls after it, not the covered calls written
 * against the shares. Every real leg carries `leg_status`; the one summary row a
 * closed cycle books does not, which is what tells them apart.
 */
export const IS_LEG = (p = '') => `${p}leg_status IS NOT NULL`

/**
 * Rows that are a trade in their own right — the predicate for COUNTING.
 *
 * `BOOKED` alone is not enough here. It drops closed legs (they carry no P&L)
 * but keeps OPEN ones, so a live wheel run counted once per open contract while
 * a run holding assigned shares between covered calls counted zero — it has no
 * open row at all. Neither matches the rule. Legs are excluded outright, and the
 * open runs are added back from `wheel_cycles` by `activeCycleCount()`.
 */
export const COUNTS_AS_TRADE = (p = '') => `(${BOOKED(p)} AND NOT ${IS_LEG(p)})`

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

/**
 * How many wheel runs are open — one per active cycle, whatever it is doing.
 *
 * This is the other half of `COUNTS_AS_TRADE`. A cycle is open whether it is
 * sitting on a live put, mid-roll, or holding assigned shares with nothing
 * written against them; that last state has no open row in `trades`, which is
 * why counting rows misses it. FIG was in exactly that state when this was
 * written, and the dashboard reported three open trades where there were four.
 *
 * Dated by `opened_at`: an open run is a trade from the day it started. When it
 * goes flat it stops being counted here and its summary row — dated `closed_at`
 * — starts being counted instead, so it is never both at once.
 *
 * `strategyOk` lets a caller filtering by strategy say whether Wheel Play is in
 * the selection; when it is not, no cycle counts.
 */
export async function activeCycleCount(pool, { userId, from, to, accountId, strategyOk = true } = {}) {
  if (!strategyOk) return 0
  const params = [userId]
  const parts  = [`user_id = $1`, `status = 'active'`]
  if (accountId) { parts.push(`account_id = $${params.push(accountId)}`) }
  if (from)      { parts.push(`opened_at >= $${params.push(from)}`) }
  if (to)        { parts.push(`opened_at <= $${params.push(to)}`) }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM wheel_cycles WHERE ${parts.join(' AND ')}`, params
  )
  return rows[0].n
}

/**
 * The id of the "Wheel Play" playbook strategy, or null if the user has none.
 * Resolve-only — creating it is `wheelStrategyId()` in routes/wheel.js, which is
 * the write path. Reading must never conjure a strategy row as a side effect.
 */
export async function wheelStrategyId(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM strategies WHERE user_id = $1 AND lower(name) = 'wheel play' LIMIT 1`,
    [userId]
  )
  return rows[0]?.id ?? null
}

/**
 * Would a `strategy_ids` selection show wheel runs? An absent or empty filter
 * means "everything", so it would. Used to decide whether open runs belong in a
 * filtered count — the cycles themselves carry no `strategy_id`, only their legs
 * and summary rows do.
 */
export async function wheelStrategySelected(pool, userId, strategy_ids) {
  if (strategy_ids === undefined || strategy_ids === '') return true
  const ids = String(strategy_ids).split(',').filter(Boolean)
    .filter(t => t !== 'null').map(Number).filter(Number.isFinite)
  if (!ids.length) return false
  const id = await wheelStrategyId(pool, userId)
  return id != null && ids.includes(id)
}

/** Expected value per trade, on the same decisive-trade win rate. */
export function expectancy(winRatePct, avgWin, avgLoss) {
  const wr = (Number(winRatePct) || 0) / 100
  return wr * (Number(avgWin) || 0) + (1 - wr) * (Number(avgLoss) || 0)
}
