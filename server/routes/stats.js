import { Router } from 'express'
import pool from '../db.js'
import {
  BOOKED, COUNT_WINS, COUNT_LOSSES, COUNT_BREAKEVENS, IS_WIN, IS_LOSS, IS_BREAKEVEN,
  GROSS_PROFIT, GROSS_LOSS, winRate, profitFactor, expectancy,
} from '../lib/tradeStats.js'

const router = Router()

// Build date+account+strategy+user filter. startIdx lets you offset $N when prepending extra params.
// userId is always required for data isolation; account_id, date range and strategy_ids are optional.
// strategy_ids: comma-separated strategy ids, may include 'null' for unassigned trades;
// an empty selection (no valid tokens) matches nothing.
function dateFilter(from, to, account_id, strategy_ids, userId, col='date', startIdx=1) {
  const params = []
  const parts  = []
  let i = startIdx
  const prefix = col.includes('.') ? col.split('.')[0] + '.' : ''

  // Always filter by user
  parts.push(`${prefix}user_id = $${i++}`); params.push(userId)

  // A wheel play books ONE result, on the summary row its cycle gets when the
  // run goes flat — see syncCycleSummary in server/routes/wheel.js.
  parts.push(BOOKED(prefix))

  if (account_id) { parts.push(`${prefix}account_id = $${i++}`); params.push(account_id) }
  if (from) { parts.push(`${col} >= $${i++}`); params.push(from) }
  if (to)   { parts.push(`${col} <= $${i++}`); params.push(to)   }
  if (strategy_ids !== undefined && strategy_ids !== '') {
    const tokens      = String(strategy_ids).split(',').filter(Boolean)
    const includeNull = tokens.includes('null')
    const ids         = tokens.filter(t => t !== 'null').map(Number).filter(Number.isFinite)
    const conds = []
    if (ids.length)  { conds.push(`${prefix}strategy_id = ANY($${i++}::int[])`); params.push(ids) }
    if (includeNull) conds.push(`${prefix}strategy_id IS NULL`)
    parts.push(conds.length ? `(${conds.join(' OR ')})` : '1=0')
  }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params }
}

// ── Summary ─────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to, account_id, strategy_ids } = req.query
    const { clause, params } = dateFilter(from, to, account_id, strategy_ids, req.userId)

    const rowR = await pool.query(`
      SELECT
        COUNT(*)                                                         AS total_trades,
        COUNT(CASE WHEN status='closed' THEN 1 END)                     AS closed_trades,
        COUNT(CASE WHEN status='open'   THEN 1 END)                     AS open_trades,
        COALESCE(SUM(CASE WHEN status='closed' THEN pnl END), 0)        AS total_pnl,
        COUNT(CASE WHEN ${IS_WIN()}  AND status='closed' THEN 1 END) AS wins,
        COUNT(CASE WHEN ${IS_LOSS()} AND status='closed' THEN 1 END) AS losses,
        COUNT(CASE WHEN ${IS_BREAKEVEN()} AND status='closed' THEN 1 END) AS breakevens,
        AVG(CASE WHEN ${IS_WIN()}  AND status='closed' THEN pnl END) AS avg_win,
        AVG(CASE WHEN ${IS_LOSS()} AND status='closed' THEN pnl END) AS avg_loss,
        MAX(CASE WHEN status='closed' THEN pnl END)                     AS best_pnl,
        MIN(CASE WHEN status='closed' THEN pnl END)                     AS worst_pnl
      FROM trades WHERE 1=1 ${clause}
    `, params)
    const row = rowR.rows[0]

    const grossR = await pool.query(`
      SELECT
        ${GROSS_PROFIT()} AS gross_profit,
        ${GROSS_LOSS()}   AS gross_loss
      FROM trades WHERE status='closed' ${clause}
    `, params)
    const grossRow = grossR.rows[0]

    const win_rate      = winRate(row.wins, row.losses)
    const profit_factor = profitFactor(grossRow.gross_profit, grossRow.gross_loss)
    const avg_win  = Number(row.avg_win  ?? 0)
    const avg_loss = Number(row.avg_loss ?? 0)

    // startIdx=2 because $1 is the pnl value prepended by the callers below
    const { clause: bClause, params: bParams } = dateFilter(from, to, account_id, strategy_ids, req.userId, 'date', 2)
    const [bestR, worstR] = await Promise.all([
      row.best_pnl  != null ? pool.query(`SELECT id,ticker,pnl,date FROM trades WHERE status='closed' AND pnl=$1 ${bClause} LIMIT 1`, [row.best_pnl,  ...bParams]) : Promise.resolve({ rows: [] }),
      row.worst_pnl != null ? pool.query(`SELECT id,ticker,pnl,date FROM trades WHERE status='closed' AND pnl=$1 ${bClause} LIMIT 1`, [row.worst_pnl, ...bParams]) : Promise.resolve({ rows: [] }),
    ])

    res.json({
      ...row,
      win_rate,
      profit_factor,
      avg_win,
      avg_loss,
      expectancy: expectancy(win_rate, avg_win, avg_loss),
      best_trade:  bestR.rows[0]  ?? null,
      worst_trade: worstR.rows[0] ?? null,
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Equity curve ─────────────────────────────────────────────────────────────
router.get('/equity-curve', async (req, res) => {
  try {
    const { from, to, account_id, strategy_ids } = req.query
    const { clause, params } = dateFilter(from, to, account_id, strategy_ids, req.userId)

    const r = await pool.query(`
      SELECT date, SUM(pnl) as day_pnl FROM trades
      WHERE status='closed' AND pnl IS NOT NULL ${clause}
      GROUP BY date ORDER BY date ASC
    `, params)

    let cumulative = 0
    res.json(r.rows.map(t => {
      cumulative += Number(t.day_pnl)
      return { date: t.date, pnl: Number(t.day_pnl), cumulative }
    }))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Calendar heatmap ─────────────────────────────────────────────────────────
router.get('/calendar', async (req, res) => {
  try {
    const { from, to, account_id, strategy_ids } = req.query
    const { clause, params } = dateFilter(from, to, account_id, strategy_ids, req.userId)

    const r = await pool.query(`
      SELECT SUBSTRING(date, 1, 10) AS date, COALESCE(SUM(pnl),0) AS pnl, COUNT(*) AS trades
      FROM trades WHERE status='closed' AND pnl IS NOT NULL ${clause}
      GROUP BY SUBSTRING(date, 1, 10) ORDER BY date ASC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Monthly P&L ──────────────────────────────────────────────────────────────
router.get('/monthly', async (req, res) => {
  try {
    const { from, to, account_id, strategy_ids } = req.query
    const { clause, params } = dateFilter(from, to, account_id, strategy_ids, req.userId)

    const r = await pool.query(`
      SELECT
        SUBSTRING(date,1,7)                                   AS month,
        COALESCE(SUM(pnl),0)     AS pnl,
        ${COUNT_WINS()}          AS wins,
        ${COUNT_LOSSES()}        AS losses,
        ${COUNT_BREAKEVENS()}    AS breakevens,
        COUNT(*)                 AS trades
      FROM trades WHERE status='closed' ${clause}
      GROUP BY SUBSTRING(date,1,7) ORDER BY month ASC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Streaks ──────────────────────────────────────────────────────────────────
router.get('/streaks', async (req, res) => {
  try {
    const { from, to, account_id, strategy_ids } = req.query
    const { clause, params } = dateFilter(from, to, account_id, strategy_ids, req.userId)

    const r = await pool.query(`
      SELECT pnl, COALESCE(fees,0) AS fees FROM trades
      WHERE status='closed' AND pnl IS NOT NULL ${clause}
      ORDER BY date ASC, id ASC
    `, params)

    let currentStreak=0, longestWin=0, longestLoss=0, prevWin=null
    for (const t of r.rows) {
      const gross = Number(t.pnl) + Number(t.fees)
      if (gross === 0) continue // breakeven — doesn't extend or break a streak
      const isWin = gross > 0
      if (prevWin === null || isWin !== prevWin) currentStreak = isWin ? 1 : -1
      else currentStreak = isWin ? currentStreak + 1 : currentStreak - 1
      if (isWin)  longestWin  = Math.max(longestWin,  currentStreak)
      else        longestLoss = Math.max(longestLoss, Math.abs(currentStreak))
      prevWin = isWin
    }
    res.json({ current: currentStreak, longest_win: longestWin, longest_loss: longestLoss })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
