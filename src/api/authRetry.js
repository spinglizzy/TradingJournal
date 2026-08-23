import { TOKEN_INVALID } from '../../server/lib/authCodes.js'

/**
 * The API request path, with the deps injected so it can be driven by
 * auth-retry-tests.mjs under plain Node -- importing src/lib/supabase.js there
 * would blow up on import.meta.env. Same split as server/lib/gateVerdict.js.
 *
 * The rule it exists to enforce: a 401 caused by an expired access token buys
 * ONE refresh and ONE retry. Anything else is a real failure.
 */
export function createRequest({ baseUrl = '/api', fetchImpl, getAccessToken, refreshSession, onAuthFailure }) {
  // One refresh at a time. Three dashboard widgets whose token expired together
  // must not fire three refreshes -- Supabase rotates the refresh token on every
  // call, so the second and third would race the first and could kill a session
  // that was about to be fine.
  let inFlight = null
  // Bumped on every successful refresh. A request records the value it was SENT
  // under; if its 401 lands after someone else already refreshed, there is
  // nothing to refresh -- just retry with the token that already arrived.
  let generation = 0
  let signedOut  = false

  function refreshOnce(sentUnder) {
    if (sentUnder !== generation) return Promise.resolve()
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(refreshSession)
        .then(s => { generation++; return s })
        .finally(() => { inFlight = null })
    }
    return inFlight
  }

  // Three parallel requests failing one refresh should log the user out once.
  function fail() {
    if (signedOut) return
    signedOut = true
    return onAuthFailure()
  }

  async function send(path, options, isRetry) {
    const sentUnder = generation
    const token = await getAccessToken()
    const res = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    })

    if (res.status === 401) {
      const body = await res.json().catch(() => ({}))
      // A 401 that is not about our token is an ordinary error. Signing someone
      // out of the journal because Alpaca disliked their API secret is the bug.
      if (body?.code !== TOKEN_INVALID) throw new Error(body?.error || 'Unauthorized')

      // Second 401 in a row, on a request sent with a freshly minted token: the
      // session is genuinely gone. Stop -- retrying again is a loop.
      if (isRetry) return fail()

      try { await refreshOnce(sentUnder) } catch { return fail() }
      return send(path, options, true)
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  }

  const request = (path, options = {}) => send(path, options, false)

  return {
    get:    (path)       => request(path),
    post:   (path, body) => request(path, { method: 'POST',   body: JSON.stringify(body) }),
    put:    (path, body) => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
    delete: (path)       => request(path, { method: 'DELETE' }),
  }
}
