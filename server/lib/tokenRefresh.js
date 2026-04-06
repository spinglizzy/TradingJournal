import axios from 'axios'
import pool from '../db.js'

const BUFFER_MS = 5 * 60 * 1000 // refresh 5 minutes before expiry

/**
 * Checks if a broker connection's access token is still valid.
 * If it's expired (or close to expiring), refreshes it and updates the DB.
 * Returns the (possibly updated) connection row.
 *
 * Brokers with no token_expiry (Tradier, E*TRADE) are returned as-is.
 *
 * @param {object} connection - row from broker_connections
 * @returns {Promise<object>} - updated connection object
 */
export async function ensureFreshToken(connection) {
  if (!connection.token_expiry) return connection

  const expiresAt = new Date(connection.token_expiry).getTime()
  if (Date.now() < expiresAt - BUFFER_MS) return connection

  // Token is expired or nearly expired — refresh it
  const refreshers = {
    schwab:       refreshSchwab,
    tradestation: refreshTradeStation,
    tradovate:    refreshTradovate,
  }

  const refreshFn = refreshers[connection.broker]
  if (!refreshFn) throw new Error(`No token refresh handler for broker: ${connection.broker}`)

  const updated = await refreshFn(connection)

  await pool.query(
    `UPDATE broker_connections
     SET access_token = $1, refresh_token = $2, token_expiry = $3
     WHERE id = $4`,
    [updated.access_token, updated.refresh_token, updated.token_expiry, connection.id]
  )

  return { ...connection, ...updated }
}

async function refreshSchwab(conn) {
  const creds = Buffer.from(`${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`).toString('base64')
  const { data } = await axios.post(
    'https://api.schwabapi.com/v1/oauth/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || conn.refresh_token,
    token_expiry:  new Date(Date.now() + (data.expires_in - 60) * 1000),
  }
}

async function refreshTradeStation(conn) {
  const { data } = await axios.post(
    'https://signin.tradestation.com/oauth/token',
    new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     process.env.TRADESTATION_CLIENT_ID,
      client_secret: process.env.TRADESTATION_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || conn.refresh_token,
    token_expiry:  new Date(Date.now() + (data.expires_in - 60) * 1000),
  }
}

async function refreshTradovate(conn) {
  const base = conn.is_paper
    ? 'https://demo.tradovateapi.com/v1'
    : 'https://live.tradovateapi.com/v1'

  const { data } = await axios.post(
    `${base}/auth/renewaccesstoken`,
    {},
    { headers: { Authorization: `Bearer ${conn.access_token}` } }
  )
  return {
    access_token:  data.accessToken,
    refresh_token: data.mdAccessToken || conn.refresh_token,
    token_expiry:  data.expirationTime ? new Date(data.expirationTime) : new Date(Date.now() + 60 * 60 * 1000),
  }
}
