import { useState } from 'react'
import { Upload } from 'lucide-react'
import { dragonApi } from '../../api/dragon.js'
import { ErrorBox } from './ui.jsx'
import { btnPrimary, btnGhost, money, fmtShares, TYPE_LABEL, inputCls } from './format.js'

const LABEL = { ...TYPE_LABEL, CASH_IN: 'Cash in', CASH_OUT: 'Cash out' }
const MAP_CHOICES = ['BUY', 'SELL', 'DRIP', 'DIVIDEND', 'CASH_IN', 'CASH_OUT']

/**
 * Schwab CSV → preview → commit. The preview is the server running the real
 * import and rolling it back, so it's exactly what Commit will write.
 */
export default function ImportModal({ onDone, onCancel }) {
  const [csv, setCsv]           = useState(null)
  const [fileName, setFileName] = useState('')
  const [mappings, setMappings] = useState({})
  const [report, setReport]     = useState(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  async function run(text, maps, commit) {
    setBusy(true); setError(null)
    try {
      const r = await dragonApi.importCsv({ csv: text, mappings: maps, commit })
      if (commit) onDone(r)
      else setReport(r)
    } catch (err) {
      setError(err?.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function pick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsv(text); setFileName(file.name); setMappings({}); setReport(null)
    run(text, {}, false)
  }

  const mapsChanged = report && report.review.some(r => r.mappable && (mappings[r.hash] ?? null) !== (r.mapping ?? null))

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl cursor-pointer text-sm text-gray-400 transition-colors">
        <Upload className="w-4 h-4" />
        {fileName || 'Choose a Schwab transactions CSV'}
        <input type="file" accept=".csv,text/csv" onChange={pick} className="sr-only" />
      </label>

      {busy && <p className="text-sm text-gray-500">Checking…</p>}
      <ErrorBox>{error}</ErrorBox>

      {report && !busy && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Count label="To add" n={report.added.length} cls="text-emerald-400" />
            <Count label="Duplicates skipped" n={report.duplicates} cls="text-gray-300" />
            <Count label="Need review" n={report.review.length} cls={report.review.length ? 'text-amber-400' : 'text-gray-300'} />
          </div>

          {report.createdHoldings.length > 0 && (
            <p className="text-xs text-gray-400">
              New holdings: {report.createdHoldings.map(h => `${h.ticker}${h.pays_dividend ? '' : ' (no dividend)'}`).join(', ')}
            </p>
          )}

          {report.review.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Review — not imported</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
                    <th className="text-left font-medium px-3 py-2">Date</th>
                    <th className="text-left font-medium px-3 py-2">Action / symbol</th>
                    <th className="text-right font-medium px-3 py-2">Amount</th>
                    <th className="text-left font-medium px-3 py-2">Why</th>
                    <th className="text-left font-medium px-3 py-2">Map to</th>
                  </tr></thead>
                  <tbody>
                    {report.review.map(r => (
                      <tr key={`${r.hash}-${r.reason}`} className="border-b border-gray-800/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-gray-400">{r.date}</td>
                        <td className="px-3 py-2 text-white">{r.action} <span className="text-gray-500">{r.symbol}</span></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-300">{money(r.amount)}</td>
                        <td className="px-3 py-2 text-amber-400/90">{r.reason}</td>
                        <td className="px-3 py-2">
                          {r.mappable ? (
                            <select value={mappings[r.hash] ?? ''} onChange={e => setMappings(m => ({ ...m, [r.hash]: e.target.value || undefined }))}
                              className={`${inputCls} py-1 text-xs`} aria-label={`Map ${r.action}`}>
                              <option value="">Skip</option>
                              {MAP_CHOICES.map(c => <option key={c} value={c}>{LABEL[c]}</option>)}
                            </select>
                          ) : <span className="text-gray-600">Fix in Schwab / enter by hand</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mapsChanged && (
                <button type="button" onClick={() => run(csv, mappings, false)} className={`${btnGhost} mt-2`}>Re-check with these mappings</button>
              )}
            </section>
          )}

          {report.added.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Rows to add</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
                    <th className="text-left font-medium px-3 py-2">Date</th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-left font-medium px-3 py-2">Ticker</th>
                    <th className="text-right font-medium px-3 py-2">Shares</th>
                    <th className="text-right font-medium px-3 py-2">Amount</th>
                    <th className="text-right font-medium px-3 py-2">Fees</th>
                  </tr></thead>
                  <tbody className="font-mono">
                    {report.added.map((a, i) => (
                      <tr key={i} className="border-b border-gray-800/60 last:border-0">
                        <td className="px-3 py-1.5 text-gray-400">{a.date}</td>
                        <td className="px-3 py-1.5 font-sans text-white">{LABEL[a.type]}</td>
                        <td className="px-3 py-1.5 font-sans text-gray-300">{a.symbol ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-300">{a.shares ? fmtShares(a.shares) : ''}</td>
                        <td className="px-3 py-1.5 text-right text-gray-300">{money(a.amount)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{a.fees ? money(a.fees) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        <button type="button" disabled={busy || !report || !report.added.length || mapsChanged} onClick={() => run(csv, mappings, true)} className={btnPrimary}
          title={mapsChanged ? 'Re-check first so the preview matches what gets written' : undefined}>
          {report ? `Import ${report.added.length} row(s)` : 'Import'}
        </button>
      </div>
    </div>
  )
}

function Count({ label, n, cls }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3">
      <div className={`text-2xl font-mono font-bold ${cls}`}>{n}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}
