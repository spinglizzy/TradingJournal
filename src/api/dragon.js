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
  refreshPrices: ()         => api.post('/dragon/prices/refresh', {}),
  reconciliations: ()       => api.get('/dragon/reconciliations'),
  reconciliation:  (id)     => api.get(`/dragon/reconciliations/${id}`),
  saveReconciliation: (body) => api.post('/dragon/reconciliations', body),   // { source, rows: [{ ticker, schwab_shares, schwab_basis }] }
  fxRates:       (from)     => api.get(`/dragon/fx?from=${from}`),
  setFxRate:     (body)     => api.post('/dragon/fx', body),                // { date, aud_usd }
  restore:       (body)     => api.post('/dragon/restore', body),           // { backup, wipe }
}
