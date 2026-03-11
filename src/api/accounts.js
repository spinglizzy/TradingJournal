import { api } from './client.js'

export const accountsApi = {
  list:             ()           => api.get('/accounts'),
  get:              (id)         => api.get(`/accounts/${id}`),
  create:           (body)       => api.post('/accounts', body),
  update:           (id, body)   => api.put(`/accounts/${id}`, body),
  delete:           (id)         => api.delete(`/accounts/${id}`),
  transactions:     (id)         => api.get(`/accounts/${id}/transactions`),
  addTransaction:   (id, body)   => api.post(`/accounts/${id}/transactions`, body),
  delTransaction:   (id, txId)   => api.delete(`/accounts/${id}/transactions/${txId}`),
  equity:           (id)         => api.get(`/accounts/${id}/equity`),
}
