import { Router } from 'express'
import pool from '../db.js'

const router = Router()

const ALL_BROKERS = ['alpaca', 'tradier', 'schwab', 'tradestation', 'etrade', 'tradovate']

// GET /api/brokers/all — returns connection status for every broker in one call
router.get('/all', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT broker, is_paper, status, last_sync_at, connected_at
     FROM broker_connections WHERE user_id = $1`,
    [req.userId]
  )

  const result = {}
  for (const b of ALL_BROKERS) {
    const row = rows.find(r => r.broker === b)
    result[b] = row ? { connected: true, ...row } : { connected: false }
  }

  res.json(result)
})

export default router
