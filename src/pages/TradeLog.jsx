import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { tradesApi } from '../api/trades.js'
import { strategiesApi } from '../api/strategies.js'
import { tagsApi } from '../api/tags.js'
import TradeTable from '../components/trades/TradeTable.jsx'
import TradeFilters from '../components/trades/TradeFilters.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'

export default function TradeLog() {
  const navigate = useNavigate()
  const [trades, setTrades]         = useState([])
  const [total, setTotal]           = useState(0)
  const [strategies, setStrategies] = useState([])
  const [tags, setTags]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [deleteId, setDeleteId]     = useState(null)

  const [filters, setFilters] = useState({
    start_date: '', end_date: '', ticker: '', direction: '',
    strategy_id: '', status: '', tag: '', search: '',
  })
  const [sort, setSort]   = useState({ sort_by: 'date', sort_dir: 'desc' })
  const [page, setPage]   = useState(1)
  const LIMIT = 50

  const fetchTrades = useCallback(() => {
    setLoading(true)
    tradesApi.list({ ...filters, ...sort, page, limit: LIMIT })
      .then(res => { setTrades(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [filters, sort, page])

  useEffect(() => { fetchTrades() }, [fetchTrades])
  useEffect(() => {
    strategiesApi.list().then(setStrategies)
    tagsApi.list().then(setTags)
  }, [])

  function handleFilterChange(newFilters) {
    setFilters(newFilters)
    setPage(1)
  }

  function handleSort(col) {
    setSort(prev => ({
      sort_by: col,
      sort_dir: prev.sort_by === col && prev.sort_dir === 'desc' ? 'asc' : 'desc',
    }))
  }

  async function handleDelete() {
    await tradesApi.delete(deleteId)
    setDeleteId(null)
    fetchTrades()
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade Log</h1>
          <p className="text-sm text-gray-500 mt-1">{total} trades total</p>
        </div>
        <button
          onClick={() => navigate('/trades/new')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Log Trade
        </button>
      </div>

      <TradeFilters
        filters={filters}
        onChange={handleFilterChange}
        strategies={strategies}
        tags={tags}
      />

      {loading ? (
        <LoadingSpinner className="h-64" />
      ) : (
        <TradeTable
          trades={trades}
          sort={sort}
          onSort={handleSort}
          onEdit={(id) => navigate(`/trades/${id}/edit`)}
          onDelete={(id) => setDeleteId(id)}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Trade"
        message="This will permanently remove the trade and all associated data. This cannot be undone."
        confirmLabel="Delete Trade"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
