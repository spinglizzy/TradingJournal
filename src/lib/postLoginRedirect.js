const KEY = 'pj:post_login_redirect'

// Sending someone back to /login after logging in is a loop, and the landing
// page is not where they were working.
const NEVER = new Set(['/', '/login', '/signup'])

export function isSafeRedirect(path) {
  // Root-relative only. '//evil.com' is protocol-relative and the browser would
  // happily follow it off-site.
  return typeof path === 'string'
      && path.startsWith('/')
      && !path.startsWith('//')
      && !NEVER.has(path.split('?')[0])
}

export function rememberPath(path = window.location.pathname + window.location.search) {
  if (!isSafeRedirect(path)) return
  try { sessionStorage.setItem(KEY, path) } catch { /* private mode */ }
}

export function takeRememberedPath() {
  try {
    const path = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return isSafeRedirect(path) ? path : null
  } catch { return null }
}

const PENDING = 'pj:oauth_pending'

/**
 * An OAuth sign-in leaves our origin entirely, so the destination cannot ride
 * along in `redirectTo`: Supabase only honours redirect URLs that are on the
 * project's allow list, and one that is not on it is dropped for the Site URL
 * without an error. So the path stays in sessionStorage -- which survives the
 * round trip, being scoped to the tab rather than to a navigation -- and this
 * flag is what tells the next page load that the session it is about to find
 * came back from a provider rather than out of storage.
 */
export function markOAuthPending() {
  try { sessionStorage.setItem(PENDING, '1') } catch { /* private mode */ }
}

export function takeOAuthPending() {
  try {
    const pending = sessionStorage.getItem(PENDING) === '1'
    sessionStorage.removeItem(PENDING)
    return pending
  } catch { return false }
}

/**
 * Where to send someone whose page load turns out to be an OAuth return, or
 * null to just render. Single-use in both directions: the flag is cleared even
 * when there is no session behind it, so an abandoned sign-in cannot redirect
 * a later load.
 */
export function oauthReturnTarget(hasSession, currentPath) {
  if (!takeOAuthPending() || !hasSession) return null
  const target = takeRememberedPath()
  // Landing where we already are is a wasted full page load.
  return target && target !== currentPath ? target : null
}
