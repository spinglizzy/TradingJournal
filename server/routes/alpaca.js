import { Router } from 'express'
import axios from 'axios'
import pool from '../db.js'

const router = Router()

const ALPACA_LIVE  = 'https://api.alpaca.markets'
const ALPACA_PAPER = 'https://paper-api.alpaca.markets'

function base(isPaper) {
  return isPaper ? ALPACA_PAPER : ALPACA_LIVE
}

function alpacaHeaders(key, secret) {
  return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }
}

// POST /api/alpaca/connect — validate credentials and save
router.post('/connect', async (req, res) => {
  const { api_key, api_secret, is_paper = true } = req.body
  if (!api_key || !api_secret) {
    return res.status(400).json({ error: 'api_key and api_secret are required' })
  }

  try {
    await axios.get(`${base(is_paper)}/v2/account`, {
      headers: alpacaHeaders(api_key, api_secret),
    })
  } catch (err) {
    const status = err.response?.status
    if (status === 401 || status === 403) {
      return res.status(401).json({ error: 'Invalid Alpaca API credentials. Check your key and secret.' })
    }
    throw err
  }

  await pool.query(`
    INSERT INTO broker_connections (user_id, broker, api_key, api_secret, is_paper)
    VALUES ($1, 'alpaca', $2, $3, $4)
    ON CONFLICT (user_id, broker)
    DO UPDATE SET api_key = $2, api_secret = $3, is_paper = $4, status = 'active', connected_at = NOW()
  `, [req.userId, api_key, api_secret, is_paper])

  res.json({ connected: true, is_paper })
})

// GET /api/alpaca/status
router.get('/status', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT broker, is_paper, status, last_sync_at, connected_at
     FROM broker_connections WHERE user_id = $1 AND broker = 'alpaca'`,
    [req.userId]
  )
  if (!rows.length) return res.json({ connected: false })
  res.json({ connected: true, ...rows[0] })
})

// POST /api/alpaca/sync — fetch fills and import as open trades
router.post('/sync', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT api_key, api_secret, is_paper
     FROM broker_connections WHERE user_id = $1 AND broker = 'alpaca' AND status = 'active'`,
    [req.userId]
  )
  if (!rows.length) return res.status(400).json({ error: 'No active Alpaca connection found.' })

  const { api_key, api_secret, is_paper } = rows[0]

  const { data: activities } = await axios.get(
    `${base(is_paper)}/v2/account/activities`,
    {
      params: { activity_type: 'FILL', direction: 'desc', page_size: 100 },
      headers: alpacaHeaders(api_key, api_secret),
    }
  )

  let imported = 0
  let skipped  = 0

  for (const act of activities) {
    const ticker      = act.symbol
    const direction   = act.side === 'buy' ? 'long' : 'short'
    const entry_price = parseFloat(act.price)
    const qty         = parseFloat(act.qty)
    const date        = (act.transaction_time || act.date || '').split('T')[0]

    if (!ticker || !date || isNaN(entry_price) || isNaN(qty)) { skipped++; continue }

    const result = await pool.query(
      `INSERT INTO trades (user_id, ticker, direction, entry_price, position_size, date, status, broker, broker_trade_id)
       VALUES ($1,$2,$3,$4,$5,$6,'open','alpaca',$7)
       ON CONFLICT (user_id, broker, broker_trade_id) DO NOTHING`,
      [req.userId, ticker, direction, entry_price, qty, date, act.id]
    )
    if (result.rowCount > 0) imported++
    else skipped++
  }

  await pool.query(
    `UPDATE broker_connections SET last_sync_at = NOW() WHERE user_id = $1 AND broker = 'alpaca'`,
    [req.userId]
  )

  res.json({ imported, skipped })
})

// DELETE /api/alpaca/disconnect
router.delete('/disconnect', async (req, res) => {
  await pool.query(
    `DELETE FROM broker_connections WHERE user_id = $1 AND broker = 'alpaca'`,
    [req.userId]
  )
  res.json({ disconnected: true })
})

export default router
