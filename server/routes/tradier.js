import { Router } from 'express'
import axios from 'axios'
import pool from '../db.js'
import { insertNormalizedTrades } from '../lib/normalizeTrade.js'

const router = Router()

const LIVE_BASE    = 'https://api.tradier.com/v1'
const SANDBOX_BASE = 'https://sandbox.tradier.com/v1'

function tradierBase(isPaper) {
  return isPaper ? SANDBOX_BASE : LIVE_BASE
}

function tradierHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }
}

// GET /api/tradier/status
router.get('/status', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT broker, is_paper, status, last_sync_at, connected_at
     FROM broker_connections WHERE user_id = $1 AND broker = 'tradier'`,
    [req.userId]
  )
  if (!rows.length) return res.json({ connected: false })
  res.json({ connected: true, ...rows[0] })
})

// POST /api/tradier/sync
router.post('/sync', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, access_token, account_id, is_paper
     FROM broker_connections
     WHERE user_id = $1 AND broker = 'tradier' AND status = 'active'`,
    [req.userId]
  )
  if (!rows.length) return res.status(400).json({ error: 'No active Tradier connection found.' })

  const conn = rows[0]
  const base = tradierBase(conn.is_paper)
  const headers = tradierHeaders(conn.access_token)

  // If we don't have an account_id yet, fetch it now
  let accountId = conn.account_id
  if (!accountId) {
    const { data: profile } = await axios.get(`${base}/user/profile`, { headers })
    accountId = profile?.profile?.account?.account_number
      || profile?.profile?.accounts?.account?.[0]?.account_number
      || null
    if (accountId) {
      await pool.query(
        `UPDATE broker_connections SET account_id = $1 WHERE id = $2`,
        [accountId, conn.id]
      )
    }
  }

  if (!accountId) {
    return res.status(400).json({ error: 'Could not determine Tradier account number. Please reconnect.' })
  }

  const { data } = await axios.get(
    `${base}/accounts/${accountId}/orders`,
    { params: { includeTags: 'false' }, headers }
  )

  const orders = data?.orders?.order
  if (!orders) return res.json({ imported: 0, skipped: 0 })

  const rawOrders = Array.isArray(orders) ? orders : [orders]

  const trades = rawOrders
    .filter(o => o.status === 'filled')
    .map(o => ({
      ticker:          o.symbol,
      direction:       normalizeSide(o.side),
      entry_price:     parseFloat(o.avg_fill_price),
      position_size:   parseFloat(o.quantity),
      date:            (o.transaction_date || o.create_date || '').split('T')[0],
      broker:          'tradier',
      broker_trade_id: String(o.id),
    }))

  const { imported, skipped } = await insertNormalizedTrades(pool, req.userId, trades)

  await pool.query(
    `UPDATE broker_connections SET last_sync_at = NOW() WHERE id = $1`,
    [conn.id]
  )

  res.json({ imported, skipped })
})

// DELETE /api/tradier/disconnect
router.delete('/disconnect', async (req, res) => {
  await pool.query(
    `DELETE FROM broker_connections WHERE user_id = $1 AND broker = 'tradier'`,
    [req.userId]
  )
  res.json({ disconnected: true })
})

function normalizeSide(side) {
  // Tradier sides: 'buy', 'buy_to_cover', 'sell', 'sell_short'
  if (!side) return 'long'
  return side.startsWith('sell') ? 'short' : 'long'
}

export default router
