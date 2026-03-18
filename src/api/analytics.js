import { api } from './client.js'

const qs = (params = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const analyticsApi = {
  byWeekday:  (range = {}) => api.get(`/analytics/by-weekday${qs(range)}`),
  byHour:     (range = {}) => api.get(`/analytics/by-hour${qs(range)}`),
  byStrategy: (range = {}) => api.get(`/analytics/by-strategy${qs(range)}`),
  bySetup:    (range = {}) => api.get(`/analytics/by-setup${qs(range)}`),
  byTicker:   (range = {}) => api.get(`/analytics/by-ticker${qs(range)}`),
  byTag:      (range = {}) => api.get(`/analytics/by-tag${qs(range)}`),
  rrDist:     (range = {}) => api.get(`/analytics/rr-dist${qs(range)}`),
  pnlDist:    (range = {}) => api.get(`/analytics/pnl-dist${qs(range)}`),
  drawdown:   (range = {}) => api.get(`/analytics/drawdown${qs(range)}`),
  holdTime:   (range = {}) => api.get(`/analytics/hold-time${qs(range)}`),
  bySmt:      (range = {}) => api.get(`/analytics/by-smt${qs(range)}`),
  custom:     (params = {}) => api.get(`/analytics/custom${qs(params)}`),
}
