import { Router } from 'express'
import pool from '../db.js'

const router = Router()

function parseJ(v, dflt) {
  try { return JSON.parse(v) ?? dflt } catch { return dflt }
}
function fmtSetup(s) {
  return { ...s, checklist: parseJ(s.checklist,[]), default_fields: parseJ(s.default_fields,{}) }
}

async function getStats(strategyId) {
  const [rowR, grossR] = await Promise.all([
    pool.query(`
      SELECT COUNT(*) AS total_trades,
             COUNT(CASE WHEN status='closed' THEN 1 END) AS closed_trades,
             COALESCE(SUM(CASE WHEN status='closed' THEN pnl END),0) AS total_pnl,
             COUNT(CASE WHEN pnl>0  AND status='closed' THEN 1 END) AS wins,
             COUNT(CASE WHEN pnl<=0 AND status='closed' THEN 1 END) AS losses,
             AVG(CASE WHEN pnl>0  AND status='closed' THEN pnl END) AS avg_win,
             AVG(CASE WHEN pnl<=0 AND status='closed' THEN pnl END) AS avg_loss,
             AVG(CASE WHEN status='closed' THEN r_multiple END) AS avg_r,
             MAX(CASE WHEN status='closed' THEN pnl END) AS best_pnl,
             MIN(CASE WHEN status='closed' THEN pnl END) AS worst_pnl
      FROM trades WHERE strategy_id=$1
    `, [strategyId]),
    pool.query(`
      SELECT COALESCE(SUM(CASE WHEN pnl>0  THEN pnl END),0)      AS gross_profit,
             ABS(COALESCE(SUM(CASE WHEN pnl<=0 THEN pnl END),0)) AS gross_loss
      FROM trades WHERE status='closed' AND strategy_id=$1
    `, [strategyId]),
  ])
  const row   = rowR.rows[0]
  const gross = grossR.rows[0]
  const closed = (Number(row.wins)??0) + (Number(row.losses)??0)
  const win_rate = closed>0 ? (Number(row.wins)/closed)*100 : 0
  const profit_factor = gross.gross_loss>0 ? gross.gross_profit/gross.gross_loss : null
  const wr = win_rate/100
  const avg_win  = Number(row.avg_win ??0)
  const avg_loss = Number(row.avg_loss??0)
  const expectancy = (wr*avg_win) + ((1-wr)*avg_loss)
  return { ...row, win_rate, profit_factor, expectancy }
}

async function getEquity(strategyId) {
  const r = await pool.query(`
    SELECT date, SUM(pnl) AS day_pnl FROM trades
    WHERE strategy_id=$1 AND status='closed' AND pnl IS NOT NULL
    GROUP BY date ORDER BY date ASC
  `, [strategyId])
  let cum=0
  return r.rows.map(t => { cum+=Number(t.day_pnl); return { date:t.date, pnl:Number(t.day_pnl), cumulative:cum } })
}

// ── Setup list with performance ───────────────────────────────────────────────
router.get('/setups', async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM strategies ORDER BY name')
    const setups = await Promise.all(r.rows.map(async s => ({
      ...fmtSetup(s), stats: await getStats(s.id), equity_curve: await getEquity(s.id),
    })))
    res.json(setups)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Setup detail ──────────────────────────────────────────────────────────────
router.get('/setups/:id', async (req, res) => {
  try {
    const setupR = await pool.query('SELECT * FROM strategies WHERE id=$1', [req.params.id])
    if (!setupR.rows[0]) return res.status(404).json({ error: 'Setup not found' })
    const setup = setupR.rows[0]

    const [stats, equity, wdR, tkR] = await Promise.all([
      getStats(setup.id),
      getEquity(setup.id),
      pool.query(`
        SELECT EXTRACT(DOW FROM date::date)::int AS wd,
               COUNT(*) AS trades, COALESCE(SUM(pnl),0) AS total_pnl,
               COUNT(CASE WHEN pnl>0 THEN 1 END) AS wins, AVG(pnl) AS avg_pnl
        FROM trades WHERE strategy_id=$1 AND status='closed' AND pnl IS NOT NULL
        GROUP BY wd ORDER BY wd
      `, [setup.id]),
      pool.query(`
        SELECT ticker, COUNT(*) AS trades, COALESCE(SUM(pnl),0) AS total_pnl,
               COUNT(CASE WHEN pnl>0 THEN 1 END) AS wins, AVG(r_multiple) AS avg_r
        FROM trades WHERE strategy_id=$1 AND status='closed'
        GROUP BY ticker ORDER BY total_pnl DESC LIMIT 10
      `, [setup.id]),
    ])

    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const byWeekday = wdR.rows.map(r => ({ ...r, wd:Number(r.wd), day:DAYS[Number(r.wd)] }))

    const [bestR, worstR] = await Promise.all([
      stats.best_pnl  != null ? pool.query(`SELECT id,ticker,pnl,date FROM trades WHERE strategy_id=$1 AND pnl=$2 LIMIT 1`, [setup.id, stats.best_pnl])  : Promise.resolve({rows:[]}),
      stats.worst_pnl != null ? pool.query(`SELECT id,ticker,pnl,date FROM trades WHERE strategy_id=$1 AND pnl=$2 LIMIT 1`, [setup.id, stats.worst_pnl]) : Promise.resolve({rows:[]}),
    ])

    res.json({
      ...fmtSetup(setup),
      stats: { ...stats, best_trade:bestR.rows[0]??null, worst_trade:worstR.rows[0]??null },
      equity_curve: equity,
      by_weekday:   byWeekday,
      by_ticker:    tkR.rows,
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Trades for a setup ────────────────────────────────────────────────────────
router.get('/setups/:id/trades', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT t.*, s.name AS strategy_name FROM trades t
      LEFT JOIN strategies s ON t.strategy_id=s.id
      WHERE t.strategy_id=$1 ORDER BY t.date DESC LIMIT 200
    `, [req.params.id])
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Compare setups ────────────────────────────────────────────────────────────
router.get('/compare', async (req, res) => {
  try {
    const ids = (req.query.ids||'').split(',').map(Number).filter(n=>n>0)
    if (!ids.length) return res.json([])
    const result = await Promise.all(ids.map(async id => {
      const r = await pool.query('SELECT * FROM strategies WHERE id=$1', [id])
      if (!r.rows[0]) return null
      return { ...fmtSetup(r.rows[0]), stats: await getStats(id), equity_curve: await getEquity(id) }
    }))
    res.json(result.filter(Boolean))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Planned trades ────────────────────────────────────────────────────────────
router.get('/planned', async (req, res) => {
  try {
    const { status } = req.query
    const p = []
    const w = ['1=1']
    if (status) w.push(`pt.status = $${p.push(status)}`)
    const r = await pool.query(`
      SELECT pt.*, s.name AS strategy_name FROM planned_trades pt
      LEFT JOIN strategies s ON pt.strategy_id=s.id
      WHERE ${w.join(' AND ')} ORDER BY pt.created_at DESC
    `, p)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/planned', async (req, res) => {
  try {
    const { ticker, strategy_id=null, direction='long',
            planned_entry=null, stop_loss=null, target_price=null,
            notes='', confidence=null } = req.body
    const result = await pool.query(`
      INSERT INTO planned_trades (ticker,strategy_id,direction,planned_entry,stop_loss,target_price,notes,confidence)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence])
    const row = await pool.query(`
      SELECT pt.*, s.name AS strategy_name FROM planned_trades pt
      LEFT JOIN strategies s ON pt.strategy_id=s.id WHERE pt.id=$1
    `, [result.rows[0].id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.put('/planned/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM planned_trades WHERE id=$1', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' })

    const { ticker, strategy_id=null, direction='long',
            planned_entry=null, stop_loss=null, target_price=null,
            notes='', confidence=null, status='active' } = req.body
    const NOW = `TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
    await pool.query(`
      UPDATE planned_trades
      SET ticker=$1,strategy_id=$2,direction=$3,planned_entry=$4,stop_loss=$5,
          target_price=$6,notes=$7,confidence=$8,status=$9,updated_at=${NOW}
      WHERE id=$10
    `, [ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence, status, req.params.id])

    const row = await pool.query(`
      SELECT pt.*, s.name AS strategy_name FROM planned_trades pt
      LEFT JOIN strategies s ON pt.strategy_id=s.id WHERE pt.id=$1
    `, [req.params.id])
    res.json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/planned/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM planned_trades WHERE id=$1', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' })
    await pool.query('DELETE FROM planned_trades WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// Convert planned trade → actual trade
router.post('/planned/:id/execute', async (req, res) => {
  try {
    const ptR = await pool.query('SELECT * FROM planned_trades WHERE id=$1', [req.params.id])
    if (!ptR.rows[0]) return res.status(404).json({ error: 'Not found' })
    const pt = ptR.rows[0]

    const { date, entry_price, position_size=1, fees=0, timeframe='', notes='' } = req.body
    const tradeResult = await pool.query(`
      INSERT INTO trades (date,ticker,direction,entry_price,stop_loss,position_size,fees,strategy_id,timeframe,notes,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open') RETURNING id
    `, [
      date || new Date().toISOString().split('T')[0],
      pt.ticker, pt.direction,
      entry_price ?? pt.planned_entry ?? 0,
      pt.stop_loss, position_size, fees,
      pt.strategy_id, timeframe, notes || pt.notes || '',
    ])

    const tradeId = tradeResult.rows[0].id
    const NOW = `TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
    await pool.query(
      `UPDATE planned_trades SET status='executed',trade_id=$1,updated_at=${NOW} WHERE id=$2`,
      [tradeId, req.params.id]
    )
    res.json({ trade_id: tradeId })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Missed trades ─────────────────────────────────────────────────────────────
router.get('/missed/summary', async (_req, res) => {
  try {
    const [totalR, bySetupR, byMonthR] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(simulated_pnl),0) AS total_missed, COUNT(*) AS count FROM missed_trades`),
      pool.query(`
        SELECT COALESCE(s.name,'Unknown') AS setup_name,
               COUNT(*) AS count, COALESCE(SUM(mt.simulated_pnl),0) AS total_pnl
        FROM missed_trades mt LEFT JOIN strategies s ON mt.strategy_id=s.id
        GROUP BY mt.strategy_id, s.name ORDER BY total_pnl DESC
      `),
      pool.query(`
        SELECT SUBSTRING(date,1,7) AS month,
               COUNT(*) AS count, COALESCE(SUM(simulated_pnl),0) AS total_pnl
        FROM missed_trades GROUP BY SUBSTRING(date,1,7) ORDER BY month ASC
      `),
    ])
    res.json({ ...totalR.rows[0], by_setup:bySetupR.rows, by_month:byMonthR.rows })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.get('/missed', async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT mt.*, s.name AS strategy_name FROM missed_trades mt
      LEFT JOIN strategies s ON mt.strategy_id=s.id ORDER BY mt.date DESC
    `)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/missed', async (req, res) => {
  try {
    const { date, ticker, strategy_id=null, direction='long',
            entry_would_have_been=null, exit_would_have_been=null,
            position_size=100, simulated_pnl=null, reason_missed='', notes='' } = req.body
    const result = await pool.query(`
      INSERT INTO missed_trades (date,ticker,strategy_id,direction,entry_would_have_been,exit_would_have_been,position_size,simulated_pnl,reason_missed,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been, position_size, simulated_pnl, reason_missed, notes])
    const row = await pool.query(`
      SELECT mt.*, s.name AS strategy_name FROM missed_trades mt
      LEFT JOIN strategies s ON mt.strategy_id=s.id WHERE mt.id=$1
    `, [result.rows[0].id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.put('/missed/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM missed_trades WHERE id=$1', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' })

    const { date, ticker, strategy_id=null, direction='long',
            entry_would_have_been=null, exit_would_have_been=null,
            position_size=100, simulated_pnl=null, reason_missed='', notes='' } = req.body
    await pool.query(`
      UPDATE missed_trades SET date=$1,ticker=$2,strategy_id=$3,direction=$4,
        entry_would_have_been=$5,exit_would_have_been=$6,position_size=$7,
        simulated_pnl=$8,reason_missed=$9,notes=$10 WHERE id=$11
    `, [date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been,
        position_size, simulated_pnl, reason_missed, notes, req.params.id])

    const row = await pool.query(`
      SELECT mt.*, s.name AS strategy_name FROM missed_trades mt
      LEFT JOIN strategies s ON mt.strategy_id=s.id WHERE mt.id=$1
    `, [req.params.id])
    res.json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/missed/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM missed_trades WHERE id=$1', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' })
    await pool.query('DELETE FROM missed_trades WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
