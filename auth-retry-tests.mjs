/**
 * 401 -> refresh -> retry. Pure, no DB, no browser.
 *   node auth-retry-tests.mjs   (or: npm run test:auth)
 *
 * The bug these lock down: every 401 used to sign the user out, so one expired
 * access token ended an otherwise valid session. The rules now are (1) exactly
 * one refresh and one retry, (2) concurrent 401s share that single refresh, and
 * (3) a 401 that is not about our token -- Alpaca rejecting a broker key -- is
 * an ordinary error, not a logout.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequest } from './src/api/authRetry.js'
import { isSafeRedirect, rememberPath, takeRememberedPath,
         markOAuthPending, takeOAuthPending, oauthReturnTarget } from './src/lib/postLoginRedirect.js'
import { TOKEN_INVALID } from './server/lib/authCodes.js'

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`) }
}

// ── Fakes ───────────────────────────────────────────────────────────────────
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })
const ok        = () => json(200, { data: 'fresh' })
const tokenDead = () => json(401, { error: 'Invalid or expired token', code: TOKEN_INVALID })
const alpaca401 = () => json(401, { error: 'Invalid Alpaca API credentials. Check your key and secret.' })

/**
 * `script` is consulted per call with the 1-based call number, the token the
 * request carried and the path, so a fake can answer 401 until the refresh has
 * landed, or per endpoint.
 * `deferRefresh` holds the refresh open until release() so several requests can
 * pile up behind it -- that is the dashboard case.
 */
function harness({ script, refresh = async () => 'token-2', deferRefresh = false }) {
  const calls = { fetch: [], refresh: 0, signOut: 0 }
  let token = 'token-1'
  let release
  const gate = new Promise(r => { release = r })

  const api = createRequest({
    fetchImpl: async (url, opts) => {
      calls.fetch.push({ url, auth: opts.headers.Authorization })
      return script(calls.fetch.length, token, url)
    },
    getAccessToken: async () => token,
    refreshSession: async () => {
      calls.refresh++
      if (deferRefresh) await gate
      token = await refresh()
      return { access_token: token }
    },
    onAuthFailure: async () => { calls.signOut++ },
  })

  return { api, calls, release: () => release() }
}

console.log('\nAPI client — 401 refresh and retry\n')

// ── 1. The happy path this whole change exists for ──────────────────────────
await test('single 401 → one refresh → retry succeeds, no signOut', async () => {
  const h = harness({ script: n => (n === 1 ? tokenDead() : ok()) })
  const res = await h.api.get('/stats/summary')
  assert.deepEqual(res, { data: 'fresh' })
  assert.equal(h.calls.refresh, 1)
  assert.equal(h.calls.signOut, 0)
  assert.equal(h.calls.fetch.length, 2)
  assert.equal(h.calls.fetch[0].auth, 'Bearer token-1')
  assert.equal(h.calls.fetch[1].auth, 'Bearer token-2', 'the retry must carry the NEW token')
})

await test('a 200 never touches the refresh', async () => {
  const h = harness({ script: () => ok() })
  await h.api.get('/trades')
  assert.equal(h.calls.refresh, 0)
  assert.equal(h.calls.signOut, 0)
})

// ── 2. Real auth failures must still end the session ────────────────────────
await test('refresh fails → signOut, exactly once', async () => {
  const h = harness({
    script: () => tokenDead(),
    refresh: async () => { throw new Error('invalid refresh token') },
  })
  await h.api.get('/trades')
  assert.equal(h.calls.refresh, 1)
  assert.equal(h.calls.signOut, 1)
  assert.equal(h.calls.fetch.length, 1, 'no retry once the refresh is dead')
})

await test('401 again after a successful refresh → signOut, no second refresh', async () => {
  const h = harness({ script: () => tokenDead() })   // never recovers
  await h.api.get('/trades')
  assert.equal(h.calls.refresh, 1, 'exactly one refresh — the retry must not loop')
  assert.equal(h.calls.fetch.length, 2, 'one attempt, one retry, then stop')
  assert.equal(h.calls.signOut, 1)
})

// ── 3. The dashboard case: 3 parallel requests, one expired token ───────────
await test('three concurrent 401s → exactly one refresh, all three resolve', async () => {
  // 401 for anything sent under the stale token; 200 once the new one is in.
  const h = harness({
    script: (_n, token) => (token === 'token-1' ? tokenDead() : ok()),
    deferRefresh: true,
  })

  const inFlight = Promise.all([
    h.api.get('/stats/summary'),
    h.api.get('/stats/streaks'),
    h.api.get('/stats/calendar'),
  ])
  // Let all three 401s land before the refresh is allowed to complete.
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
  h.release()
  const results = await inFlight

  assert.equal(h.calls.refresh, 1, 'one refresh for three widgets')
  assert.equal(h.calls.signOut, 0)
  assert.equal(results.length, 3)
  for (const r of results) assert.deepEqual(r, { data: 'fresh' })
  assert.equal(h.calls.fetch.length, 6, '3 failed + 3 retried')
})

await test('three concurrent 401s with a dead refresh → one refresh, one signOut', async () => {
  const h = harness({
    script: () => tokenDead(),
    refresh: async () => { throw new Error('invalid refresh token') },
    deferRefresh: true,
  })
  const inFlight = Promise.all([h.api.get('/a'), h.api.get('/b'), h.api.get('/c')])
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
  h.release()
  await inFlight
  assert.equal(h.calls.refresh, 1)
  assert.equal(h.calls.signOut, 1, 'one logout, not three')
})

await test('a later request under a token that already moved on still gets its own refresh', async () => {
  // The generation check only suppresses a refresh for requests SENT before an
  // earlier one landed. A genuinely new stale token is a new problem.
  // Each path 401s once, then succeeds on its retry.
  const seen = new Set()
  const h = harness({
    script: (_n, _token, url) => {
      if (seen.has(url)) return ok()
      seen.add(url)
      return tokenDead()
    },
    refresh: async () => 'token-next',
  })
  await h.api.get('/first')
  assert.equal(h.calls.refresh, 1)
  await h.api.get('/second')
  assert.equal(h.calls.refresh, 2)
  assert.equal(h.calls.signOut, 0)
})

// ── 4. Non-auth 401s are not logouts ────────────────────────────────────────
await test('Alpaca 401 (no code) → no refresh, no signOut, error surfaces', async () => {
  const h = harness({ script: () => alpaca401() })
  await assert.rejects(
    () => h.api.post('/alpaca/connect', { api_key: 'junk' }),
    /Invalid Alpaca API credentials/,
  )
  assert.equal(h.calls.refresh, 0, 'a rejected broker key is not our token expiring')
  assert.equal(h.calls.signOut, 0, 'and it must never log the user out')
  assert.equal(h.calls.fetch.length, 1)
})

await test('a 401 with an unrelated code is also left alone', async () => {
  const h = harness({ script: () => json(401, { error: 'Nope', code: 'something_else' }) })
  await assert.rejects(() => h.api.get('/x'), /Nope/)
  assert.equal(h.calls.refresh, 0)
  assert.equal(h.calls.signOut, 0)
})

await test('non-401 errors are unchanged', async () => {
  const h = harness({ script: () => json(500, { error: 'Boom' }) })
  await assert.rejects(() => h.api.get('/x'), /Boom/)
  assert.equal(h.calls.refresh, 0)
  assert.equal(h.calls.signOut, 0)
})

// ── 5. Client and server must agree on the marker, forever ──────────────────
await test('the auth middleware sends the code the client checks for', () => {
  const mw = fs.readFileSync('./server/middleware/auth.js', 'utf8')
  assert.match(mw, /from '\.\.\/lib\/authCodes\.js'/, 'middleware must import the shared constant')
  assert.equal(mw.match(/code: TOKEN_INVALID/g)?.length, 2, 'both 401s must carry the code')
  assert.equal(TOKEN_INVALID, 'token_invalid')

  const client = fs.readFileSync('./src/api/authRetry.js', 'utf8')
  assert.match(client, /from '\.\.\/\.\.\/server\/lib\/authCodes\.js'/,
    'the client must read the same constant, never a copied string literal')
})

// ── 6. Post-login redirect ──────────────────────────────────────────────────
await test('remembered paths that would loop or leave the site are rejected', () => {
  assert.equal(isSafeRedirect('/trades?search=NQ'), true)
  assert.equal(isSafeRedirect('/wheel'), true)
  assert.equal(isSafeRedirect('/login'), false)
  assert.equal(isSafeRedirect('/signup'), false)
  assert.equal(isSafeRedirect('/'), false)
  assert.equal(isSafeRedirect('//evil.com'), false)
  assert.equal(isSafeRedirect('https://evil.com'), false)
  assert.equal(isSafeRedirect(null), false)
  assert.equal(isSafeRedirect(undefined), false)
})

// ── 7. OAuth returns through an external origin ─────────────────────────────
// Password login consumes the remembered path in Login.jsx and never reloads.
// OAuth leaves the site, so the path has to survive a round trip through the
// provider and be picked up on the way back in. sessionStorage does survive it
// -- it is scoped to the tab, not to a navigation, and Supabase redirects in
// the same tab -- so these drive the pickup logic directly.
function fakeStorage() {
  const map = new Map()
  return {
    getItem:    k => (map.has(k) ? map.get(k) : null),
    setItem:    (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  }
}
const withStorage = (store, fn) => {
  globalThis.sessionStorage = store
  try { return fn() } finally { delete globalThis.sessionStorage }
}
const fresh = fn => withStorage(fakeStorage(), fn)

await test('OAuth round trip lands on the remembered path', () => {
  fresh(() => {
    rememberPath('/trades?search=NQ')       // kicked off the trade log
    markOAuthPending()                      // then signed in with Google
    assert.equal(oauthReturnTarget(true, '/dashboard'), '/trades?search=NQ')
  })
})

await test('the OAuth path is single-use in both directions', () => {
  fresh(() => {
    rememberPath('/wheel')
    markOAuthPending()
    assert.equal(oauthReturnTarget(true, '/dashboard'), '/wheel')
    // A second page load must not bounce them out of wherever they now are.
    assert.equal(oauthReturnTarget(true, '/wheel'), null)
    assert.equal(takeRememberedPath(), null)
  })
})

await test('an ordinary page load with a path stored does not redirect', () => {
  fresh(() => {
    rememberPath('/wheel')                  // stored, but no OAuth was started
    assert.equal(oauthReturnTarget(true, '/dashboard'), null)
    assert.equal(takeRememberedPath(), '/wheel', 'the path is left for whoever does log in')
  })
})

await test('an abandoned OAuth sign-in cannot redirect a later load', () => {
  fresh(() => {
    rememberPath('/wheel')
    markOAuthPending()
    assert.equal(oauthReturnTarget(false, '/login'), null, 'no session came back')
    // The flag is spent even though nothing happened, so the next load is clean.
    assert.equal(oauthReturnTarget(true, '/dashboard'), null)
  })
})

await test('returning to where you already are is not a redirect', () => {
  fresh(() => {
    rememberPath('/dashboard')
    markOAuthPending()
    assert.equal(oauthReturnTarget(true, '/dashboard'), null, 'that would be a wasted page load')
  })
})

await test('no remembered path → OAuth falls through to /dashboard', () => {
  fresh(() => {
    markOAuthPending()
    assert.equal(oauthReturnTarget(true, '/dashboard'), null)
  })
})

// The OAuth path must not become a second, laxer door into the same redirect.
await test('OAuth applies the same validation as password login', () => {
  for (const hostile of ['//evil.com', 'https://evil.com', '/login', '/signup', '/']) {
    fresh(() => {
      rememberPath(hostile)
      markOAuthPending()
      assert.equal(oauthReturnTarget(true, '/dashboard'), null, hostile + ' must never be a destination')
    })
  }
})

await test('a hostile path planted directly in storage is still rejected on read', () => {
  // rememberPath guards the write, but the write is not the only way in.
  const store = fakeStorage()
  store.setItem('pj:post_login_redirect', '//evil.com')
  withStorage(store, () => {
    markOAuthPending()
    assert.equal(oauthReturnTarget(true, '/dashboard'), null)
  })
})

await test('storage that throws degrades to /dashboard instead of crashing', () => {
  const privateMode = {
    getItem()    { throw new Error('private mode') },
    setItem()    { throw new Error('private mode') },
    removeItem() { throw new Error('private mode') },
  }
  withStorage(privateMode, () => {
    assert.doesNotThrow(() => rememberPath('/wheel'))
    assert.equal(takeRememberedPath(), null)
    assert.doesNotThrow(() => markOAuthPending())
    assert.equal(takeOAuthPending(), false)
    assert.equal(oauthReturnTarget(true, '/dashboard'), null)
  })
})

await test('AuthContext still marks the OAuth flow and reads it back', () => {
  // Drop either half and Google logins silently go back to always landing on
  // /dashboard, with nothing failing to say so.
  const ctx = fs.readFileSync('./src/contexts/AuthContext.jsx', 'utf8')
  assert.match(ctx, /markOAuthPending\(\)/,  'loginWithOAuth must mark the flow before leaving')
  assert.match(ctx, /oauthReturnTarget\(/,   'the boot path must check for a return')
  assert.ok(ctx.includes('redirectTo: `${window.location.origin}/dashboard`'),
    'redirectTo must stay on the allow-listed /dashboard — see markOAuthPending')
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
