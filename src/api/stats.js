import { api } from './client.js'

const qs = (params = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const statsApi = {
  summary:     (range = {}) => api.get(`/stats/summary${qs(range)}`),
  equityCurve: (range = {}) => api.get(`/stats/equity-curve${qs(range)}`),
  calendar:    (range = {}) => api.get(`/stats/calendar${qs(range)}`),
  monthly:     (range = {}) => api.get(`/stats/monthly${qs(range)}`),
  streaks:     (range = {}) => api.get(`/stats/streaks${qs(range)}`),
}
