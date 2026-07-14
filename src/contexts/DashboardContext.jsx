import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { startOfMonth, endOfMonth, startOfYear, subDays, format } from 'date-fns'
import { useAccount } from './AccountContext.jsx'

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

  return (
    <DashboardContext.Provider value={{ dateRange, setDateRange: updateDateRange, strategyFilter, setStrategyFilter, apiParams }}>
      {children}
    </DashboardContext.Provider>
  )
}
