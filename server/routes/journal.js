import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  const { start_date, end_date } = req.query
  let where = ['1=1']
  const params = []
  if (start_date) { where.push('date >= ?'); params.push(start_date) }
  if (end_date)   { where.push('date <= ?'); params.push(end_date) }

  const entries = db.prepare(
    `SELECT * FROM journal_entries WHERE ${where.join(' AND ')} ORDER BY date DESC`
  ).all(...params)
  res.json(entries)
})

router.get('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })

  const linkedTrades = db.prepare(`
    SELECT t.id, t.date, t.ticker, t.direction, t.pnl, t.status
    FROM journal_trade_links jl
    JOIN trades t ON jl.trade_id = t.id
    WHERE jl.journal_id = ?
  `).all(req.params.id)

  res.json({ ...entry, linked_trades: linkedTrades })
})

router.post('/', (req, res) => {
  const { date, title, content, mood, trade_ids = [] } = req.body
  const result = db.prepare(`
    INSERT INTO journal_entries (date, title, content, mood)
    VALUES (?, ?, ?, ?)
  `).run(date, title, content, mood)

  const id = result.lastInsertRowid
  syncLinks(id, trade_ids)

  res.status(201).json(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id))
})

router.put('/:id', (req, res) => {
  const entry = db.prepare('SELECT id FROM journal_entries WHERE id = ?').get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })

  const { date, title, content, mood, trade_ids = [] } = req.body
  db.prepare(`
    UPDATE journal_entries SET date = ?, title = ?, content = ?, mood = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(date, title, content, mood, req.params.id)

  syncLinks(req.params.id, trade_ids)
  res.json(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id))
})

router.delete('/:id', (req, res) => {
  const entry = db.prepare('SELECT id FROM journal_entries WHERE id = ?').get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })
  db.prepare('DELETE FROM journal_entries WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

function syncLinks(journalId, tradeIds) {
  db.prepare('DELETE FROM journal_trade_links WHERE journal_id = ?').run(journalId)
  for (const tid of tradeIds) {
    db.prepare('INSERT OR IGNORE INTO journal_trade_links (journal_id, trade_id) VALUES (?, ?)').run(journalId, tid)
  }
}

export default router
