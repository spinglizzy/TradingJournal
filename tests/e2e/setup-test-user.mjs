/**
 * One-time setup script: creates (or verifies) the E2E test user in Supabase.
 *
 * Run once before your first test run:
 *   node tests/e2e/setup-test-user.mjs
 *
 * Requires in your .env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← needs admin rights to create users
 *
 * Optional overrides via env:
 *   E2E_EMAIL     (default: test@pulsejournal.com)
 *   E2E_PASSWORD  (default: testpassword123)
 *   E2E_NAME      (default: E2E Tester)
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ── Load .env manually (no dotenv dependency required) ────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env not found — rely on environment variables already set
  }
}

loadEnv()

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL             = process.env.E2E_EMAIL    || 'test@pulsejournal.com'
const PASSWORD          = process.env.E2E_PASSWORD || 'testpassword123'
const NAME              = process.env.E2E_NAME     || 'E2E Tester'

// ── Validate env ──────────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\n❌  Missing required environment variables.')
  console.error('    Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧  Setting up E2E test user: ${EMAIL}`)

  // Check if the user already exists
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('❌  Failed to list users:', listError.message)
    process.exit(1)
  }

  const existing = users.find(u => u.email === EMAIL)

  if (existing) {
    // User exists — update password to ensure it matches and confirm email
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    })
    if (updateError) {
      console.error('❌  Failed to update existing user:', updateError.message)
      process.exit(1)
    }
    console.log(`✅  Test user already exists — password synced, email confirmed.`)
    console.log(`    User ID: ${existing.id}`)
  } else {
    // Create new user via admin API (bypasses email confirmation)
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    })
    if (createError) {
      console.error('❌  Failed to create test user:', createError.message)
      process.exit(1)
    }
    console.log(`✅  Test user created successfully.`)
    console.log(`    User ID: ${data.user.id}`)
  }

  // Verify we can actually sign in with these credentials
  const anonClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || '')
  const { error: signInError } = await anonClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (signInError) {
    console.warn(`\n⚠️   Created user but sign-in test failed: ${signInError.message}`)
    console.warn('    You may need to set VITE_SUPABASE_ANON_KEY in your .env for this check.')
    console.warn('    The user was still created — try running the tests anyway.\n')
  } else {
    console.log(`✅  Sign-in verified — credentials work.\n`)
    await anonClient.auth.signOut()
  }

  console.log(`📋  Summary`)
  console.log(`    Email:    ${EMAIL}`)
  console.log(`    Password: ${PASSWORD}`)
  console.log(`\n    To override, set E2E_EMAIL and E2E_PASSWORD in your environment`)
  console.log(`    before running tests:\n`)
  console.log(`      E2E_EMAIL="${EMAIL}" E2E_PASSWORD="${PASSWORD}" npm run test:e2e\n`)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
