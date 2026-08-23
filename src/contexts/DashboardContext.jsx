import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { startOfMonth, endOfMonth, startOfYear, subDays, format } from 'date-fns'
import { useAccount } from './AccountContext.jsx'
import { statsApi } from '../api/stats.js'

export const DashboardContext = createContext(null)

export function useDashboard() {
  return useContext(DashboardContext)
}

// Resolve a period string to a {from, to} range
export function periodToRange(period, today = new Date()) {
  const fmt = d => format(d, 'yyyy-MM-dd')
  switch (period) {
    case 'last7':   return { from: fmt(subDays(today, 6)),        to: fmt(today) }
    case 'last30':  return { from: fmt(subDays(today, 29)),       to: fmt(today) }
    case 'mtd':     return { from: fmt(startOfMonth(today)),      to: fmt(today) }
    case 'ytd':     return { from: fmt(startOfYear(today)),       to: fmt(today) }
    case 'all':
    default:        return { from: null, to: null }
  }
}

// Strategy filter: null = all strategies (no filtering, new strategies included
// automatically); otherwise a non-empty array of strategy ids to show.
const STRATEGY_FILTER_KEY = 'dashboard_strategy_filter'

function loadStrategyFilter() {
  try {
    const saved = localStorage.getItem(STRATEGY_FILTER_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Drop legacy 'null' (unassigned) tokens; an empty selection means "all"
      if (Array.isArray(parsed)) {
        const ids = parsed.filter(t => t !== 'null')
        if (ids.length) return ids
      }
    }
  } catch {}
  return null
}

export function DashboardProvider({ children }) {
  const { selectedAccountId } = useAccount()
  const [dateRange, setDateRangeState] = useState({ from: null, to: null })
  const [strategyFilter, setStrategyFilterState] = useState(loadStrategyFilter)

  const updateDateRange = useCallback((range) => {
    setDateRangeState({ from: range.from ?? null, to: range.to ?? null })
  }, [])

  const setStrategyFilter = useCallback((selection) => {
    setStrategyFilterState(selection)
    try {
      if (selection == null) localStorage.removeItem(STRATEGY_FILTER_KEY)
      else localStorage.setItem(STRATEGY_FILTER_KEY, JSON.stringify(selection))
    } catch {}
  }, [])

  // apiParams merges the date range with the currently selected account
  // Widgets pass apiParams to all API calls to get automatic account + date + strategy filtering.
  const apiParams = useMemo(() => ({
    ...dateRange,
    ...(selectedAccountId != null ? { account_id: selectedAccountId } : {}),
    ...(strategyFilter != null && strategyFilter.length
      ? { strategy_ids: strategyFilter.join(',') }
      : {}),
  }), [dateRange, selectedAccountId, strategyFilter])

  // Five summary widgets render off the same /stats/summary payload, and each one
  // used to fire its own identical request on mount. This dedupes them onto one
  // in-flight promise per parameter set. The cache is a ref on the provider, so it
  // lives exactly as long as the dashboard is mounted — navigating away and back
  // gets a new provider, an empty cache, and a fresh fetch.
  const summaryCache = useRef(new Map())

  const fetchSummary = useCallback((params) => {
    const key = [params.from, params.to, params.account_id, params.strategy_ids].join('|')
    const hit = summaryCache.current.get(key)
    if (hit) return hit

    const p = statsApi.summary(params)
    summaryCache.current.set(key, p)
    // A rejection must not stay cached, or every widget is stuck on the failure
    // until the dashboard unmounts.
    p.catch(() => { if (summaryCache.current.get(key) === p) summaryCache.current.delete(key) })
    return p
  }, [])

  return (
    <DashboardContext.Provider value={{ dateRange, setDateRange: updateDateRange, strategyFilter, setStrategyFilter, apiParams, fetchSummary }}>
      {children}
    </DashboardContext.Provider>
  )
}

// Shared reader for /stats/summary. Every caller keeps its own loading and error
// state; only the request itself is shared. The dep list is the four primitives
// rather than apiParams itself, so re-selecting the same date preset (which builds
// a fresh dateRange object) does not trigger a refetch — same as before.
export function useSummary() {
  const { apiParams, fetchSummary } = useDashboard()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetchSummary(apiParams)
      .then(d  => { if (live) { setData(d); setError(null) } })
      .catch(e => { if (live) setError(e) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [fetchSummary, apiParams.from, apiParams.to, apiParams.account_id, apiParams.strategy_ids])

  return { data, loading, error }
}
