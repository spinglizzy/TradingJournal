import { useState, useRef, useEffect, useCallback } from 'react'
import { Target, ChevronDown, X, Check } from 'lucide-react'
import { useDashboard } from '../../contexts/DashboardContext.jsx'
import { strategiesApi } from '../../api/strategies.js'

export default function StrategyFilter() {
  const { strategyFilter, setStrategyFilter } = useDashboard()
  const [open, setOpen]             = useState(false)
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading]       = useState(true)
  const ref = useRef(null)

  // Fetch the strategy list; refresh whenever the dropdown opens so
  // newly created strategies always show up as selectable options.
  const fetchStrategies = useCallback(() => {
    strategiesApi.list()
      .then(d => setStrategies(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchStrategies() }, [fetchStrategies])
  useEffect(() => { if (open) fetchStrategies() }, [open, fetchStrategies])

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const allTokens = strategies.map(s => String(s.id))

  // null = everything selected (no filtering)
  const isAll = strategyFilter == null
  const selected = isAll ? allTokens : strategyFilter.map(String)

  function isChecked(token) {
    return isAll || selected.includes(token)
  }

  function toggle(token) {
    let next
    if (isAll) {
      // Converting "all" into an explicit selection minus the toggled one
      next = allTokens.filter(t => t !== token)
    } else if (selected.includes(token)) {
      next = selected.filter(t => t !== token)
    } else {
      next = [...selected, token]
    }
    // Empty or complete selections collapse back to "all" so strategies
    // created later are included automatically and nothing is ever hidden.
    if (next.length === 0 || allTokens.every(t => next.includes(t))) setStrategyFilter(null)
    else setStrategyFilter(next)
  }

  function selectAll() { setStrategyFilter(null) }

  const hasFilter = !isAll
  const activeLabel = (() => {
    if (isAll || selected.length === 0) return 'All strategies'
    if (selected.length === 1) {
      const s = strategies.find(st => String(st.id) === selected[0])
      return s?.name ?? '1 strategy'
    }
    return `${selected.length} strategies`
  })()

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="strategy-filter-btn"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
          hasFilter
            ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-300 hover:border-indigo-500/60'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 hover:border-gray-600'
        }`}
      >
        <Target className="w-4 h-4" />
        <span className="font-medium">{activeLabel}</span>
        {hasFilter && (
          <button
            onClick={e => { e.stopPropagation(); selectAll() }}
            className="text-indigo-400/60 hover:text-indigo-300 transition-colors"
            title="Clear filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          {hasFilter && (
            <div className="p-2 border-b border-gray-700">
              <button
                onClick={selectAll}
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-gray-700/50 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Show all strategies
              </button>
            </div>
          )}

          {/* Strategy checklist */}
          <div className="p-2 max-h-72 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading strategies…</div>
            ) : strategies.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                No strategies yet — create one in the Playbook
              </div>
            ) : (
              strategies.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggle(String(s.id))}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isChecked(String(s.id))
                      ? 'text-gray-200 hover:bg-gray-700'
                      : 'text-gray-500 hover:bg-gray-700'
                  }`}
                >
                  <span className={`w-4 h-4 flex items-center justify-center rounded border transition-colors ${
                    isChecked(String(s.id))
                      ? 'bg-indigo-600 border-indigo-500'
                      : 'bg-gray-900 border-gray-600'
                  }`}>
                    {isChecked(String(s.id)) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="truncate text-left flex-1">{s.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
