import { api } from './client.js'

export const analyticsApi = {
  byWeekday:  () => api.get('/analytics/by-weekday'),
  byStrategy: () => api.get('/analytics/by-strategy'),
  byTicker:   () => api.get('/analytics/by-ticker'),
  rrDist:     () => api.get('/analytics/rr-dist'),
  drawdown:   () => api.get('/analytics/drawdown'),
  holdTime:   () => api.get('/analytics/hold-time'),
}
