import { Router } from 'express'
import db from '../db.js'

const router = Router()

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { start_date, end_date, entry_type, tag, search } = req.query
  const where = ['1=1']
  const params = []

  if (start_date) { where.push('date >= ?'); params.push(start_date) }
  if (end_date)   { where.push('date <= ?'); params.push(end_date) }
  if (entry_type) { where.push('entry_type = ?'); params.push(entry_type) }
  if (tag)        { where.push('tags LIKE ?'); params.push(`%"${tag}"%`) }
  if (search)     {
    where.push('(title LIKE ? OR content LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  const entries = db.prepare(`
    SELECT id, date, entry_type, title, mood, tags,
           substr(content, 1, 400) AS preview,
           created_at, updated_at
    FROM journal_entries
    WHERE ${where.join(' AND ')}
    ORDER BY date DESC, created_at DESC
  `).all(...params)

  res.json(entries.map(e => ({ ...e, tags: safeJson(e.tags) })))
})

// ── Calendar data ─────────────────────────────────────────────────────────────
// MUST be before /:id to avoid matching 'calendar' as an id
router.get('/calendar', (req, res) => {
  const { start_date, end_date } = req.query
  const where = ['1=1']
  const params = []
  if (start_date) { where.push('date >= ?'); params.push(start_date) }
  if (end_date)   { where.push('date <= ?'); params.push(end_date) }

  const rows = db.prepare(`
    SELECT date, entry_type, COUNT(*) AS cnt
    FROM journal_entries
    WHERE ${where.join(' AND ')}
    GROUP BY date, entry_type
    ORDER BY date ASC
  `).all(...params)

  // Aggregate by date → { date, types: [] }
  const byDate = {}
  for (const row of rows) {
    if (!byDate[row.date]) byDate[row.date] = { date: row.date, types: [] }
    byDate[row.date].types.push(row.entry_type)
  }

  res.json(Object.values(byDate))
})

// ── Weekly review auto-stats ──────────────────────────────────────────────────
router.get('/weekly-stats', (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_trades,
      COALESCE(SUM(CASE WHEN status='closed' THEN pnl END), 0) AS total_pnl,
      COUNT(CASE WHEN pnl > 0  AND status='closed' THEN 1 END) AS wins,
      COUNT(CASE WHEN pnl <= 0 AND status='closed' THEN 1 END) AS losses,
      MAX(CASE WHEN status='closed' THEN pnl END) AS best_pnl,
      MIN(CASE WHEN status='closed' THEN pnl END) AS worst_pnl
    FROM trades WHERE date >= ? AND date <= ?
  `).get(from, to)

  const closed = stats.wins + stats.losses
  const win_rate = closed > 0 ? (stats.wins / closed) * 100 : 0

  const best  = stats.best_pnl  != null
    ? db.prepare(`SELECT id, ticker, pnl, date FROM trades WHERE status='closed' AND pnl=? AND date>=? AND date<=? LIMIT 1`).get(stats.best_pnl,  from, to)
    : null
  const worst = stats.worst_pnl != null
    ? db.prepare(`SELECT id, ticker, pnl, date FROM trades WHERE status='closed' AND pnl=? AND date>=? AND date<=? LIMIT 1`).get(stats.worst_pnl, from, to)
    : null

  const setupRow = db.prepare(`
    SELECT setup, COUNT(*) AS cnt FROM trades
    WHERE setup IS NOT NULL AND date >= ? AND date <= ?
    GROUP BY setup ORDER BY cnt DESC LIMIT 1
  `).get(from, to)

  const grossRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN pnl > 0  THEN pnl END), 0)       AS gross_profit,
      ABS(COALESCE(SUM(CASE WHEN pnl <= 0 THEN pnl END), 0))  AS gross_loss
    FROM trades WHERE status='closed' AND date >= ? AND date <= ?
  `).get(from, to)

  const profit_factor = grossRow.gross_loss > 0 ? grossRow.gross_profit / grossRow.gross_loss : null

  res.json({
    ...stats,
    win_rate,
    profit_factor,
    best_trade:  best,
    worst_trade: worst,
    top_setup:   setupRow?.setup ?? null,
  })
})

// ── All tags used across entries ──────────────────────────────────────────────
router.get('/tags', (req, res) => {
  const rows = db.prepare(`SELECT tags FROM journal_entries WHERE tags != '[]'`).all()
  const tagSet = new Set()
  for (const r of rows) {
    safeJson(r.tags).forEach(t => tagSet.add(t))
  }
  res.json([...tagSet].sort())
})

// ── Single entry ──────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })

  const linkedTrades = db.prepare(`
    SELECT t.id, t.date, t.ticker, t.direction, t.pnl, t.status, t.entry_price, t.exit_price
    FROM journal_trade_links jl
    JOIN trades t ON jl.trade_id = t.id
    WHERE jl.journal_id = ?
  `).all(req.params.id)

  res.json({ ...entry, tags: safeJson(entry.tags), linked_trades: linkedTrades })
})

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { date, entry_type = 'daily', title = '', content = '', mood = null, tags = [], trade_ids = [] } = req.body

  const result = db.prepare(`
    INSERT INTO journal_entries (date, entry_type, title, content, mood, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(date, entry_type, title, content, mood, JSON.stringify(tags))

  const id = result.lastInsertRowid
  syncLinks(id, trade_ids)

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id)
  res.status(201).json({ ...entry, tags: safeJson(entry.tags) })
})

// ── Update ────────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM journal_entries WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Entry not found' })

  const { date, entry_type = 'daily', title = '', content = '', mood = null, tags = [], trade_ids = [] } = req.body
  db.prepare(`
    UPDATE journal_entries
    SET date=?, entry_type=?, title=?, content=?, mood=?, tags=?, updated_at=datetime('now')
    WHERE id=?
  `).run(date, entry_type, title, content, mood, JSON.stringify(tags), req.params.id)

  syncLinks(req.params.id, trade_ids)

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id)
  res.json({ ...entry, tags: safeJson(entry.tags) })
})

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM journal_entries WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Entry not found' })
  db.prepare('DELETE FROM journal_entries WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function syncLinks(journalId, tradeIds) {
  db.prepare('DELETE FROM journal_trade_links WHERE journal_id = ?').run(journalId)
  for (const tid of tradeIds) {
    db.prepare('INSERT OR IGNORE INTO journal_trade_links (journal_id, trade_id) VALUES (?, ?)').run(journalId, tid)
  }
}

function safeJson(v) {
  try { return JSON.parse(v || '[]') } catch { return [] }
}

export default router
