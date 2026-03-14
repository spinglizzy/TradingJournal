import { Router } from 'express'
import pool from '../db.js'

const router = Router()

function parseJ(v, dflt) {
  try { return JSON.parse(v) ?? dflt } catch { return dflt }
}
function fmt(s) {
  return { ...s, checklist: parseJ(s.checklist, []), default_fields: parseJ(s.default_fields, {}) }
}

router.get('/', async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM strategies ORDER BY name')
    res.json(r.rows.map(fmt))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM strategies WHERE id=$1', [req.params.id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(fmt(r.rows[0]))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const {
      name, description='',
      rich_description='', entry_rules='', exit_rules='', market_conditions='',
      timeframe='', checklist=[], default_fields={}, screenshot_path=null,
    } = req.body

    const result = await pool.query(`
      INSERT INTO strategies (name,description,rich_description,entry_rules,exit_rules,market_conditions,timeframe,checklist,default_fields,screenshot_path)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [name, description, rich_description, entry_rules, exit_rules, market_conditions,
        timeframe, JSON.stringify(checklist), JSON.stringify(default_fields), screenshot_path])

    const row = await pool.query('SELECT * FROM strategies WHERE id=$1', [result.rows[0].id])
    res.status(201).json(fmt(row.rows[0]))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM strategies WHERE id=$1', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' })

    const {
      name, description='',
      rich_description='', entry_rules='', exit_rules='', market_conditions='',
      timeframe='', checklist=[], default_fields={}, screenshot_path,
    } = req.body

    await pool.query(`
      UPDATE strategies SET name=$1,description=$2,rich_description=$3,entry_rules=$4,
        exit_rules=$5,market_conditions=$6,timeframe=$7,checklist=$8,default_fields=$9,screenshot_path=$10
      WHERE id=$11
    `, [name, description, rich_description, entry_rules, exit_rules, market_conditions,
        timeframe, JSON.stringify(checklist), JSON.stringify(default_fields),
        screenshot_path ?? null, req.params.id])

    const row = await pool.query('SELECT * FROM strategies WHERE id=$1', [req.params.id])
    res.json(fmt(row.rows[0]))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strategies WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
