import { useState } from 'react'
import { inputCls, money, fmtShares } from './format.js'

const SHARE_TOL = 0.0001
const BASIS_TOL = 0.01

/**
 * Type in what Schwab shows per position; compare against the ledger's shares
 * and Schwab basis (buys + DRIP, nothing deducted). Nothing is saved.
 */
export default function Reconcile({ rows }) {
  const [entered, setEntered] = useState({})
  const set = (id, k, v) => setEntered(e => ({ ...e, [id]: { ...e[id], [k]: v } }))

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Enter Schwab’s quantity and total cost basis for each position. ✅ = within {SHARE_TOL} shares and {money(BASIS_TOL)} of cost basis.
      </p>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
            <th className="text-left font-medium px-3 py-2">Ticker</th>
            <th className="text-right font-medium px-3 py-2">Ledger shares</th>
            <th className="text-left font-medium px-3 py-2">Schwab shares</th>
            <th className="text-right font-medium px-3 py-2">Ledger Schwab basis</th>
            <th className="text-left font-medium px-3 py-2">Schwab cost basis</th>
            <th className="text-center font-medium px-3 py-2">Match</th>
          </tr></thead>
          <tbody>
            {rows.map(({ h, state }) => {
              const e = entered[h.id] ?? {}
              const has = (k) => e[k] !== undefined && e[k] !== ''
              const dShares = has('shares') ? Number(e.shares) - state.shares : null
              const dBasis  = has('basis') ? Number(e.basis) - state.schwabBasis : null
              const filled = dShares != null || dBasis != null
              const ok = filled && (dShares == null || Math.abs(dShares) <= SHARE_TOL + 1e-12) && (dBasis == null || Math.abs(dBasis) <= BASIS_TOL + 1e-9)
              return (
                <tr key={h.id} className="border-b border-gray-800/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-white">{h.ticker}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-300">{fmtShares(state.shares)}</td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.0001" inputMode="decimal" aria-label={`${h.ticker} Schwab shares`}
                      value={e.shares ?? ''} onChange={ev => set(h.id, 'shares', ev.target.value)} className={`${inputCls} py-1 w-28`} />
                    {dShares != null && Math.abs(dShares) > SHARE_TOL && <div className="text-[11px] text-red-400 font-mono">off by {fmtShares(dShares)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-300">{money(state.schwabBasis)}</td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" inputMode="decimal" aria-label={`${h.ticker} Schwab cost basis`}
                      value={e.basis ?? ''} onChange={ev => set(h.id, 'basis', ev.target.value)} className={`${inputCls} py-1 w-28`} />
                    {dBasis != null && Math.abs(dBasis) > BASIS_TOL && <div className="text-[11px] text-red-400 font-mono">off by {money(dBasis)}</div>}
                  </td>
                  <td className="px-3 py-2 text-center text-lg" aria-label={filled ? (ok ? 'matches' : 'does not match') : 'not checked'}>
                    {filled ? (ok ? '✅' : '❌') : <span className="text-gray-700 text-sm">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
