import { useState } from 'react'
import { X, Search, Plus } from 'lucide-react'
import { WIDGET_REGISTRY, CATEGORIES } from './widgetRegistry.js'

export default function WidgetPicker({ onAdd, onClose, existingTypes }) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  const filtered = Object.entries(WIDGET_REGISTRY).filter(([type, meta]) => {
    const matchSearch = !search || meta.name.toLowerCase().includes(search.toLowerCase()) || meta.description.toLowerCase().includes(search.toLowerCase())
    const matchCat    = activeCategory === 'all' || meta.category === activeCategory
    return matchSearch && matchCat
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Add Widget</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose a widget to add to your dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + category filter */}
        <div className="p-4 space-y-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search widgets…"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[['all', 'All'], ...Object.entries(CATEGORIES)].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeCategory === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Widget grid */}
        <div className="flex-1 overflow-y-auto p-4 pt-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-600 text-sm">No widgets match your search</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(([type, meta]) => {
                const alreadyAdded = existingTypes.filter(t => t === type).length
                return (
                  <button
                    key={type}
                    onClick={() => { onAdd(type); onClose() }}
                    className="flex items-start gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl text-left transition-all group"
                  >
                    <div className="text-2xl flex-shrink-0 leading-none mt-0.5">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                          {meta.name}
                        </span>
                        {alreadyAdded > 0 && (
                          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded-full">{alreadyAdded}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{meta.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                          meta.category === 'summary' ? 'bg-blue-500/10 text-blue-400'
                          : meta.category === 'chart'   ? 'bg-purple-500/10 text-purple-400'
                          : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {CATEGORIES[meta.category] ?? meta.category}
                        </span>
                        <span className="text-xs text-gray-600">{meta.defaultSize}</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 flex-shrink-0 transition-colors mt-0.5" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
