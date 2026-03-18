import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { Download, Plus, AlertTriangle, ClipboardList } from 'lucide-react'
import { tradesApi } from '../api/trades.js'
import { strategiesApi } from '../api/strategies.js'
import { tagsApi } from '../api/tags.js'
import { importExportApi } from '../api/importexport.js'
import { useAccount } from '../contexts/AccountContext.jsx'
import TradeTable from '../components/trades/TradeTable.jsx'
import TradeFilters from '../components/trades/TradeFilters.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'

export default function TradeLog() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { selectedAccountId } = useAccount()
  const [trades, setTrades]                     = useState([])
  const [total, setTotal]                       = useState(0)
  const [strategies, setStrategies]             = useState([])
  const [tags, setTags]                         = useState([])
  const [confluenceSuggestions, setConfluenceSuggestions] = useState([])
  const [pdArraySuggestions,    setPdArraySuggestions]    = useState([])
  const [loading, setLoading]                   = useState(true)
  const [error, setError]           = useState(null)
  const [deleteId, setDeleteId]     = useState(null)

  const dateParam = searchParams.get('date') ?? ''
  const fromParam = searchParams.get('from') ?? ''
  const toParam   = searchParams.get('to')   ?? ''
  const [filters, setFilters] = useState({
    start_date: dateParam || fromParam, end_date: dateParam || toParam, ticker: '', direction: '',
    strategy_id: '', status: '', tag: '', confluence: '', pd_array: '', bias: '', search: '',
  })
  const [sort, setSort]   = useState({ sort_by: 'date', sort_dir: 'desc' })
  const [page, setPage]   = useState(1)
  const LIMIT = 50

  const fetchTrades = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = {
      ...filters, ...sort, page, limit: LIMIT,
      ...(selectedAccountId ? { account_id: selectedAccountId } : {}),
    }
    tradesApi.list(params)
      .then(res => { setTrades(res.data); setTotal(res.total) })
      .catch(() => setError('Failed to load trades. Make sure the server is running.'))
      .finally(() => setLoading(false))
  }, [filters, sort, page, selectedAccountId])

  useEffect(() => { fetchTrades() }, [fetchTrades])
  useEffect(() => {
    strategiesApi.list().then(setStrategies)
    tagsApi.list().then(setTags)
    tradesApi.confluences().then(setConfluenceSuggestions).catch(() => {})
    tradesApi.pdArrays().then(setPdArraySuggestions).catch(() => {})
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const url = importExportApi.exportCsvUrl({
                ...(selectedAccountId ? { account_id: selectedAccountId } : {}),
                ...(filters.start_date ? { from: filters.start_date } : {}),
                ...(filters.end_date   ? { to:   filters.end_date }   : {}),
                ...(filters.status     ? { status: filters.status }   : {}),
              })
              window.open(url, '_blank')
            }}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-colors border border-gray-700"
            title="Export filtered trades as CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => flushSync(() => navigate('/trades/new'))}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Trade
          </button>
        </div>
      </div>

      <TradeFilters
        filters={filters}
        onChange={handleFilterChange}
        strategies={strategies}
        tags={tags}
        confluenceSuggestions={confluenceSuggestions}
        pdArraySuggestions={pdArraySuggestions}
      />

      {loading ? (
        <LoadingSpinner className="h-64" />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 bg-red-900/20 border border-red-800/40 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-gray-400 text-sm">{error}</p>
          <button onClick={fetchTrades} className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
            Try Again
          </button>
        </div>
      ) : trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-gray-800 rounded-xl">
          <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
            <ClipboardList className="w-7 h-7 text-gray-600" />
          </div>
          <p className="text-white font-medium">
            {Object.values(filters).some(Boolean) ? 'No trades match your filters' : 'No trades yet'}
          </p>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            {Object.values(filters).some(Boolean)
              ? 'Try adjusting your filter criteria'
              : 'Start tracking your performance by logging your first trade'}
          </p>
          {!Object.values(filters).some(Boolean) && (
            <button
              onClick={() => flushSync(() => navigate('/trades/new'))}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Log Your First Trade
            </button>
          )}
        </div>
      ) : (
        <TradeTable
          trades={trades}
          sort={sort}
          onSort={handleSort}
          onView={(id) => flushSync(() => navigate(`/trades/${id}/edit`))}
          onEdit={(id) => flushSync(() => navigate(`/trades/${id}/edit`))}
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
