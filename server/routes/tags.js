import { Router } from 'express'
import pool from '../db.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM tags WHERE user_id=$1 ORDER BY name', [req.userId])
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, color='#6366f1' } = req.body
    const result = await pool.query('INSERT INTO tags (name,color,user_id) VALUES ($1,$2,$3) RETURNING id', [name, color, req.userId])
    const row = await pool.query('SELECT * FROM tags WHERE id=$1 AND user_id=$2', [result.rows[0].id, req.userId])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tags WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
