import { Router } from 'express'
import db from '../db.js'

const router = Router()

// Build parameterised date + account clause
function dateFilter(from, to, account_id, col = 'date') {
  const parts = []
  const params = {}
  const prefix = col.includes('.') ? col.split('.')[0] + '.' : ''
  if (account_id) { parts.push(`${prefix}account_id = :account_id`); params.account_id = account_id }
  if (from) { parts.push(`${col} >= :from`); params.from = from }
  if (to)   { parts.push(`${col} <= :to`);   params.to   = to   }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params }
}

// ── Summary ─────────────────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id)

  const row = db.prepare(`
    SELECT
      COUNT(*)                                                        AS total_trades,
      COUNT(CASE WHEN status = 'closed' THEN 1 END)                  AS closed_trades,
      COUNT(CASE WHEN status = 'open'   THEN 1 END)                  AS open_trades,
      COALESCE(SUM(CASE WHEN status='closed' THEN pnl END), 0)       AS total_pnl,
      COUNT(CASE WHEN pnl > 0  AND status='closed' THEN 1 END)       AS wins,
      COUNT(CASE WHEN pnl <= 0 AND status='closed' THEN 1 END)       AS losses,
      AVG(CASE WHEN pnl > 0  AND status='closed' THEN pnl END)       AS avg_win,
      AVG(CASE WHEN pnl <= 0 AND status='closed' THEN pnl END)       AS avg_loss,
      MAX(CASE WHEN status='closed' THEN pnl END)                    AS best_pnl,
      MIN(CASE WHEN status='closed' THEN pnl END)                    AS worst_pnl
    FROM trades
    WHERE 1=1 ${clause}
  `).get(params)

  const win_rate = row.closed_trades > 0 ? (row.wins / row.closed_trades) * 100 : 0

  const grossRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN pnl > 0  THEN pnl END), 0)        AS gross_profit,
      ABS(COALESCE(SUM(CASE WHEN pnl <= 0 THEN pnl END), 0))   AS gross_loss
    FROM trades WHERE status='closed' ${clause}
  `).get(params)

  const profit_factor = grossRow.gross_loss > 0 ? grossRow.gross_profit / grossRow.gross_loss : null
  const avg_win  = row.avg_win  ?? 0
  const avg_loss = row.avg_loss ?? 0
  const wr = win_rate / 100
  const expectancy = (wr * avg_win) + ((1 - wr) * avg_loss)

  const best  = row.best_pnl  != null ? db.prepare(`SELECT id, ticker, pnl, date FROM trades WHERE status='closed' AND pnl=:pnl ${clause} LIMIT 1`).get({ pnl: row.best_pnl,  ...params }) : null
  const worst = row.worst_pnl != null ? db.prepare(`SELECT id, ticker, pnl, date FROM trades WHERE status='closed' AND pnl=:pnl ${clause} LIMIT 1`).get({ pnl: row.worst_pnl, ...params }) : null

  res.json({
    ...row,
    win_rate,
    profit_factor,
    avg_win,
    avg_loss,
    expectancy,
    best_trade:  best,
    worst_trade: worst,
  })
})

// ── Equity curve ─────────────────────────────────────────────────────────────
router.get('/equity-curve', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id)

  const trades = db.prepare(`
    SELECT date, SUM(pnl) as day_pnl
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    GROUP BY date
    ORDER BY date ASC
  `).all(params)

  let cumulative = 0
  res.json(trades.map(t => {
    cumulative += t.day_pnl
    return { date: t.date, pnl: t.day_pnl, cumulative }
  }))
})

// ── Calendar heatmap ─────────────────────────────────────────────────────────
router.get('/calendar', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id)

  const rows = db.prepare(`
    SELECT
      date,
      COALESCE(SUM(pnl), 0) AS pnl,
      COUNT(*)              AS trades
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    GROUP BY date
    ORDER BY date ASC
  `).all(params)

  res.json(rows)
})

// ── Monthly P&L ──────────────────────────────────────────────────────────────
router.get('/monthly', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id)

  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', date)                               AS month,
      COALESCE(SUM(pnl), 0)                                 AS pnl,
      COUNT(CASE WHEN pnl > 0  THEN 1 END)                  AS wins,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END)                  AS losses,
      COUNT(*)                                              AS trades
    FROM trades
    WHERE status = 'closed' ${clause}
    GROUP BY month
    ORDER BY month ASC
  `).all(params)
  res.json(rows)
})

// ── Streaks ──────────────────────────────────────────────────────────────────
router.get('/streaks', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id)

  const trades = db.prepare(`
    SELECT pnl FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    ORDER BY date ASC, id ASC
  `).all(params)

  let currentStreak = 0, longestWin = 0, longestLoss = 0, prevWin = null
  for (const t of trades) {
    const isWin = t.pnl > 0
    if (prevWin === null || isWin !== prevWin) currentStreak = isWin ? 1 : -1
    else currentStreak = isWin ? currentStreak + 1 : currentStreak - 1
    if (isWin)  longestWin  = Math.max(longestWin,  currentStreak)
    else        longestLoss = Math.max(longestLoss, Math.abs(currentStreak))
    prevWin = isWin
  }

  res.json({ current: currentStreak, longest_win: longestWin, longest_loss: longestLoss })
})

export default router
