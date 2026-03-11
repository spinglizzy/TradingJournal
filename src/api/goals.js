import { api } from './client.js'

export const goalsApi = {
  list:              ()       => api.get('/goals'),
  create:            (data)   => api.post('/goals', data),
  update:            (id, d)  => api.put(`/goals/${id}`, d),
  remove:            (id)     => api.delete(`/goals/${id}`),

  streaks:           ()       => api.get('/goals/streaks'),
  progress:          ()       => api.get('/goals/progress'),

  achievements:      ()       => api.get('/goals/achievements'),
  createAchievement: (data)   => api.post('/goals/achievements', data),
  updateAchievement: (id, d)  => api.put(`/goals/achievements/${id}`, d),
  removeAchievement: (id)     => api.delete(`/goals/achievements/${id}`),
}
