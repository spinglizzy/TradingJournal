import { api } from './client.js'

const qs = (params = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const psychologyApi = {
  summary:            (range = {}) => api.get(`/psychology/summary${qs(range)}`),
  tiltHistory:        (range = {}) => api.get(`/psychology/tilt-history${qs(range)}`),
  emotionPerformance: (range = {}) => api.get(`/psychology/emotion-performance${qs(range)}`),
  emotionFrequency:   (range = {}) => api.get(`/psychology/emotion-frequency${qs(range)}`),
  ruleCompliance:     (range = {}) => api.get(`/psychology/rule-compliance${qs(range)}`),
  mistakeStats:       (range = {}) => api.get(`/psychology/mistake-stats${qs(range)}`),
  sessionQuality:     (range = {}) => api.get(`/psychology/session-quality${qs(range)}`),
}
