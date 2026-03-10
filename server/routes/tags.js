import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM tags ORDER BY name').all())
})

router.post('/', (req, res) => {
  const { name, color = '#6366f1' } = req.body
  const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
  res.status(201).json(db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid))
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
