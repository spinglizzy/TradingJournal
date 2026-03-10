import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM strategies ORDER BY name').all())
})

router.post('/', (req, res) => {
  const { name, description } = req.body
  const result = db.prepare('INSERT INTO strategies (name, description) VALUES (?, ?)').run(name, description)
  res.status(201).json(db.prepare('SELECT * FROM strategies WHERE id = ?').get(result.lastInsertRowid))
})

router.put('/:id', (req, res) => {
  const { name, description } = req.body
  db.prepare('UPDATE strategies SET name = ?, description = ? WHERE id = ?').run(name, description, req.params.id)
  res.json(db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id))
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM strategies WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
