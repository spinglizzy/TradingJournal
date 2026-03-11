import { Router } from 'express'
import db from '../db.js'

const router = Router()

function dateFilter(from, to, account_id, col = 't.date') {
  const parts = []
  const params = {}
  // Derive table prefix from col — if col has a dot, use same prefix for account_id
  const prefix = col.includes('.') ? col.split('.')[0] + '.' : ''
  if (account_id) { parts.push(`${prefix}account_id = :account_id`); params.account_id = account_id }
  if (from) { parts.push(`${col} >= :from`); params.from = from }
  if (to)   { parts.push(`${col} <= :to`);   params.to   = to   }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params }
}

// ── By day of week ─────────────────────────────────────────────────────────────
router.get('/by-weekday', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT
      CAST(strftime('%w', date) AS INTEGER)         AS dow,
      COUNT(*)                                       AS trades,
      COALESCE(SUM(pnl), 0)                         AS pnl,
      COUNT(CASE WHEN pnl > 0  THEN 1 END)          AS wins,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END)          AS losses,
      AVG(pnl)                                      AS avg_pnl,
      AVG(r_multiple)                               AS avg_r
    FROM trades
    WHERE status = 'closed' ${clause}
    GROUP BY dow
    ORDER BY dow
  `).all(params)

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  res.json(rows.map(r => ({ ...r, day: days[r.dow] })))
})

// ── By hour of day (uses created_at as proxy for entry time) ───────────────────
router.get('/by-hour', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT
      CAST(strftime('%H', created_at) AS INTEGER)   AS hour,
      COUNT(*)                                       AS trades,
      COALESCE(SUM(pnl), 0)                         AS pnl,
      COUNT(CASE WHEN pnl > 0  THEN 1 END)          AS wins,
      AVG(pnl)                                      AS avg_pnl,
      AVG(r_multiple)                               AS avg_r
    FROM trades
    WHERE status = 'closed' ${clause}
    GROUP BY hour
    ORDER BY hour
  `).all(params)

  res.json(rows.map(r => ({ ...r, label: `${String(r.hour).padStart(2,'0')}:00` })))
})

// ── By strategy ────────────────────────────────────────────────────────────────
router.get('/by-strategy', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 't.date')

  const rows = db.prepare(`
    SELECT
      COALESCE(s.name, 'No Strategy')              AS strategy,
      COUNT(*)                                      AS trades,
      COALESCE(SUM(t.pnl), 0)                      AS pnl,
      COUNT(CASE WHEN t.pnl > 0  THEN 1 END)       AS wins,
      COUNT(CASE WHEN t.pnl <= 0 THEN 1 END)       AS losses,
      AVG(t.pnl)                                   AS avg_pnl,
      AVG(t.r_multiple)                            AS avg_r,
      1.0 * SUM(CASE WHEN t.pnl > 0  THEN t.pnl ELSE 0 END) /
        NULLIF(ABS(SUM(CASE WHEN t.pnl <= 0 THEN t.pnl ELSE 0 END)), 0) AS profit_factor
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    WHERE t.status = 'closed' ${clause}
    GROUP BY t.strategy_id
    ORDER BY pnl DESC
  `).all(params)
  res.json(rows)
})

// ── By setup ──────────────────────────────────────────────────────────────────
router.get('/by-setup', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(setup), ''), 'No Setup') AS setup,
      COUNT(*)                                       AS trades,
      COALESCE(SUM(pnl), 0)                         AS pnl,
      COUNT(CASE WHEN pnl > 0  THEN 1 END)          AS wins,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END)          AS losses,
      AVG(pnl)                                      AS avg_pnl,
      AVG(r_multiple)                               AS avg_r,
      1.0 * SUM(CASE WHEN pnl > 0  THEN pnl ELSE 0 END) /
        NULLIF(ABS(SUM(CASE WHEN pnl <= 0 THEN pnl ELSE 0 END)), 0) AS profit_factor
    FROM trades
    WHERE status = 'closed' ${clause}
    GROUP BY setup
    ORDER BY pnl DESC
  `).all(params)
  res.json(rows)
})

// ── By ticker ─────────────────────────────────────────────────────────────────
router.get('/by-ticker', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT
      ticker,
      COUNT(*)                                      AS trades,
      COALESCE(SUM(pnl), 0)                        AS pnl,
      COUNT(CASE WHEN pnl > 0  THEN 1 END)         AS wins,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END)         AS losses,
      AVG(pnl)                                     AS avg_pnl,
      AVG(r_multiple)                              AS avg_r,
      1.0 * SUM(CASE WHEN pnl > 0  THEN pnl ELSE 0 END) /
        NULLIF(ABS(SUM(CASE WHEN pnl <= 0 THEN pnl ELSE 0 END)), 0) AS profit_factor
    FROM trades
    WHERE status = 'closed' ${clause}
    GROUP BY ticker
    ORDER BY pnl DESC
  `).all(params)
  res.json(rows)
})

// ── By tag ────────────────────────────────────────────────────────────────────
router.get('/by-tag', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 't.date')

  const rows = db.prepare(`
    SELECT
      tg.name                                       AS tag,
      tg.color,
      COUNT(*)                                      AS trades,
      COALESCE(SUM(t.pnl), 0)                      AS pnl,
      COUNT(CASE WHEN t.pnl > 0  THEN 1 END)       AS wins,
      COUNT(CASE WHEN t.pnl <= 0 THEN 1 END)       AS losses,
      AVG(t.pnl)                                   AS avg_pnl,
      AVG(t.r_multiple)                            AS avg_r,
      1.0 * SUM(CASE WHEN t.pnl > 0  THEN t.pnl ELSE 0 END) /
        NULLIF(ABS(SUM(CASE WHEN t.pnl <= 0 THEN t.pnl ELSE 0 END)), 0) AS profit_factor
    FROM trades t
    JOIN trade_tags tt ON t.id = tt.trade_id
    JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.status = 'closed' ${clause}
    GROUP BY tg.id, tg.name, tg.color
    ORDER BY pnl DESC
  `).all(params)
  res.json(rows)
})

// ── R:R distribution ──────────────────────────────────────────────────────────
router.get('/rr-dist', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT r_multiple
    FROM trades
    WHERE status = 'closed' AND r_multiple IS NOT NULL ${clause}
    ORDER BY r_multiple
  `).all(params)
  res.json(rows.map(r => r.r_multiple))
})

// ── P&L distribution (raw values for histogram) ────────────────────────────────
router.get('/pnl-dist', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT pnl
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    ORDER BY pnl
  `).all(params)
  res.json(rows.map(r => r.pnl))
})

// ── Drawdown ──────────────────────────────────────────────────────────────────
router.get('/drawdown', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const trades = db.prepare(`
    SELECT date, SUM(pnl) as day_pnl
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    GROUP BY date
    ORDER BY date ASC
  `).all(params)

  let peak = 0, cumulative = 0
  res.json(trades.map(t => {
    cumulative += t.day_pnl
    if (cumulative > peak) peak = cumulative
    const drawdown = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0
    return { date: t.date, cumulative, drawdown }
  }))
})

// ── Hold time ─────────────────────────────────────────────────────────────────
router.get('/hold-time', (req, res) => {
  const { from, to, account_id } = req.query
  const { clause, params } = dateFilter(from, to, account_id, 'date')

  const rows = db.prepare(`
    SELECT
      ROUND((julianday(updated_at) - julianday(created_at)) * 1440) AS minutes,
      COUNT(*) AS count
    FROM trades
    WHERE status = 'closed' ${clause}
    GROUP BY minutes
    ORDER BY minutes
  `).all(params)
  res.json(rows)
})

// ── Custom report: any dimension × any metric ──────────────────────────────────
// Uses whitelist to prevent SQL injection.
const X_FIELDS = {
  day_of_week: {
    select: `CASE CAST(strftime('%w', t.date) AS INT)
               WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
               WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri'
               WHEN 6 THEN 'Sat' END`,
    orderBy: `CAST(strftime('%w', t.date) AS INT)`,
    joins: '',
  },
  hour: {
    select: `CAST(strftime('%H', t.created_at) AS INT)`,
    orderBy: `CAST(strftime('%H', t.created_at) AS INT)`,
    joins: '',
  },
  setup: {
    select: `COALESCE(NULLIF(TRIM(t.setup), ''), 'No Setup')`,
    orderBy: `value DESC`,
    joins: '',
  },
  ticker: {
    select: `t.ticker`,
    orderBy: `value DESC`,
    joins: '',
  },
  strategy: {
    select: `COALESCE(s.name, 'No Strategy')`,
    orderBy: `value DESC`,
    joins: `LEFT JOIN strategies s ON t.strategy_id = s.id`,
  },
  direction: {
    select: `t.direction`,
    orderBy: `dimension ASC`,
    joins: '',
  },
  timeframe: {
    select: `COALESCE(NULLIF(t.timeframe, ''), 'No Timeframe')`,
    orderBy: `value DESC`,
    joins: '',
  },
  month: {
    select: `strftime('%Y-%m', t.date)`,
    orderBy: `dimension ASC`,
    joins: '',
  },
}

const Y_METRICS = {
  pnl:           `COALESCE(SUM(t.pnl), 0)`,
  avg_pnl:       `AVG(t.pnl)`,
  win_rate:      `100.0 * COUNT(CASE WHEN t.pnl > 0 THEN 1 END) / COUNT(*)`,
  profit_factor: `1.0 * SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END) / NULLIF(ABS(SUM(CASE WHEN t.pnl <= 0 THEN t.pnl ELSE 0 END)), 0)`,
  trade_count:   `COUNT(*)`,
  avg_r:         `AVG(t.r_multiple)`,
}

router.get('/custom', (req, res) => {
  const { x_field, y_metric, from, to } = req.query

  if (!X_FIELDS[x_field] || !Y_METRICS[y_metric]) {
    return res.status(400).json({ error: 'Invalid x_field or y_metric' })
  }

  const xDef = X_FIELDS[x_field]
  const yExpr = Y_METRICS[y_metric]
  const { clause, params } = dateFilter(from, to, account_id, 't.date')

  const rows = db.prepare(`
    SELECT
      ${xDef.select}   AS dimension,
      ${yExpr}         AS value,
      COUNT(*)         AS trades
    FROM trades t
    ${xDef.joins}
    WHERE t.status = 'closed' ${clause}
    GROUP BY ${xDef.select}
    ORDER BY ${xDef.orderBy.includes('value') ? yExpr : xDef.orderBy} ${xDef.orderBy.includes('DESC') ? 'DESC' : ''}
  `).all(params)

  res.json(rows)
})

export default router
