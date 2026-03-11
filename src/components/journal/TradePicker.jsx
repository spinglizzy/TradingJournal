import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { tradesApi } from '../../api/trades.js'
import Modal from '../ui/Modal.jsx'

function fmt$(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2)
}

export default function TradePicker({ isOpen, onClose, selectedIds, onConfirm }) {
  const [trades, setTrades]   = useState([])
  const [search, setSearch]   = useState('')
  const [picked,  setPicked]  = useState(new Set(selectedIds || []))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setPicked(new Set(selectedIds || []))
    setLoading(true)
    tradesApi.list({ status: 'closed', limit: 200 })
      .then(res => setTrades(res.data || []))
      .finally(() => setLoading(false))
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = trades.filter(t =>
    t.ticker.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id) {
    setPicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleConfirm() {
    onConfirm([...picked])
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Trades" size="lg">
      <div className="space-y-4">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by ticker…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />

        {loading ? (
          <div className="text-center py-8 text-gray-500 text-sm">Loading trades…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">No closed trades found</div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
            {filtered.map(trade => {
              const isSelected = picked.has(trade.id)
              return (
                <button
                  key={trade.id}
                  type="button"
                  onClick={() => toggle(trade.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                  }`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  <span className="font-semibold text-white text-sm w-16 shrink-0">{trade.ticker}</span>

                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    trade.direction === 'long'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-red-500/15 text-red-400'
                  }`}>
                    {trade.direction.toUpperCase()}
                  </span>

                  <span className="text-xs text-gray-500 shrink-0">
                    {format(parseISO(trade.date), 'MMM d')}
                  </span>

                  <span className={`text-sm font-mono font-semibold ml-auto shrink-0 ${
                    (trade.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {fmt$(trade.pnl)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
          <span className="text-sm text-gray-500">
            {picked.size > 0 ? `${picked.size} trade${picked.size > 1 ? 's' : ''} selected` : 'No trades selected'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
