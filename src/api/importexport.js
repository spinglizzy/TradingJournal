import { api } from './client.js'

const qs = (params = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const importExportApi = {
  preview: (csv)                => api.post('/import/preview', { csv }),
  run:     (body)               => api.post('/import/run', body),
  restore: (data, mode)         => api.post('/import/restore', { data, mode }),

  // For exports we use window.open / fetch directly to handle file download
  exportCsvUrl:  (params = {}) => `/api/export/csv${qs(params)}`,
  exportJsonUrl: ()             => '/api/export/json',
}
