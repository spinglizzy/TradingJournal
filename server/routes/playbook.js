import { Router } from 'express'
import db from '../db.js'

const router = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJ(v, dflt) {
  try { return JSON.parse(v) ?? dflt } catch { return dflt }
}

function fmtSetup(s) {
  return { ...s, checklist: parseJ(s.checklist, []), default_fields: parseJ(s.default_fields, {}) }
}

function getStats(strategyId) {
  const row = db.prepare(`
    SELECT
      COUNT(*)                                                         AS total_trades,
      COUNT(CASE WHEN status='closed' THEN 1 END)                     AS closed_trades,
      COALESCE(SUM(CASE WHEN status='closed' THEN pnl END), 0)        AS total_pnl,
      COUNT(CASE WHEN pnl > 0  AND status='closed' THEN 1 END)        AS wins,
      COUNT(CASE WHEN pnl <= 0 AND status='closed' THEN 1 END)        AS losses,
      AVG(CASE WHEN pnl > 0  AND status='closed' THEN pnl END)        AS avg_win,
      AVG(CASE WHEN pnl <= 0 AND status='closed' THEN pnl END)        AS avg_loss,
      AVG(CASE WHEN status='closed' THEN r_multiple END)              AS avg_r,
      MAX(CASE WHEN status='closed' THEN pnl END)                     AS best_pnl,
      MIN(CASE WHEN status='closed' THEN pnl END)                     AS worst_pnl
    FROM trades WHERE strategy_id = ?
  `).get(strategyId)

  const closed = (row.wins ?? 0) + (row.losses ?? 0)
  const win_rate = closed > 0 ? (row.wins / closed) * 100 : 0

  const gross = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN pnl > 0  THEN pnl END), 0)       AS gross_profit,
      ABS(COALESCE(SUM(CASE WHEN pnl <= 0 THEN pnl END), 0))  AS gross_loss
    FROM trades WHERE status='closed' AND strategy_id = ?
  `).get(strategyId)

  const profit_factor = gross.gross_loss > 0 ? gross.gross_profit / gross.gross_loss : null
  const wr = win_rate / 100
  const avg_win  = row.avg_win  ?? 0
  const avg_loss = row.avg_loss ?? 0
  const expectancy = (wr * avg_win) + ((1 - wr) * avg_loss)

  return { ...row, win_rate, profit_factor, expectancy }
}

function getEquity(strategyId) {
  const trades = db.prepare(`
    SELECT date, SUM(pnl) AS day_pnl
    FROM trades
    WHERE strategy_id = ? AND status = 'closed' AND pnl IS NOT NULL
    GROUP BY date ORDER BY date ASC
  `).all(strategyId)
  let cum = 0
  return trades.map(t => { cum += t.day_pnl; return { date: t.date, pnl: t.day_pnl, cumulative: cum } })
}

// ── Setup list with performance ───────────────────────────────────────────────
router.get('/setups', (_req, res) => {
  const setups = db.prepare('SELECT * FROM strategies ORDER BY name').all()
  res.json(setups.map(s => ({ ...fmtSetup(s), stats: getStats(s.id), equity_curve: getEquity(s.id) })))
})

// ── Setup detail ──────────────────────────────────────────────────────────────
router.get('/setups/:id', (req, res) => {
  const setup = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id)
  if (!setup) return res.status(404).json({ error: 'Setup not found' })

  const stats  = getStats(setup.id)
  const equity = getEquity(setup.id)

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byWeekday = db.prepare(`
    SELECT CAST(strftime('%w', date) AS INTEGER) AS wd,
           COUNT(*) AS trades,
           COALESCE(SUM(pnl), 0) AS total_pnl,
           COUNT(CASE WHEN pnl > 0 THEN 1 END) AS wins,
           AVG(pnl) AS avg_pnl
    FROM trades WHERE strategy_id = ? AND status='closed' AND pnl IS NOT NULL
    GROUP BY wd ORDER BY wd
  `).all(setup.id).map(r => ({ ...r, day: DAYS[r.wd] }))

  const byTicker = db.prepare(`
    SELECT ticker,
           COUNT(*) AS trades,
           COALESCE(SUM(pnl), 0) AS total_pnl,
           COUNT(CASE WHEN pnl > 0 THEN 1 END) AS wins,
           AVG(r_multiple) AS avg_r
    FROM trades WHERE strategy_id = ? AND status='closed'
    GROUP BY ticker ORDER BY total_pnl DESC LIMIT 10
  `).all(setup.id)

  const best  = stats.best_pnl  != null ? db.prepare(`SELECT id, ticker, pnl, date FROM trades WHERE strategy_id=? AND pnl=? LIMIT 1`).get(setup.id, stats.best_pnl)  : null
  const worst = stats.worst_pnl != null ? db.prepare(`SELECT id, ticker, pnl, date FROM trades WHERE strategy_id=? AND pnl=? LIMIT 1`).get(setup.id, stats.worst_pnl) : null

  res.json({
    ...fmtSetup(setup),
    stats: { ...stats, best_trade: best, worst_trade: worst },
    equity_curve: equity,
    by_weekday:   byWeekday,
    by_ticker:    byTicker,
  })
})

// ── Trades for a setup ────────────────────────────────────────────────────────
router.get('/setups/:id/trades', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, s.name AS strategy_name
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    WHERE t.strategy_id = ?
    ORDER BY t.date DESC LIMIT 200
  `).all(req.params.id)
  res.json(rows)
})

// ── Compare setups ────────────────────────────────────────────────────────────
router.get('/compare', (req, res) => {
  const ids = (req.query.ids || '').split(',').map(Number).filter(n => n > 0)
  if (!ids.length) return res.json([])
  const result = ids.map(id => {
    const s = db.prepare('SELECT * FROM strategies WHERE id = ?').get(id)
    if (!s) return null
    return { ...fmtSetup(s), stats: getStats(id), equity_curve: getEquity(id) }
  }).filter(Boolean)
  res.json(result)
})

// ── Planned trades ────────────────────────────────────────────────────────────
router.get('/planned', (req, res) => {
  const { status } = req.query
  const where = ['1=1']
  const params = []
  if (status) { where.push('pt.status = ?'); params.push(status) }
  const rows = db.prepare(`
    SELECT pt.*, s.name AS strategy_name
    FROM planned_trades pt
    LEFT JOIN strategies s ON pt.strategy_id = s.id
    WHERE ${where.join(' AND ')}
    ORDER BY pt.created_at DESC
  `).all(...params)
  res.json(rows)
})

router.post('/planned', (req, res) => {
  const { ticker, strategy_id = null, direction = 'long',
          planned_entry = null, stop_loss = null, target_price = null,
          notes = '', confidence = null } = req.body

  const result = db.prepare(`
    INSERT INTO planned_trades (ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence)

  const id = result.lastInsertRowid
  res.status(201).json(db.prepare(`
    SELECT pt.*, s.name AS strategy_name FROM planned_trades pt
    LEFT JOIN strategies s ON pt.strategy_id = s.id WHERE pt.id = ?
  `).get(id))
})

router.put('/planned/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM planned_trades WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Not found' })

  const { ticker, strategy_id = null, direction = 'long',
          planned_entry = null, stop_loss = null, target_price = null,
          notes = '', confidence = null, status = 'active' } = req.body

  db.prepare(`
    UPDATE planned_trades
    SET ticker=?, strategy_id=?, direction=?, planned_entry=?, stop_loss=?,
        target_price=?, notes=?, confidence=?, status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(ticker, strategy_id, direction, planned_entry, stop_loss, target_price,
         notes, confidence, status, req.params.id)

  res.json(db.prepare(`
    SELECT pt.*, s.name AS strategy_name FROM planned_trades pt
    LEFT JOIN strategies s ON pt.strategy_id = s.id WHERE pt.id = ?
  `).get(req.params.id))
})

router.delete('/planned/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM planned_trades WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM planned_trades WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// Convert planned trade → actual trade
router.post('/planned/:id/execute', (req, res) => {
  const pt = db.prepare('SELECT * FROM planned_trades WHERE id = ?').get(req.params.id)
  if (!pt) return res.status(404).json({ error: 'Not found' })

  const { date, entry_price, position_size = 1, fees = 0, timeframe = '', notes = '' } = req.body

  const tradeResult = db.prepare(`
    INSERT INTO trades (date, ticker, direction, entry_price, stop_loss, position_size,
                        fees, strategy_id, timeframe, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    date || new Date().toISOString().split('T')[0],
    pt.ticker, pt.direction,
    entry_price ?? pt.planned_entry ?? 0,
    pt.stop_loss, position_size, fees,
    pt.strategy_id, timeframe, notes || pt.notes || ''
  )

  const tradeId = tradeResult.lastInsertRowid
  db.prepare(`UPDATE planned_trades SET status='executed', trade_id=?, updated_at=datetime('now') WHERE id=?`)
    .run(tradeId, req.params.id)

  res.json({ trade_id: tradeId })
})

// ── Missed trades ─────────────────────────────────────────────────────────────

// summary BEFORE /:id
router.get('/missed/summary', (_req, res) => {
  const total = db.prepare(`SELECT COALESCE(SUM(simulated_pnl), 0) AS total_missed, COUNT(*) AS count FROM missed_trades`).get()

  const bySetup = db.prepare(`
    SELECT COALESCE(s.name, 'Unknown') AS setup_name,
           COUNT(*) AS count, COALESCE(SUM(mt.simulated_pnl), 0) AS total_pnl
    FROM missed_trades mt
    LEFT JOIN strategies s ON mt.strategy_id = s.id
    GROUP BY mt.strategy_id ORDER BY total_pnl DESC
  `).all()

  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', date) AS month,
           COUNT(*) AS count, COALESCE(SUM(simulated_pnl), 0) AS total_pnl
    FROM missed_trades GROUP BY month ORDER BY month ASC
  `).all()

  res.json({ ...total, by_setup: bySetup, by_month: byMonth })
})

router.get('/missed', (_req, res) => {
  const rows = db.prepare(`
    SELECT mt.*, s.name AS strategy_name
    FROM missed_trades mt
    LEFT JOIN strategies s ON mt.strategy_id = s.id
    ORDER BY mt.date DESC
  `).all()
  res.json(rows)
})

router.post('/missed', (req, res) => {
  const { date, ticker, strategy_id = null, direction = 'long',
          entry_would_have_been = null, exit_would_have_been = null,
          position_size = 100, simulated_pnl = null,
          reason_missed = '', notes = '' } = req.body

  const result = db.prepare(`
    INSERT INTO missed_trades (date, ticker, strategy_id, direction,
      entry_would_have_been, exit_would_have_been, position_size, simulated_pnl, reason_missed, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been,
         position_size, simulated_pnl, reason_missed, notes)

  const id = result.lastInsertRowid
  res.status(201).json(db.prepare(`
    SELECT mt.*, s.name AS strategy_name FROM missed_trades mt
    LEFT JOIN strategies s ON mt.strategy_id = s.id WHERE mt.id = ?
  `).get(id))
})

router.put('/missed/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM missed_trades WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Not found' })

  const { date, ticker, strategy_id = null, direction = 'long',
          entry_would_have_been = null, exit_would_have_been = null,
          position_size = 100, simulated_pnl = null,
          reason_missed = '', notes = '' } = req.body

  db.prepare(`
    UPDATE missed_trades SET date=?, ticker=?, strategy_id=?, direction=?,
      entry_would_have_been=?, exit_would_have_been=?, position_size=?,
      simulated_pnl=?, reason_missed=?, notes=?
    WHERE id=?
  `).run(date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been,
         position_size, simulated_pnl, reason_missed, notes, req.params.id)

  res.json(db.prepare(`
    SELECT mt.*, s.name AS strategy_name FROM missed_trades mt
    LEFT JOIN strategies s ON mt.strategy_id = s.id WHERE mt.id = ?
  `).get(req.params.id))
})

router.delete('/missed/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM missed_trades WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM missed_trades WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
