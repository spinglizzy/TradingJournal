import { Router } from 'express'
import db from '../db.js'

const router = Router()

// ── By day of week ────────────────────────────────────────────────────────────
router.get('/by-weekday', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      CAST(strftime('%w', date) AS INTEGER) AS dow,
      COUNT(*)                              AS trades,
      COALESCE(SUM(pnl), 0)                AS pnl,
      COUNT(CASE WHEN pnl > 0 THEN 1 END)  AS wins,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END) AS losses
    FROM trades
    WHERE status = 'closed'
    GROUP BY dow
    ORDER BY dow
  `).all()

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  res.json(rows.map(r => ({ ...r, day: days[r.dow] })))
})

// ── By strategy ───────────────────────────────────────────────────────────────
router.get('/by-strategy', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      COALESCE(s.name, 'No Strategy')      AS strategy,
      COUNT(*)                              AS trades,
      COALESCE(SUM(t.pnl), 0)              AS pnl,
      COUNT(CASE WHEN t.pnl > 0 THEN 1 END) AS wins,
      AVG(t.pnl)                           AS avg_pnl,
      AVG(t.r_multiple)                    AS avg_r
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    WHERE t.status = 'closed'
    GROUP BY t.strategy_id
    ORDER BY pnl DESC
  `).all()
  res.json(rows)
})

// ── By ticker ─────────────────────────────────────────────────────────────────
router.get('/by-ticker', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      ticker,
      COUNT(*)                              AS trades,
      COALESCE(SUM(pnl), 0)                AS pnl,
      COUNT(CASE WHEN pnl > 0 THEN 1 END)  AS wins,
      AVG(pnl)                             AS avg_pnl
    FROM trades
    WHERE status = 'closed'
    GROUP BY ticker
    ORDER BY pnl DESC
  `).all()
  res.json(rows)
})

// ── R:R distribution ─────────────────────────────────────────────────────────
router.get('/rr-dist', (_req, res) => {
  const rows = db.prepare(`
    SELECT r_multiple
    FROM trades
    WHERE status = 'closed' AND r_multiple IS NOT NULL
    ORDER BY r_multiple
  `).all()
  res.json(rows.map(r => r.r_multiple))
})

// ── Drawdown ──────────────────────────────────────────────────────────────────
router.get('/drawdown', (_req, res) => {
  const trades = db.prepare(`
    SELECT date, SUM(pnl) as day_pnl
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all()

  let peak = 0
  let cumulative = 0
  const result = trades.map(t => {
    cumulative += t.day_pnl
    if (cumulative > peak) peak = cumulative
    const drawdown = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0
    return { date: t.date, cumulative, drawdown }
  })

  res.json(result)
})

// ── Hold time ─────────────────────────────────────────────────────────────────
router.get('/hold-time', (_req, res) => {
  // Approximated from created_at vs updated_at (minutes)
  const rows = db.prepare(`
    SELECT
      ROUND((julianday(updated_at) - julianday(created_at)) * 1440) AS minutes,
      COUNT(*) AS count
    FROM trades
    WHERE status = 'closed'
    GROUP BY minutes
    ORDER BY minutes
  `).all()
  res.json(rows)
})

export default router
