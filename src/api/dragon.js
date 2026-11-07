import { api } from './client.js'

export const dragonApi = {
  all:           ()         => api.get('/dragon'),
  createHolding: (body)     => api.post('/dragon/holdings', body),
  updateHolding: (id, body) => api.put(`/dragon/holdings/${id}`, body),
  deleteHolding: (id)       => api.delete(`/dragon/holdings/${id}`),
  createTx:      (body)     => api.post('/dragon/transactions', body),
  batchBuys:     (body)     => api.post('/dragon/transactions/batch', body),
  updateTx:      (id, body) => api.put(`/dragon/transactions/${id}`, body),
  deleteTx:      (id)       => api.delete(`/dragon/transactions/${id}`),
  importCsv:     (body)     => api.post('/dragon/import', body),   // { csv, mappings, commit }
}
