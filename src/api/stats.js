import { api } from './client.js'

export const statsApi = {
  summary:     () => api.get('/stats/summary'),
  equityCurve: () => api.get('/stats/equity-curve'),
  monthly:     () => api.get('/stats/monthly'),
  streaks:     () => api.get('/stats/streaks'),
}
