import { api } from './client.js'

const qs = (params) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const gateApi = {
  // Config-driven kill / contested / confluence lists
  factors:    ()                => api.get('/gate/factors'),
  addFactor:  (body)            => api.post('/gate/factors', body),
  delFactor:  (id)              => api.delete(`/gate/factors/${id}`),

  // Scenarios — written only when "Log scenario" is pressed, never auto-saved
  create:     (body)            => api.post('/gate/checks', body),
  update:     (id, body)        => api.put(`/gate/checks/${id}`, body),
  remove:     (id)              => api.delete(`/gate/checks/${id}`),
  list:       (params = {})     => api.get(`/gate/checks${qs(params)}`),
  link:       (id, trade_id)    => api.post(`/gate/checks/${id}/link`, { trade_id }),

  review:     (params = {})     => api.get(`/gate/review${qs(params)}`),
}
