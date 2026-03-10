import { Router } from 'express'
import db from '../db.js'

const router = Router()

// ── Summary cards ─────────────────────────────────────────────────────────────
router.get('/summary', (_req, res) => {
  const row = db.prepare(`
    SELECT
      COUNT(*)                                          AS total_trades,
      COUNT(CASE WHEN status = 'closed' THEN 1 END)    AS closed_trades,
      COUNT(CASE WHEN status = 'open'   THEN 1 END)    AS open_trades,
      COALESCE(SUM(CASE WHEN status='closed' THEN pnl END), 0)  AS total_pnl,
      COUNT(CASE WHEN pnl > 0 AND status='closed' THEN 1 END)   AS wins,
      COUNT(CASE WHEN pnl <= 0 AND status='closed' THEN 1 END)  AS losses,
      AVG(CASE WHEN pnl > 0 AND status='closed' THEN pnl END)   AS avg_win,
      AVG(CASE WHEN pnl <= 0 AND status='closed' THEN pnl END)  AS avg_loss
    FROM trades
  `).get()

  const win_rate = row.closed_trades > 0
    ? (row.wins / row.closed_trades) * 100
    : 0

  const gross_profit = db.prepare(
    `SELECT COALESCE(SUM(pnl),0) as v FROM trades WHERE pnl > 0 AND status='closed'`
  ).get().v
  const gross_loss = Math.abs(db.prepare(
    `SELECT COALESCE(SUM(pnl),0) as v FROM trades WHERE pnl <= 0 AND status='closed'`
  ).get().v)
  const profit_factor = gross_loss > 0 ? gross_profit / gross_loss : null

  res.json({
    ...row,
    win_rate,
    profit_factor,
    avg_win: row.avg_win ?? 0,
    avg_loss: row.avg_loss ?? 0,
  })
})

// ── Equity curve ──────────────────────────────────────────────────────────────
router.get('/equity-curve', (_req, res) => {
  const trades = db.prepare(`
    SELECT date, SUM(pnl) as day_pnl
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all()

  let cumulative = 0
  const curve = trades.map(t => {
    cumulative += t.day_pnl
    return { date: t.date, pnl: t.day_pnl, cumulative }
  })

  res.json(curve)
})

// ── Monthly P&L ───────────────────────────────────────────────────────────────
router.get('/monthly', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', date)                               AS month,
      COALESCE(SUM(pnl), 0)                                 AS pnl,
      COUNT(CASE WHEN pnl > 0 THEN 1 END)                   AS wins,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END)                  AS losses,
      COUNT(*)                                              AS trades
    FROM trades
    WHERE status = 'closed'
    GROUP BY month
    ORDER BY month ASC
  `).all()
  res.json(rows)
})

// ── Streaks ───────────────────────────────────────────────────────────────────
router.get('/streaks', (_req, res) => {
  const trades = db.prepare(`
    SELECT pnl FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL
    ORDER BY date ASC, id ASC
  `).all()

  let currentStreak = 0
  let longestWin = 0
  let longestLoss = 0
  let prevWin = null

  for (const t of trades) {
    const isWin = t.pnl > 0
    if (prevWin === null || isWin !== prevWin) {
      currentStreak = isWin ? 1 : -1
    } else {
      currentStreak = isWin ? currentStreak + 1 : currentStreak - 1
    }
    if (isWin) longestWin = Math.max(longestWin, currentStreak)
    else longestLoss = Math.max(longestLoss, Math.abs(currentStreak))
    prevWin = isWin
  }

  res.json({ current: currentStreak, longest_win: longestWin, longest_loss: longestLoss })
})

export default router
