import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, TriangleAlert } from 'lucide-react'
import { auFY, fyLabel } from '../../../server/lib/dragonEngine.js'
import { taxLines } from '../../../server/lib/fx.js'
import { dragonApi } from '../../api/dragon.js'
import { ErrorBox } from './ui.jsx'
import { inputCls, btnGhost, money, todayStr } from './format.js'

const TOTALS = [
  ['grossDividends', 'Gross dividends'],
  ['tax',            'US tax withheld'],
  ['dividend',       'Net dividends'],
  ['roc',            'Return of capital'],
  ['rocGain',        'Capital gain: ROC above cost base'],
  ['cc',             'Net CC premium'],
  ['realized',       'Realised P/L on sells'],
  ['fees',           'Fees'],
]
const NOTE = 'AUD converted per transaction at the RBA F11.1 AUD/USD rate for that date (weekends/holidays: prior business day). '
  + 'Fees are already reflected in net CC premium, realised P/L and cost base; listed for reference. Return of capital is not dividend income; '
  + 'ROC beyond a lot’s cost base (or reclassified for shares already sold) is a capital gain.'
const aud = (v) => (v == null ? '—' : `A${money(v)}`)

/** Australian tax year (1 July – 30 June): every money line with the RBA rate used, totals in USD and AUD. */
export default function TaxReport({ rows }) {
  const years = useMemo(() => {
    const s = new Set([auFY(todayStr())])
    rows.forEach(r => r.state.events.forEach(e => s.add(auFY(e.date))))
    return [...s].sort((a, b) => b - a)
  }, [rows])
  const [fy, setFy] = useState(years[0])
  const [rates, setRates] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [error, setError] = useState(null)
  const [manual, setManual] = useState({})   // date → typed rate

  const loadRates = useCallback(() => dragonApi.fxRates(`${fy - 1}-07-01`).then(
    r => { setRates(r.rates); setFetchError(r.fetchError) },
    e => setError(e?.message || 'Failed to load exchange rates'),
  ), [fy])
  useEffect(() => { loadRates() }, [loadRates])

  const rep = useMemo(() => rates && taxLines(rows.map(r => ({ ticker: r.h.ticker, events: r.state.events })), fy, rates), [rows, fy, rates])

  async function saveRate(date) {
    setError(null)
    try { await dragonApi.setFxRate({ date, aud_usd: manual[date] }); setManual(m => ({ ...m, [date]: '' })); loadRates() }
    catch (e) { setError(e?.message || 'Failed to save rate') }
  }

  function exportCsv() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const n = (v, d = 2) => (v == null ? '' : v.toFixed(d))
    const out = [
      [`Dragon portfolio — Australian tax year ${fyLabel(fy)} (1 Jul ${fy - 1} – 30 Jun ${fy})`], [],
      ['Date', 'Ticker', 'Type', 'USD', 'AUD/USD rate used', 'Rate date', 'AUD', 'Rate note'],
      ...rep.lines.map(l => [l.date, l.ticker, l.type, n(l.usd), n(l.rate, 4), l.rateDate, n(l.aud),
        l.missing ? 'MISSING — no rate' : l.manual ? 'Manual rate' : l.rateDate !== l.date ? 'Prior business day' : '']),
      [], ['Totals', '', '', 'USD', '', '', 'AUD'],
      ...TOTALS.map(([k, label]) => [label, '', '', n(rep.totals.usd[k]), '', '', n(rep.totals.aud[k])]),
      [], [NOTE],
      ...(rep.missing.length ? [[`WARNING: no rate for ${rep.missing.join(', ')} — AUD totals exclude those lines.`]] : []),
    ].map(r => r.map(q).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([out], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: `dragon-tax-${fyLabel(fy)}.csv` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={fy} onChange={e => setFy(Number(e.target.value))} className={`${inputCls} w-auto`} aria-label="Tax year">
          {years.map(y => <option key={y} value={y}>{fyLabel(y)} (1 Jul {y - 1} – 30 Jun {y})</option>)}
        </select>
        <button type="button" disabled={!rep} onClick={exportCsv} className={`${btnGhost} flex items-center gap-1.5`}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {fetchError && <p className="text-xs text-amber-400">{fetchError}</p>}
      {!rep ? <p className="text-sm text-gray-500">Loading RBA rates…</p> : (
        <>
          {rep.missing.length > 0 && (
            <div className="px-4 py-3 bg-amber-900/15 border border-amber-800/40 rounded-lg space-y-2">
              <p className="text-xs text-amber-400 flex gap-1.5"><TriangleAlert className="w-4 h-4 shrink-0" />
                No RBA rate yet for these dates. Enter one (US$ per A$1) to convert them; it'll be flagged as manual.</p>
              {rep.missing.map(d => (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-gray-300 w-28">{d}</span>
                  <input type="number" step="0.0001" min="0" placeholder="0.6550" aria-label={`Rate for ${d}`}
                    value={manual[d] ?? ''} onChange={e => setManual(m => ({ ...m, [d]: e.target.value }))} className={`${inputCls} py-1 w-32`} />
                  <button type="button" disabled={!(Number(manual[d]) > 0)} onClick={() => saveRate(d)} className={`${btnGhost} py-1`}>Save rate</button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
                <th className="text-left font-medium px-3 py-2">{fyLabel(fy)} totals</th>
                <th className="text-right font-medium px-3 py-2">USD</th>
                <th className="text-right font-medium px-3 py-2">AUD</th>
              </tr></thead>
              <tbody className="font-mono">
                {TOTALS.map(([k, label]) => (
                  <tr key={k} className="border-b border-gray-800/60 last:border-0">
                    <td className="px-3 py-1.5 font-sans text-gray-300">{label}</td>
                    <td className="px-3 py-1.5 text-right text-gray-300">{money(rep.totals.usd[k])}</td>
                    <td className="px-3 py-1.5 text-right text-white">{aud(rep.totals.aud[k])}{rep.missing.length > 0 && <span className="text-amber-400">*</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900"><tr className="text-[11px] text-gray-500 border-b border-gray-800">
                <th className="text-left font-medium px-3 py-2">Date</th>
                <th className="text-left font-medium px-3 py-2">Ticker</th>
                <th className="text-left font-medium px-3 py-2">Type</th>
                <th className="text-right font-medium px-3 py-2">USD</th>
                <th className="text-right font-medium px-3 py-2">Rate used</th>
                <th className="text-right font-medium px-3 py-2">AUD</th>
              </tr></thead>
              <tbody className="font-mono">
                {rep.lines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center font-sans text-gray-600">Nothing in {fyLabel(fy)}.</td></tr>}
                {rep.lines.map((l, i) => (
                  <tr key={i} className={`border-b border-gray-800/60 last:border-0 ${l.missing ? 'bg-amber-900/10' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-400">{l.date}</td>
                    <td className="px-3 py-1.5 font-sans text-white">{l.ticker}</td>
                    <td className="px-3 py-1.5 font-sans text-gray-300">{l.type}</td>
                    <td className="px-3 py-1.5 text-right text-gray-300">{money(l.usd)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-400" title={l.rateDate && l.rateDate !== l.date ? `Rate from ${l.rateDate}` : undefined}>
                      {l.missing ? <span className="text-amber-400 font-sans">missing</span> : l.rate.toFixed(4)}
                      {l.manual && <span className="ml-1 text-amber-400 font-sans">manual</span>}
                      {!l.missing && l.rateDate !== l.date && <span className="ml-1 text-gray-600 font-sans">({l.rateDate.slice(5)})</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white">{aud(l.aud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500">{NOTE}{rep.missing.length > 0 && ' * AUD totals exclude lines without a rate.'}</p>
        </>
      )}
    </div>
  )
}
