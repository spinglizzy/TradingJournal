import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

export default function TradeFilters({ filters, onChange, strategies, tags, confluenceSuggestions = [] }) {
  const [open, setOpen] = useState(false)

  function set(key, val) {
    onChange({ ...filters, [key]: val })
  }

  function reset() {
    onChange({ start_date: '', end_date: '', ticker: '', direction: '', strategy_id: '', status: '', tag: '', confluence: '', search: '' })
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-3">
      {/* Search + toggle */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search ticker, notes..."
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors
            ${open ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-white'}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeCount}</span>
          )}
        </button>
        {activeCount > 0 && (
          <button onClick={reset} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">From</label>
            <input type="date" value={filters.start_date} onChange={e => set('start_date', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">To</label>
            <input type="date" value={filters.end_date} onChange={e => set('end_date', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Direction</label>
            <select value={filters.direction} onChange={e => set('direction', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Status</label>
            <select value={filters.status} onChange={e => set('status', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Strategy</label>
            <select value={filters.strategy_id} onChange={e => set('strategy_id', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">All</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Tag</label>
            <select value={filters.tag} onChange={e => set('tag', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">All</option>
              {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          {confluenceSuggestions.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Confluence</label>
              <select value={filters.confluence} onChange={e => set('confluence', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="">All</option>
                {confluenceSuggestions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
