import { Router } from 'express'
import axios from 'axios'
import { requireAuth } from '../middleware/auth.js'
import { createOAuthState, consumeOAuthState } from '../lib/oauthState.js'
import pool from '../db.js'

const router = Router()

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001'

function callbackUrl(broker) {
  return `${APP_BASE_URL}/api/oauth/callback/${broker}`
}

// ── Per-broker OAuth 2.0 config ───────────────────────────────────────────────

const BROKER_CONFIG = {
  tradier: {
    authorizeUrl: 'https://api.tradier.com/v1/oauth/authorize',
    tokenUrl:     'https://api.tradier.com/v1/oauth/accesstoken',
    clientId:     () => process.env.TRADIER_CLIENT_ID,
    clientSecret: () => process.env.TRADIER_CLIENT_SECRET,
    scope:        'read,write,market,trade',
  },
  schwab: {
    authorizeUrl: 'https://api.schwabapi.com/v1/oauth/authorize',
    tokenUrl:     'https://api.schwabapi.com/v1/oauth/token',
    clientId:     () => process.env.SCHWAB_CLIENT_ID,
    clientSecret: () => process.env.SCHWAB_CLIENT_SECRET,
    scope:        'readonly',
  },
  tradestation: {
    authorizeUrl: 'https://signin.tradestation.com/authorize',
    tokenUrl:     'https://signin.tradestation.com/oauth/token',
    clientId:     () => process.env.TRADESTATION_CLIENT_ID,
    clientSecret: () => process.env.TRADESTATION_CLIENT_SECRET,
    scope:        'openid profile offline_access MarketData ReadAccount Trade',
  },
}

// ── GET /api/oauth/authorize/:broker ─────────────────────────────────────────
// User-initiated — requireAuth applied directly here (not app-level, since
// the callback route below must be public)
router.get('/authorize/:broker', requireAuth, async (req, res) => {
  const { broker } = req.params
  const config = BROKER_CONFIG[broker]
  if (!config) return res.status(400).json({ error: `Unknown broker: ${broker}` })

  const clientId = config.clientId()
  if (!clientId) return res.status(500).json({ error: `${broker} is not configured on this server.` })

  const state = await createOAuthState(req.userId, broker)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  callbackUrl(broker),
    scope:         config.scope,
    state,
  })

  res.json({ url: `${config.authorizeUrl}?${params}` })
})

// ── GET /api/oauth/callback/:broker ──────────────────────────────────────────
// Called by the broker — NO auth middleware (broker's server is the caller)
router.get('/callback/:broker', async (req, res) => {
  const { broker } = req.params
  const { code, state, error: oauthError } = req.query

  const frontendBase = (process.env.ALLOWED_ORIGIN || 'http://localhost:5173').split(',')[0].trim()

  if (oauthError) {
    return res.redirect(`${frontendBase}/settings?tab=Brokers&error=${encodeURIComponent(oauthError)}`)
  }

  if (!code || !state) {
    return res.redirect(`${frontendBase}/settings?tab=Brokers&error=missing_params`)
  }

  let userId, meta
  try {
    ;({ userId, meta } = await consumeOAuthState(state))
  } catch (err) {
    return res.redirect(`${frontendBase}/settings?tab=Brokers&error=${encodeURIComponent(err.message)}`)
  }

  const config = BROKER_CONFIG[broker]
  if (!config) {
    return res.redirect(`${frontendBase}/settings?tab=Brokers&error=unknown_broker`)
  }

  try {
    const tokenData = await exchangeCode(broker, config, code)

    // Some brokers need an extra call to get the account ID
    const accountId = await fetchAccountId(broker, tokenData.access_token)

    await pool.query(
      `INSERT INTO broker_connections
         (user_id, broker, access_token, refresh_token, token_expiry, account_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active')
       ON CONFLICT (user_id, broker)
       DO UPDATE SET
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expiry  = EXCLUDED.token_expiry,
         account_id    = EXCLUDED.account_id,
         status        = 'active',
         connected_at  = NOW()`,
      [userId, broker, tokenData.access_token, tokenData.refresh_token, tokenData.token_expiry, accountId]
    )

    res.redirect(`${frontendBase}/settings?tab=Brokers&connected=${broker}`)
  } catch (err) {
    console.error(`OAuth callback error for ${broker}:`, err.message)
    res.redirect(`${frontendBase}/settings?tab=Brokers&error=${encodeURIComponent('Connection failed. Please try again.')}`)
  }
})

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeCode(broker, config, code) {
  const clientId     = config.clientId()
  const clientSecret = config.clientSecret()
  const redirect     = callbackUrl(broker)

  // Schwab uses Basic auth header; TradeStation and Tradier use body params
  const useBasicAuth = broker === 'schwab'

  const params = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: redirect,
    ...(!useBasicAuth && { client_id: clientId, client_secret: clientSecret }),
  })

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (useBasicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }

  const { data } = await axios.post(config.tokenUrl, params, { headers })

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || null,
    token_expiry:  data.expires_in
      ? new Date(Date.now() + (data.expires_in - 60) * 1000)
      : null,
  }
}

// ── Account ID fetch (broker-specific post-auth step) ────────────────────────

async function fetchAccountId(broker, accessToken) {
  try {
    if (broker === 'schwab') {
      const { data } = await axios.get('https://api.schwabapi.com/trader/v1/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      // Returns an array; take the first account's hashValue
      return data?.[0]?.hashValue || null
    }

    if (broker === 'tradestation') {
      const { data } = await axios.get('https://api.tradestation.com/v3/brokerage/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      return data?.Accounts?.[0]?.AccountID || null
    }

    if (broker === 'tradier') {
      const { data } = await axios.get('https://api.tradier.com/v1/user/profile', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
      return data?.profile?.account?.account_number || null
    }
  } catch {
    // Non-fatal — sync will handle missing account_id gracefully
    return null
  }

  return null
}

export default router
