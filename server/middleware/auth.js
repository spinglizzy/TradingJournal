import { createClient } from '@supabase/supabase-js'
import { TOKEN_INVALID } from '../lib/authCodes.js'

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

export async function requireAuth(req, res, next) {
  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: TOKEN_INVALID })
  }

  const token = header.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  // Supabase down / network blip is not a bad token: no TOKEN_INVALID, so the
  // client doesn't burn its refresh and sign the user out over an outage.
  if (error && (!error.status || error.status >= 500)) {
    return res.status(503).json({ error: 'Auth service unavailable, try again' })
  }
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token', code: TOKEN_INVALID })
  }

  // user.id is a UUID string — all DB queries filter by this value
  req.userId = user.id
  next()
}
