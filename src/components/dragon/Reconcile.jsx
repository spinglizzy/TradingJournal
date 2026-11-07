import { useEffect, useState } from 'react'
import { Upload, Save, ArrowLeft } from 'lucide-react'
import { dragonApi } from '../../api/dragon.js'
import { reconcileMatch, SHARE_TOL, BASIS_TOL } from '../../../server/lib/dragonEngine.js'
import { parsePositions, matchPositions } from '../../../server/lib/schwabPositions.js'
import { ErrorBox } from './ui.jsx'
import { inputCls, btnGhost, btnPrimary, money, fmtShares } from './format.js'

const SOURCE = { manual: 'Typed in', positions_csv: 'Positions CSV' }
const when = (ts) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Compare the ledger with what Schwab shows: shares and the FIFO Schwab basis.
 * Figures come from a Positions export or are typed in; "Save check" stores the
 * result (the server recomputes the ledger side), and the latest saved check
 * pre-fills the panel next time.
 */
export default function Reconcile({ rows }) {
  const [entered, setEntered] = useState({})        // ticker → { shares, basis }
  const [source, setSource]   = useState('manual')
  const [fileInfo, setFileInfo] = useState(null)    // { name, notInLedger, missingFromFile }
  const [history, setHistory] = useState([])
  const [viewing, setViewing] = useState(null)      // a saved check, read-only
  const [msg, setMsg]         = useState(null)
  const [error, setError]     = useState(null)
  const [busy, setBusy]       = useState(false)

  const loadHistory = () => dragonApi.reconciliations().then(setHistory, e => setError(e?.message || 'Failed to load saved checks'))

  // Pre-fill from the latest saved check.
  useEffect(() => {
    dragonApi.reconciliations().then(async (list) => {
      setHistory(list)
      if (!list.length) return
      const latest = await dragonApi.reconciliation(list[0].id)
      setEntered(Object.fromEntries(latest.rows.map(r => [r.ticker, { shares: r.schwab_shares ?? '', basis: r.schwab_basis ?? '' }])))
      setSource(latest.source)
      setMsg(`Pre-filled from your last check (${when(latest.checked_at)}).`)
    }).catch(e => setError(e?.message || 'Failed to load saved checks'))
  }, [])

  const set = (ticker, k, v) => { setSource('manual'); setEntered(e => ({ ...e, [ticker]: { ...e[ticker], [k]: v } })) }

  async function importPositions(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setError(null); setMsg(null)
    try {
      const m = matchPositions(parsePositions(await file.text()), rows.map(r => ({ ticker: r.h.ticker, shares: r.state.shares })))
      setEntered(Object.fromEntries(rows.map(r => [r.h.ticker, m.found[r.h.ticker]
        ? { shares: m.found[r.h.ticker].shares, basis: m.found[r.h.ticker].costBasis ?? '' } : { shares: '', basis: '' }])))
      setSource('positions_csv')
      setFileInfo({ name: file.name, notInLedger: m.notInLedger, missingFromFile: m.missingFromFile })
    } catch (e) {
      setError(e?.message || 'Could not read that positions file')
    }
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const r = await dragonApi.saveReconciliation({ source, rows: rows.map(({ h }) => ({
        ticker: h.ticker, schwab_shares: entered[h.ticker]?.shares ?? '', schwab_basis: entered[h.ticker]?.basis ?? '' })) })
      setMsg(`Saved: ${r.matched}/${r.total} match.`)
      loadHistory()
    } catch (e) {
      setError(e?.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function open(id) {
    try { setViewing(await dragonApi.reconciliation(id)) } catch (e) { setError(e?.message || 'Failed to open that check') }
  }

  if (viewing) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setViewing(null)} className={`${btnGhost} flex items-center gap-1.5`}><ArrowLeft className="w-4 h-4" /> Back</button>
        <p className="text-sm text-gray-400">{when(viewing.checked_at)} · {SOURCE[viewing.source]} · {viewing.rows.filter(r => r.match).length}/{viewing.rows.length} ✅</p>
        <Table>
          {viewing.rows.map(r => (
            <tr key={r.ticker} className="border-b border-gray-800/60 last:border-0">
              <td className="px-3 py-2 font-medium text-white">{r.ticker}</td>
              <td className="px-3 py-2 text-right font-mono text-gray-300">{fmtShares(r.ledger_shares)}</td>
              <td className="px-3 py-2 font-mono text-gray-300">{fmtShares(r.schwab_shares)}</td>
              <td className="px-3 py-2 text-right font-mono text-gray-300">{money(r.ledger_schwab_basis)}</td>
              <td className="px-3 py-2 font-mono text-gray-300">{money(r.schwab_basis)}</td>
              <td className="px-3 py-2 text-center text-lg">{r.match ? '✅' : '❌'}</td>
            </tr>
          ))}
        </Table>
      </div>
    )
  }

  const results = rows.map(({ h, state }) => {
    const e = entered[h.ticker] ?? {}
    const v = (x) => (x === '' || x == null ? null : Number(x))
    const sShares = v(e.shares), sBasis = v(e.basis)
    const filled = sShares != null || sBasis != null
    return { h, state, e, sShares, sBasis, filled, ok: filled && reconcileMatch(state.shares, sShares, state.schwabBasis, sBasis) }
  })
  const filled = results.filter(r => r.filled)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 max-w-xl">
          Schwab basis here = remaining FIFO tax lots (buys + DRIP, less return of capital). ✅ = within {SHARE_TOL} shares and {money(BASIS_TOL)}.
        </p>
        <div className="flex gap-2">
          <label className={`${btnGhost} flex items-center gap-1.5 cursor-pointer`}>
            <Upload className="w-4 h-4" /> Import Schwab positions CSV
            <input type="file" accept=".csv,text/csv" onChange={importPositions} className="sr-only" />
          </label>
          <button type="button" disabled={busy || !filled.length} onClick={save} className={`${btnPrimary} flex items-center gap-1.5`}>
            <Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save check'}
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
      <ErrorBox>{error}</ErrorBox>

      {fileInfo && (
        <div className="text-xs text-gray-400 space-y-1">
          <div>From <span className="text-gray-300">{fileInfo.name}</span>.</div>
          {fileInfo.notInLedger.length > 0 && <div className="text-amber-400">In the file but not in your ledger: {fileInfo.notInLedger.join(', ')}</div>}
          {fileInfo.missingFromFile.length > 0 && <div className="text-amber-400">In your ledger but not in the file: {fileInfo.missingFromFile.join(', ')}</div>}
        </div>
      )}

      <Table>
        {results.map(({ h, state, e, sShares, sBasis, filled: f, ok }) => (
          <tr key={h.id} className="border-b border-gray-800/60 last:border-0">
            <td className="px-3 py-2 font-medium text-white">{h.ticker}</td>
            <td className="px-3 py-2 text-right font-mono text-gray-300">{fmtShares(state.shares)}</td>
            <td className="px-3 py-2">
              <input type="number" step="0.0001" inputMode="decimal" aria-label={`${h.ticker} Schwab shares`}
                value={e.shares ?? ''} onChange={ev => set(h.ticker, 'shares', ev.target.value)} className={`${inputCls} py-1 w-28`} />
              {sShares != null && Math.abs(sShares - state.shares) > SHARE_TOL && <div className="text-[11px] text-red-400 font-mono">off by {fmtShares(sShares - state.shares)}</div>}
            </td>
            <td className="px-3 py-2 text-right font-mono text-gray-300">{money(state.schwabBasis)}</td>
            <td className="px-3 py-2">
              <input type="number" step="0.01" inputMode="decimal" aria-label={`${h.ticker} Schwab cost basis`}
                value={e.basis ?? ''} onChange={ev => set(h.ticker, 'basis', ev.target.value)} className={`${inputCls} py-1 w-28`} />
              {sBasis != null && Math.abs(sBasis - state.schwabBasis) > BASIS_TOL && <div className="text-[11px] text-red-400 font-mono">off by {money(sBasis - state.schwabBasis)}</div>}
            </td>
            <td className="px-3 py-2 text-center text-lg" aria-label={f ? (ok ? 'matches' : 'does not match') : 'not checked'}>
              {f ? (ok ? '✅' : '❌') : <span className="text-gray-700 text-sm">—</span>}
            </td>
          </tr>
        ))}
      </Table>
      {filled.length > 0 && <p className="text-xs text-gray-400">{filled.filter(r => r.ok).length}/{filled.length} match</p>}

      {history.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Saved checks</h3>
          <ul className="divide-y divide-gray-800 bg-gray-900 border border-gray-800 rounded-xl">
            {history.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => open(c.id)} className="w-full flex justify-between px-4 py-2 text-sm hover:bg-gray-800/40 text-left">
                  <span className="text-gray-300">{when(c.checked_at)} <span className="text-gray-500">· {SOURCE[c.source]}</span></span>
                  <span className={`font-mono ${c.matched === c.total ? 'text-emerald-400' : 'text-amber-400'}`}>{c.matched}/{c.total} ✅</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Table({ children }) {
  return (
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
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
