import { Router } from 'express'
import db from '../db.js'

const router = Router()

function parseJ(v, dflt) {
  try { return JSON.parse(v) ?? dflt } catch { return dflt }
}

function fmt(s) {
  return { ...s, checklist: parseJ(s.checklist, []), default_fields: parseJ(s.default_fields, {}) }
}

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM strategies ORDER BY name').all().map(fmt))
})

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(fmt(row))
})

router.post('/', (req, res) => {
  const {
    name, description = '',
    rich_description = '', entry_rules = '', exit_rules = '', market_conditions = '',
    timeframe = '', checklist = [], default_fields = {}, screenshot_path = null,
  } = req.body

  const result = db.prepare(`
    INSERT INTO strategies
      (name, description, rich_description, entry_rules, exit_rules, market_conditions,
       timeframe, checklist, default_fields, screenshot_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, description, rich_description, entry_rules, exit_rules, market_conditions,
         timeframe, JSON.stringify(checklist), JSON.stringify(default_fields), screenshot_path)

  res.status(201).json(fmt(db.prepare('SELECT * FROM strategies WHERE id = ?').get(result.lastInsertRowid)))
})

router.put('/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM strategies WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Not found' })

  const {
    name, description = '',
    rich_description = '', entry_rules = '', exit_rules = '', market_conditions = '',
    timeframe = '', checklist = [], default_fields = {}, screenshot_path,
  } = req.body

  db.prepare(`
    UPDATE strategies
    SET name=?, description=?, rich_description=?, entry_rules=?, exit_rules=?,
        market_conditions=?, timeframe=?, checklist=?, default_fields=?, screenshot_path=?
    WHERE id=?
  `).run(name, description, rich_description, entry_rules, exit_rules, market_conditions,
         timeframe, JSON.stringify(checklist), JSON.stringify(default_fields),
         screenshot_path ?? null, req.params.id)

  res.json(fmt(db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id)))
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM strategies WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
