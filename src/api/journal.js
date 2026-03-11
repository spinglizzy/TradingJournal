import { api } from './client.js'

function qs(params) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const journalApi = {
  list:        (params = {}) => api.get(`/journal${qs(params)}`),
  get:         (id)          => api.get(`/journal/${id}`),
  create:      (body)        => api.post('/journal', body),
  update:      (id, body)    => api.put(`/journal/${id}`, body),
  delete:      (id)          => api.delete(`/journal/${id}`),
  calendar:    (params = {}) => api.get(`/journal/calendar${qs(params)}`),
  weeklyStats: (from, to)    => api.get(`/journal/weekly-stats?from=${from}&to=${to}`),
  allTags:     ()            => api.get('/journal/tags'),
}
