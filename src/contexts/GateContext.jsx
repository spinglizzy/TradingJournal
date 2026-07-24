import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { gateApi } from '../api/gate.js'
import { DEFAULT_FACTORS } from '../lib/gateFactors.js'

const GateContext = createContext(null)

/** `const { factors, refreshFactors } = useGate()` */
export function useGate() {
  return useContext(GateContext) ?? { factors: DEFAULT_FACTORS, refreshFactors: () => {} }
}

/**
 * Prefetches the gate's factor config once per session.
 *
 * The prefetch is the whole point of the provider: the gate must render its full
 * tick-list on the first frame, so it can't be waiting on /gate/factors when the
 * premarket plan opens. It's also shared — the panel and the review view read
 * the same list, and a factor pruned in one updates the other.
 */
export function GateProvider({ children }) {
  const [factors, setFactors] = useState(DEFAULT_FACTORS)

  const refreshFactors = useCallback(() => {
    gateApi.factors()
      .then(rows => { if (Array.isArray(rows) && rows.length) setFactors(rows) })
      .catch(() => {})   // keep the bundled defaults — the gate still vetoes
  }, [])

  useEffect(() => { refreshFactors() }, [refreshFactors])

  const value = useMemo(() => ({ factors, refreshFactors }), [factors, refreshFactors])
  return <GateContext.Provider value={value}>{children}</GateContext.Provider>
}
