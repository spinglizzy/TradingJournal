import { Router } from 'express'
import pool from '../db.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM tags ORDER BY name')
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, color='#6366f1' } = req.body
    const result = await pool.query('INSERT INTO tags (name,color) VALUES ($1,$2) RETURNING id', [name, color])
    const row = await pool.query('SELECT * FROM tags WHERE id=$1', [result.rows[0].id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tags WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
