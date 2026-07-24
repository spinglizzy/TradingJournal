import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { gateApi } from '../api/gate.js'
import { DEFAULT_FACTORS } from '../lib/gateFactors.js'

const GateContext = createContext(null)

/** `const { openGate } = useGate()` — opens the Pre-Entry Gate from anywhere. */
export function useGate() {
  return useContext(GateContext) ?? {
    isOpen: false, openGate: () => {}, closeGate: () => {},
    factors: DEFAULT_FACTORS, refreshFactors: () => {},
  }
}

/**
 * Holds the gate's open state and prefetches the factor config once per session.
 *
 * The prefetch is the whole point of putting this in a provider: at trigger time
 * the gate must render its full tick-list on the first frame, so it can't be
 * waiting on /gate/factors when it opens.
 */
export function GateProvider({ children }) {
  const [isOpen,  setIsOpen]  = useState(false)
  const [factors, setFactors] = useState(DEFAULT_FACTORS)

  const refreshFactors = useCallback(() => {
    gateApi.factors()
      .then(rows => { if (Array.isArray(rows) && rows.length) setFactors(rows) })
      .catch(() => {})   // keep the bundled defaults — the gate still vetoes
  }, [])

  useEffect(() => { refreshFactors() }, [refreshFactors])

  const openGate  = useCallback(() => setIsOpen(true),  [])
  const closeGate = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, openGate, closeGate, factors, refreshFactors }),
    [isOpen, openGate, closeGate, factors, refreshFactors]
  )
  return <GateContext.Provider value={value}>{children}</GateContext.Provider>
}
