import { Router } from 'express'
import pool from '../db.js'

const router = Router()

function dateFilter(from, to, account_id, col='t.date', startIdx=1) {
  const params = []
  const parts  = []
  let i = startIdx
  const prefix = col.includes('.') ? col.split('.')[0] + '.' : ''
  if (account_id) { parts.push(`${prefix}account_id = $${i++}`); params.push(account_id) }
  if (from) { parts.push(`${col} >= $${i++}`); params.push(from) }
  if (to)   { parts.push(`${col} <= $${i++}`); params.push(to)   }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params }
}

// ── By day of week ─────────────────────────────────────────────────────────────
router.get('/by-weekday', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT
        EXTRACT(DOW FROM date::date)::int                AS dow,
        COUNT(*)                                          AS trades,
        COALESCE(SUM(pnl),0)                             AS pnl,
        COUNT(CASE WHEN pnl>0  THEN 1 END)               AS wins,
        COUNT(CASE WHEN pnl<=0 THEN 1 END)               AS losses,
        AVG(pnl)                                         AS avg_pnl,
        AVG(r_multiple)                                  AS avg_r
      FROM trades WHERE status='closed' ${clause}
      GROUP BY dow ORDER BY dow
    `, params)

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    res.json(r.rows.map(row => ({ ...row, dow: Number(row.dow), day: days[Number(row.dow)] })))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── By hour of day ─────────────────────────────────────────────────────────────
router.get('/by-hour', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM created_at::timestamptz)::int  AS hour,
        COUNT(*)                                          AS trades,
        COALESCE(SUM(pnl),0)                             AS pnl,
        COUNT(CASE WHEN pnl>0  THEN 1 END)               AS wins,
        AVG(pnl)                                         AS avg_pnl,
        AVG(r_multiple)                                  AS avg_r
      FROM trades WHERE status='closed' ${clause}
      GROUP BY hour ORDER BY hour
    `, params)

    res.json(r.rows.map(row => ({ ...row, hour: Number(row.hour), label: `${String(Number(row.hour)).padStart(2,'0')}:00` })))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── By strategy ────────────────────────────────────────────────────────────────
router.get('/by-strategy', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 't.date')

    const r = await pool.query(`
      SELECT
        COALESCE(s.name,'No Strategy')                    AS strategy,
        COUNT(*)                                          AS trades,
        COALESCE(SUM(t.pnl),0)                           AS pnl,
        COUNT(CASE WHEN t.pnl>0  THEN 1 END)             AS wins,
        COUNT(CASE WHEN t.pnl<=0 THEN 1 END)             AS losses,
        AVG(t.pnl)                                       AS avg_pnl,
        AVG(t.r_multiple)                                AS avg_r,
        1.0*SUM(CASE WHEN t.pnl>0  THEN t.pnl ELSE 0 END)/
          NULLIF(ABS(SUM(CASE WHEN t.pnl<=0 THEN t.pnl ELSE 0 END)),0) AS profit_factor
      FROM trades t LEFT JOIN strategies s ON t.strategy_id=s.id
      WHERE t.status='closed' ${clause}
      GROUP BY t.strategy_id, s.name ORDER BY pnl DESC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── By setup ──────────────────────────────────────────────────────────────────
router.get('/by-setup', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(setup),''),'No Setup')       AS setup,
        COUNT(*)                                          AS trades,
        COALESCE(SUM(pnl),0)                             AS pnl,
        COUNT(CASE WHEN pnl>0  THEN 1 END)               AS wins,
        COUNT(CASE WHEN pnl<=0 THEN 1 END)               AS losses,
        AVG(pnl)                                         AS avg_pnl,
        AVG(r_multiple)                                  AS avg_r,
        1.0*SUM(CASE WHEN pnl>0  THEN pnl ELSE 0 END)/
          NULLIF(ABS(SUM(CASE WHEN pnl<=0 THEN pnl ELSE 0 END)),0) AS profit_factor
      FROM trades WHERE status='closed' ${clause}
      GROUP BY COALESCE(NULLIF(TRIM(setup),''),'No Setup') ORDER BY pnl DESC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── By ticker ─────────────────────────────────────────────────────────────────
router.get('/by-ticker', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT
        ticker,
        COUNT(*)                                         AS trades,
        COALESCE(SUM(pnl),0)                            AS pnl,
        COUNT(CASE WHEN pnl>0  THEN 1 END)              AS wins,
        COUNT(CASE WHEN pnl<=0 THEN 1 END)              AS losses,
        AVG(pnl)                                        AS avg_pnl,
        AVG(r_multiple)                                 AS avg_r,
        1.0*SUM(CASE WHEN pnl>0  THEN pnl ELSE 0 END)/
          NULLIF(ABS(SUM(CASE WHEN pnl<=0 THEN pnl ELSE 0 END)),0) AS profit_factor
      FROM trades WHERE status='closed' ${clause}
      GROUP BY ticker ORDER BY pnl DESC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── By tag ────────────────────────────────────────────────────────────────────
router.get('/by-tag', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 't.date')

    const r = await pool.query(`
      SELECT
        tg.name                                          AS tag,
        tg.color,
        COUNT(*)                                         AS trades,
        COALESCE(SUM(t.pnl),0)                          AS pnl,
        COUNT(CASE WHEN t.pnl>0  THEN 1 END)            AS wins,
        COUNT(CASE WHEN t.pnl<=0 THEN 1 END)            AS losses,
        AVG(t.pnl)                                      AS avg_pnl,
        AVG(t.r_multiple)                               AS avg_r,
        1.0*SUM(CASE WHEN t.pnl>0  THEN t.pnl ELSE 0 END)/
          NULLIF(ABS(SUM(CASE WHEN t.pnl<=0 THEN t.pnl ELSE 0 END)),0) AS profit_factor
      FROM trades t
      JOIN trade_tags tt ON t.id=tt.trade_id
      JOIN tags tg ON tt.tag_id=tg.id
      WHERE t.status='closed' ${clause}
      GROUP BY tg.id,tg.name,tg.color ORDER BY pnl DESC
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── R:R distribution ──────────────────────────────────────────────────────────
router.get('/rr-dist', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT r_multiple FROM trades
      WHERE status='closed' AND r_multiple IS NOT NULL ${clause}
      ORDER BY r_multiple
    `, params)
    res.json(r.rows.map(row => row.r_multiple))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── P&L distribution ────────────────────────────────────────────────────────
router.get('/pnl-dist', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT pnl FROM trades
      WHERE status='closed' AND pnl IS NOT NULL ${clause}
      ORDER BY pnl
    `, params)
    res.json(r.rows.map(row => row.pnl))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Drawdown ──────────────────────────────────────────────────────────────────
router.get('/drawdown', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT date, SUM(pnl) as day_pnl FROM trades
      WHERE status='closed' AND pnl IS NOT NULL ${clause}
      GROUP BY date ORDER BY date ASC
    `, params)

    let peak=0, cumulative=0
    res.json(r.rows.map(t => {
      cumulative += Number(t.day_pnl)
      if (cumulative > peak) peak = cumulative
      const drawdown = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0
      return { date: t.date, cumulative, drawdown }
    }))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Hold time ─────────────────────────────────────────────────────────────────
router.get('/hold-time', async (req, res) => {
  try {
    const { from, to, account_id } = req.query
    const { clause, params } = dateFilter(from, to, account_id, 'date')

    const r = await pool.query(`
      SELECT
        ROUND(EXTRACT(EPOCH FROM (updated_at::timestamptz - created_at::timestamptz)) / 60)::int AS minutes,
        COUNT(*) AS count
      FROM trades WHERE status='closed' ${clause}
      GROUP BY minutes ORDER BY minutes
    `, params)
    res.json(r.rows.map(row => ({ ...row, minutes: Number(row.minutes) })))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Custom report ──────────────────────────────────────────────────────────────
const X_FIELDS = {
  day_of_week: {
    select:  `CASE EXTRACT(DOW FROM t.date::date)::int WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END`,
    orderBy: `EXTRACT(DOW FROM t.date::date)::int`,
    joins:   '',
  },
  hour: {
    select:  `EXTRACT(HOUR FROM t.created_at::timestamptz)::int`,
    orderBy: `EXTRACT(HOUR FROM t.created_at::timestamptz)::int`,
    joins:   '',
  },
  setup: {
    select:  `COALESCE(NULLIF(TRIM(t.setup),''),'No Setup')`,
    orderBy: `value DESC`,
    joins:   '',
  },
  ticker: {
    select:  `t.ticker`,
    orderBy: `value DESC`,
    joins:   '',
  },
  strategy: {
    select:  `COALESCE(s.name,'No Strategy')`,
    orderBy: `value DESC`,
    joins:   `LEFT JOIN strategies s ON t.strategy_id=s.id`,
  },
  direction: {
    select:  `t.direction`,
    orderBy: `dimension ASC`,
    joins:   '',
  },
  timeframe: {
    select:  `COALESCE(NULLIF(t.timeframe,''),'No Timeframe')`,
    orderBy: `value DESC`,
    joins:   '',
  },
  month: {
    select:  `SUBSTRING(t.date,1,7)`,
    orderBy: `dimension ASC`,
    joins:   '',
  },
}

const Y_METRICS = {
  pnl:           `COALESCE(SUM(t.pnl),0)`,
  avg_pnl:       `AVG(t.pnl)`,
  win_rate:      `100.0*COUNT(CASE WHEN t.pnl>0 THEN 1 END)/COUNT(*)`,
  profit_factor: `1.0*SUM(CASE WHEN t.pnl>0 THEN t.pnl ELSE 0 END)/NULLIF(ABS(SUM(CASE WHEN t.pnl<=0 THEN t.pnl ELSE 0 END)),0)`,
  trade_count:   `COUNT(*)`,
  avg_r:         `AVG(t.r_multiple)`,
}

router.get('/custom', async (req, res) => {
  try {
    const { x_field, y_metric, from, to, account_id } = req.query
    if (!X_FIELDS[x_field] || !Y_METRICS[y_metric]) {
      return res.status(400).json({ error: 'Invalid x_field or y_metric' })
    }

    const xDef  = X_FIELDS[x_field]
    const yExpr = Y_METRICS[y_metric]
    const { clause, params } = dateFilter(from, to, account_id, 't.date')

    const orderExpr = xDef.orderBy.includes('value') ? yExpr : xDef.orderBy
    const orderDir  = xDef.orderBy.includes('DESC') ? 'DESC' : ''

    const r = await pool.query(`
      SELECT
        ${xDef.select}  AS dimension,
        ${yExpr}        AS value,
        COUNT(*)        AS trades
      FROM trades t ${xDef.joins}
      WHERE t.status='closed' ${clause}
      GROUP BY ${xDef.select}
      ORDER BY ${orderExpr} ${orderDir}
    `, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
