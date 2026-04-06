import { api } from './client.js'

export const brokersApi = {
  allStatus:    ()                   => api.get('/brokers/all'),
  authorizeUrl: (broker)             => api.get(`/oauth/authorize/${broker}`),
  connect:      (broker, payload)    => api.post(`/${broker}/connect`, payload),
  sync:         (broker)             => api.post(`/${broker}/sync`, {}),
  disconnect:   (broker)             => api.delete(`/${broker}/disconnect`),
}
