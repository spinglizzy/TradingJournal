import { api } from './client.js'

const qs = (params) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const tradesApi = {
  list:        (params = {}) => api.get(`/trades${qs(params)}`),
  get:         (id)          => api.get(`/trades/${id}`),
  create:      (body)        => api.post('/trades', body),
  update:      (id, body)    => api.put(`/trades/${id}`, body),
  delete:      (id)          => api.delete(`/trades/${id}`),
  journal:     (id)          => api.get(`/trades/${id}/journal`),
  neighbors:   (id)          => api.get(`/trades/${id}/neighbors`),
  executions:  (id)          => api.get(`/trades/${id}/executions`),
  addExecution:(id, body)    => api.post(`/trades/${id}/executions`, body),
  delExecution:(id, execId)  => api.delete(`/trades/${id}/executions/${execId}`),
}
