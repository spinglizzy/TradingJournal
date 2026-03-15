import { Router } from 'express'
import pool from '../db.js'

const router = Router()

// Build date+account+user filter. startIdx lets you offset $N when prepending extra params.
// userId is always required for data isolation; account_id and date range are optional.
function dateFilter(from, to, account_id, userId, col='date', startIdx=1) {
  const params = []
  const parts  = []
  let i = startIdx
  const prefix = col.includes('.') ? col.split('.')[0] + '.' : ''

  // Always filter by user
  parts.push(`${prefix}user_id = $${i++}`); params.push(userId)

  if (account_id) { parts.push(`${prefix}account_id = $${i++}`); params.push(account_id) }
  if (from) { parts.push(`${col} >= $${i++}`); params.push(from) }
  if (to)   { parts.push(`${col} <= $${i++}`); params.push(to)   }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params }
}

// ── Summary ─────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, req.userId)

    const rowR = await pool.query(`
      SELECT
        COUNT(*)                                                         AS total_trades,
        COUNT(CASE WHEN status='closed' THEN 1 END)                     AS closed_trades,
        COUNT(CASE WHEN status='open'   THEN 1 END)                     AS open_trades,
        COALESCE(SUM(CASE WHEN status='closed' THEN pnl END), 0)        AS total_pnl,
        COUNT(CASE WHEN pnl>0  AND status='closed' THEN 1 END)          AS wins,
        COUNT(CASE WHEN pnl<=0 AND status='closed' THEN 1 END)          AS losses,
        AVG(CASE WHEN pnl>0  AND status='closed' THEN pnl END)          AS avg_win,
        AVG(CASE WHEN pnl<=0 AND status='closed' THEN pnl END)          AS avg_loss,
        MAX(CASE WHEN status='closed' THEN pnl END)                     AS best_pnl,
        MIN(CASE WHEN status='closed' THEN pnl END)                     AS worst_pnl
      FROM trades WHERE 1=1 ${clause}
    `, params)
    const row = rowR.rows[0]

    const grossR = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN pnl>0  THEN pnl END), 0)       AS gross_profit,
        ABS(COALESCE(SUM(CASE WHEN pnl<=0 THEN pnl END), 0))  AS gross_loss
      FROM trades WHERE status='closed' ${clause}
    `, params)
    const grossRow = grossR.rows[0]

    const win_rate     = row.closed_trades > 0 ? (row.wins / row.closed_trades) * 100 : 0
    const profit_factor = grossRow.gross_loss > 0 ? grossRow.gross_profit / grossRow.gross_loss : null
    const avg_win  = Number(row.avg_win  ?? 0)
    const avg_loss = Number(row.avg_loss ?? 0)
    const wr = win_rate / 100
    const expectancy = (wr * avg_win) + ((1 - wr) * avg_loss)

    // startIdx=2 because $1 is the pnl value prepended by the callers below
    const { clause: bClause, params: bParams } = dateFilter(from, to, account_id, req.userId, 'date', 2)
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
      expectancy,
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
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, req.userId)

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
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, req.userId)

    const r = await pool.query(`
      SELECT date, COALESCE(SUM(pnl),0) AS pnl, COUNT(*) AS trades
      FROM trades WHERE status='closed' AND pnl IS NOT NULL ${clause}
      GROUP BY date ORDER BY date ASC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Monthly P&L ──────────────────────────────────────────────────────────────
router.get('/monthly', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, req.userId)

    const r = await pool.query(`
      SELECT
        SUBSTRING(date,1,7)                                   AS month,
        COALESCE(SUM(pnl),0)                                  AS pnl,
        COUNT(CASE WHEN pnl>0  THEN 1 END)                    AS wins,
        COUNT(CASE WHEN pnl<=0 THEN 1 END)                    AS losses,
        COUNT(*)                                              AS trades
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
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, req.userId)

    const r = await pool.query(`
      SELECT pnl FROM trades
      WHERE status='closed' AND pnl IS NOT NULL ${clause}
      ORDER BY date ASC, id ASC
    `, params)

    let currentStreak=0, longestWin=0, longestLoss=0, prevWin=null
    for (const t of r.rows) {
      const isWin = t.pnl > 0
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
