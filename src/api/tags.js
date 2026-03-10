import { api } from './client.js'

export const tagsApi = {
  list:   ()        => api.get('/tags'),
  create: (body)    => api.post('/tags', body),
  delete: (id)      => api.delete(`/tags/${id}`),
}
