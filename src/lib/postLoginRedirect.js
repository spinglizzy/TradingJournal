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
