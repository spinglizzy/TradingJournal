import { api } from './client.js'

const qs = (params) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const wheelApi = {
  // Reads
  dashboard: (params = {}) => api.get(`/wheel/dashboard${qs(params)}`),
  cycles:    (params = {}) => api.get(`/wheel/cycles${qs(params)}`),
  calendar:  (params = {}) => api.get(`/wheel/calendar${qs(params)}`),
  history:   ()            => api.get('/wheel/history'),

  // Leg CRUD — premium is TOTAL dollars for the leg, credit positive
  createLeg: (body)        => api.post('/wheel/legs', body),
  updateLeg: (id, body)    => api.put(`/wheel/legs/${id}`, body),
  deleteLeg: (id)          => api.delete(`/wheel/legs/${id}`),
  flagLeg:   (id, flag)    => api.post(`/wheel/legs/${id}/flag`, { needs_roll: flag }),
  snapshot:  (id, snap)    => api.put(`/wheel/legs/${id}/snapshot`, { snapshot: snap }),

  // Lifecycle events (spec §7)
  expire:    (id, body = {}) => api.post(`/wheel/legs/${id}/expire`, body),
  assign:    (id, body = {}) => api.post(`/wheel/legs/${id}/assign`, body),
  callAway:  (id, body = {}) => api.post(`/wheel/legs/${id}/call-away`, body),
  roll:      (id, body)      => api.post(`/wheel/legs/${id}/roll`, body),
  close:     (id, body)      => api.post(`/wheel/legs/${id}/close`, body),

  // Open a cycle from shares assigned before the Wheel tab existed
  createCycle: (body)          => api.post('/wheel/cycles', body),
  sellShares:  (cycleId, body) => api.post(`/wheel/cycles/${cycleId}/sell-shares`, body),
  deleteCycle: (cycleId)       => api.delete(`/wheel/cycles/${cycleId}`),
}
