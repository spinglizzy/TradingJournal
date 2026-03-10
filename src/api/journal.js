import { api } from './client.js'

export const journalApi = {
  list:   (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v) })
    const s = q.toString()
    return api.get(`/journal${s ? `?${s}` : ''}`)
  },
  get:    (id)      => api.get(`/journal/${id}`),
  create: (body)    => api.post('/journal', body),
  update: (id, body)=> api.put(`/journal/${id}`, body),
  delete: (id)      => api.delete(`/journal/${id}`),
}
