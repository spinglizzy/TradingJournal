import { Router } from 'express'
import axios from 'axios'
import pool from '../db.js'
import { ensureFreshToken } from '../lib/tokenRefresh.js'
import { insertNormalizedTrades } from '../lib/normalizeTrade.js'

const router = Router()

const BASE = 'https://api.tradestation.com'

function tsHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` }
}

// GET /api/tradestation/status
router.get('/status', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT broker, is_paper, status, last_sync_at, connected_at
     FROM broker_connections WHERE user_id = $1 AND broker = 'tradestation'`,
    [req.userId]
  )
  if (!rows.length) return res.json({ connected: false })
  res.json({ connected: true, ...rows[0] })
})

// POST /api/tradestation/sync
router.post('/sync', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, access_token, refresh_token, token_expiry, account_id, is_paper
     FROM broker_connections
     WHERE user_id = $1 AND broker = 'tradestation' AND status = 'active'`,
    [req.userId]
  )
  if (!rows.length) return res.status(400).json({ error: 'No active TradeStation connection found.' })

  let conn = await ensureFreshToken({ ...rows[0], broker: 'tradestation' })

  // If account_id is missing, fetch it now
  if (!conn.account_id) {
    const { data } = await axios.get(
      `${BASE}/v3/brokerage/accounts`,
      { headers: tsHeaders(conn.access_token) }
    )
    const accountId = data?.Accounts?.[0]?.AccountID
    if (!accountId) return res.status(400).json({ error: 'Could not determine TradeStation account. Please reconnect.' })
    await pool.query(`UPDATE broker_connections SET account_id = $1 WHERE id = $2`, [accountId, conn.id])
    conn = { ...conn, account_id: accountId }
  }

  // Fetch filled orders — OSO = filled status code in TS API
  // We page through all results using NextToken if present
  let allOrders = []
  let nextToken = null

  do {
    const params = { Status: 'FLL' }
    if (nextToken) params.NextToken = nextToken

    const { data } = await axios.get(
      `${BASE}/v3/brokerage/accounts/${conn.account_id}/orders`,
      { headers: tsHeaders(conn.access_token), params }
    )

    const orders = data?.Orders ?? []
    allOrders = allOrders.concat(orders)
    nextToken = data?.NextToken || null
  } while (nextToken)

  const trades = allOrders
    .filter(o => o.FilledQuantity > 0 && o.Symbol)
    .map(o => ({
      ticker:          o.Symbol,
      direction:       normalizeSide(o.BuyOrSell),
      entry_price:     parseFloat(o.FilledPrice || o.LimitPrice || 0),
      position_size:   parseFloat(o.FilledQuantity),
      date:            (o.ClosedDateTime || o.OpenedDateTime || '').split('T')[0],
      broker:          'tradestation',
      broker_trade_id: String(o.OrderID),
    }))

  const { imported, skipped } = await insertNormalizedTrades(pool, req.userId, trades)

  await pool.query(
    `UPDATE broker_connections SET last_sync_at = NOW() WHERE id = $1`,
    [conn.id]
  )

  res.json({ imported, skipped })
})

// DELETE /api/tradestation/disconnect
router.delete('/disconnect', async (req, res) => {
  await pool.query(
    `DELETE FROM broker_connections WHERE user_id = $1 AND broker = 'tradestation'`,
    [req.userId]
  )
  res.json({ disconnected: true })
})

function normalizeSide(side) {
  if (!side) return 'long'
  const s = side.toLowerCase()
  return s === 'sell' || s === 'sellshort' ? 'short' : 'long'
}

export default router
