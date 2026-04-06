import { Router } from 'express'
import axios from 'axios'
import pool from '../db.js'
import { ensureFreshToken } from '../lib/tokenRefresh.js'
import { insertNormalizedTrades } from '../lib/normalizeTrade.js'

const router = Router()

const BASE = 'https://api.schwabapi.com'

function schwabHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` }
}

// GET /api/schwab/status
router.get('/status', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT broker, is_paper, status, last_sync_at, connected_at
     FROM broker_connections WHERE user_id = $1 AND broker = 'schwab'`,
    [req.userId]
  )
  if (!rows.length) return res.json({ connected: false })
  res.json({ connected: true, ...rows[0] })
})

// POST /api/schwab/sync
router.post('/sync', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, access_token, refresh_token, token_expiry, account_id, is_paper
     FROM broker_connections
     WHERE user_id = $1 AND broker = 'schwab' AND status = 'active'`,
    [req.userId]
  )
  if (!rows.length) return res.status(400).json({ error: 'No active Schwab connection found.' })

  let conn = await ensureFreshToken({ ...rows[0], broker: 'schwab' })

  // If account_id is missing (edge case), fetch it now
  if (!conn.account_id) {
    const { data: accounts } = await axios.get(
      `${BASE}/trader/v1/accounts`,
      { headers: schwabHeaders(conn.access_token) }
    )
    const hashValue = accounts?.[0]?.hashValue
    if (!hashValue) return res.status(400).json({ error: 'Could not determine Schwab account. Please reconnect.' })
    await pool.query(`UPDATE broker_connections SET account_id = $1 WHERE id = $2`, [hashValue, conn.id])
    conn = { ...conn, account_id: hashValue }
  }

  // Fetch transactions — default to last 90 days, or from last sync
  const endDate   = new Date()
  const startDate = conn.last_sync_at
    ? new Date(conn.last_sync_at)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const { data: txns } = await axios.get(
    `${BASE}/trader/v1/accounts/${conn.account_id}/transactions`,
    {
      headers: schwabHeaders(conn.access_token),
      params: {
        types:     'TRADE',
        startDate: startDate.toISOString().split('T')[0],
        endDate:   endDate.toISOString().split('T')[0],
      },
    }
  )

  const rawTxns = Array.isArray(txns) ? txns : []

  const trades = rawTxns
    .filter(t => t.type === 'TRADE' && t.transactionItem?.instrument?.symbol)
    .map(t => ({
      ticker:          t.transactionItem.instrument.symbol,
      direction:       normalizeSide(t.transactionItem.instruction),
      entry_price:     parseFloat(t.transactionItem.price),
      position_size:   Math.abs(parseFloat(t.transactionItem.amount)),
      date:            (t.transactionDate || '').split('T')[0],
      broker:          'schwab',
      broker_trade_id: String(t.transactionId),
    }))

  const { imported, skipped } = await insertNormalizedTrades(pool, req.userId, trades)

  await pool.query(
    `UPDATE broker_connections SET last_sync_at = NOW() WHERE id = $1`,
    [conn.id]
  )

  res.json({ imported, skipped })
})

// DELETE /api/schwab/disconnect
router.delete('/disconnect', async (req, res) => {
  await pool.query(
    `DELETE FROM broker_connections WHERE user_id = $1 AND broker = 'schwab'`,
    [req.userId]
  )
  res.json({ disconnected: true })
})

function normalizeSide(instruction) {
  if (!instruction) return 'long'
  const s = instruction.toUpperCase()
  return s === 'SELL' || s === 'SELL_SHORT' ? 'short' : 'long'
}

export default router
