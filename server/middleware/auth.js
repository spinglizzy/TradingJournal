import { createClient } from '@supabase/supabase-js'

const supabaseUrl        = process.env.VITE_SUPABASE_URL
const serviceRoleKey     = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
}

// Admin client — uses service role key, bypasses RLS
// Used only on the server to verify incoming user tokens
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * Verifying a token means asking Supabase over the network, which lands in front
 * of every query. A single UI action fans out into several API calls (the wheel
 * tab refetches four endpoints after each mutation), so the same token gets
 * re-verified several times a second and the round trips dominate the response.
 *
 * Cache the verified result briefly. The window is deliberately short: a token
 * that Supabase later rejects still passes here until its entry ages out, so the
 * TTL is the lag between revoking access and this process noticing.
 */
const TOKEN_TTL_MS  = 60_000
const MAX_CACHED    = 1000
const verifiedTokens = new Map() // token -> { userId, checkedAt }

/** The `exp` claim, in ms, or null if the token is unreadable. */
function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = header.slice(7)
  const now   = Date.now()

  // An expired token cannot become valid — reject it without asking Supabase.
  const exp = tokenExpiry(token)
  if (exp != null && exp <= now) {
    verifiedTokens.delete(token)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const hit = verifiedTokens.get(token)
  if (hit && now - hit.checkedAt < TOKEN_TTL_MS) {
    req.userId = hit.userId
    return next()
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    verifiedTokens.delete(token)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Unbounded growth would be a slow leak on a long-lived server. Nothing here
  // is worth evicting precisely — drop everything and let it refill.
  if (verifiedTokens.size >= MAX_CACHED) verifiedTokens.clear()
  verifiedTokens.set(token, { userId: user.id, checkedAt: now })

  // user.id is a UUID string — all DB queries filter by this value
  req.userId = user.id
  next()
}
