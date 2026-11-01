import { api } from './client.js'
import { supabase } from '../lib/supabase.js'

const qs = (params = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

// window.open sends no Authorization header, so the auth middleware 401s it.
// Fetch with the Bearer token and save the body as a file instead.
async function download(path, filename) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api${path}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Export failed')
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export const importExportApi = {
  preview: (csv)                => api.post('/import/preview', { csv }),
  run:     (body)               => api.post('/import/run', body),
  restore: (data, mode)         => api.post('/import/restore', { data, mode }),

  exportCsv:  (params = {}) => download(`/export/csv${qs(params)}`, 'trades-export.csv'),
  exportJson: ()            => download('/export/json', 'tradelog-backup.json'),
}
