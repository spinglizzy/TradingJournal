import { api } from './client.js'

export const strategiesApi = {
  list:   ()            => api.get('/strategies'),
  create: (body)        => api.post('/strategies', body),
  update: (id, body)    => api.put(`/strategies/${id}`, body),
  delete: (id)          => api.delete(`/strategies/${id}`),
}
