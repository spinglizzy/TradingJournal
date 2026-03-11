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

export function DashboardProvider({ children }) {
  const { selectedAccountId } = useAccount()
  const [dateRange, setDateRangeState] = useState({ from: null, to: null })

  const updateDateRange = useCallback((range) => {
    setDateRangeState({ from: range.from ?? null, to: range.to ?? null })
  }, [])

  // apiParams merges the date range with the currently selected account
  // Widgets pass apiParams to all API calls to get automatic account + date filtering
  const apiParams = useMemo(() => ({
    ...dateRange,
    ...(selectedAccountId != null ? { account_id: selectedAccountId } : {}),
  }), [dateRange, selectedAccountId])

  return (
    <DashboardContext.Provider value={{ dateRange, setDateRange: updateDateRange, apiParams }}>
      {children}
    </DashboardContext.Provider>
  )
}
