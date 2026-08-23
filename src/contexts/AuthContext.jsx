import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { markOAuthPending, takeOAuthPending, oauthReturnTarget } from '../lib/postLoginRedirect.js'

const AuthContext = createContext(null)

// Shape the Supabase user into the same { id, email, name } format the app expects
function formatUser(supabaseUser) {
  if (!supabaseUser) return null
  return {
    id:    supabaseUser.id,
    email: supabaseUser.email,
    name:  supabaseUser.user_metadata?.name || null,
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session from storage on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      // getSession() waits for the tokens in the return URL to be consumed, so
      // this is the first moment an OAuth session is real. Redirect before
      // clearing `loading`, so they keep seeing the spinner they were already
      // looking at rather than a flash of the dashboard on the way elsewhere.
      const target = oauthReturnTarget(Boolean(session),
        window.location.pathname + window.location.search)
      if (target) { window.location.replace(target); return }

      setUser(formatUser(session?.user ?? null))
      setLoading(false)
    })

    // Listen for sign-in / sign-out / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(formatUser(session?.user ?? null))
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    return formatUser(data.user)
  }, [])

  const loginWithOAuth = useCallback(async (provider) => {
    // redirectTo stays pointed at /dashboard on purpose -- see markOAuthPending.
    markOAuthPending()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    // The browser never left, so nothing is coming back to read the flag.
    if (error) { takeOAuthPending(); throw new Error(error.message) }
  }, [])

  const register = useCallback(async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name || null } },
    })
    if (error) throw new Error(error.message)
    // Supabase may require email confirmation depending on project settings.
    // If email confirmation is disabled, data.session is available immediately.
    return formatUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  // Kept for backward compat — returns the current access token synchronously
  // from the cached session (fast, no network call)
  const getToken = useCallback(() => {
    // supabase.auth stores the session in localStorage; we return null here
    // because api/client.js now fetches the token itself via getSession()
    return null
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithOAuth, register, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
