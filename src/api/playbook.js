import { api } from './client.js'

const qs = (p = {}) => {
  const q = new URLSearchParams()
  Object.entries(p).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const playbookApi = {
  // Setups
  setups:         ()       => api.get('/playbook/setups'),
  setupDetail:    (id)     => api.get(`/playbook/setups/${id}`),
  setupTrades:    (id)     => api.get(`/playbook/setups/${id}/trades`),
  compare:        (ids)    => api.get(`/playbook/compare?ids=${ids.join(',')}`),

  // Planned trades
  planned:        (p = {}) => api.get(`/playbook/planned${qs(p)}`),
  createPlanned:  (b)      => api.post('/playbook/planned', b),
  updatePlanned:  (id, b)  => api.put(`/playbook/planned/${id}`, b),
  deletePlanned:  (id)     => api.delete(`/playbook/planned/${id}`),
  executePlanned: (id, b)  => api.post(`/playbook/planned/${id}/execute`, b),

  // Missed trades
  missed:         ()       => api.get('/playbook/missed'),
  missedSummary:  ()       => api.get('/playbook/missed/summary'),
  createMissed:   (b)      => api.post('/playbook/missed', b),
  updateMissed:   (id, b)  => api.put(`/playbook/missed/${id}`, b),
  deleteMissed:   (id)     => api.delete(`/playbook/missed/${id}`),
}
