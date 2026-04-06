import { api } from './client.js'

export const alpacaApi = {
  connect:    (payload) => api.post('/alpaca/connect', payload),
  status:     ()        => api.get('/alpaca/status'),
  sync:       ()        => api.post('/alpaca/sync', {}),
  disconnect: ()        => api.delete('/alpaca/disconnect'),
}
