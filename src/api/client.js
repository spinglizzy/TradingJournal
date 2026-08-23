import { supabase } from '../lib/supabase.js'
import { createRequest } from './authRetry.js'
import { rememberPath } from '../lib/postLoginRedirect.js'

export const api = createRequest({
  fetchImpl: (...args) => fetch(...args),

  getAccessToken: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  },

  // One shot at renewing. Supabase rotates the refresh token here, so a failure
  // means the stored one is spent or revoked -- nothing left to retry with.
  refreshSession: async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data?.session) throw error || new Error('No session after refresh')
    return data.session
  },

  onAuthFailure: async () => {
    rememberPath()
    await supabase.auth.signOut()
    window.location.href = '/login'
  },
})
