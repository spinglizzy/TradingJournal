import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { taxYear, auFY, fyLabel } from '../../../server/lib/dragonEngine.js'
import { inputCls, btnGhost, money, signed, todayStr } from './format.js'

const COLS = [
  ['grossDividends', 'Gross dividends'],
  ['taxWithheld',    'US tax withheld'],
  ['netDividends',   'Net dividends'],
  ['ccNet',          'Net CC premium'],
  ['realized',       'Realised P/L on sells'],
  ['fees',           'Fees'],
]
const NOTE = 'All figures USD. Fees are already reflected in net CC premium, realised P/L and cost base; listed for reference only.'

/** Australian tax year (1 July – 30 June) per holding, exportable for the accountant. */
export default function TaxReport({ rows }) {
  const years = useMemo(() => {
    const s = new Set([auFY(todayStr())])
    rows.forEach(r => r.state.events.forEach(e => s.add(auFY(e.date))))
    return [...s].sort((a, b) => b - a)
  }, [rows])
  const [fy, setFy] = useState(years[0])

  const lines = rows.map(r => ({ ticker: r.h.ticker, ...taxYear(r.state.events, fy) }))
    .filter(l => COLS.some(([k]) => Math.abs(l[k]) > 0.0049))
  const total = Object.fromEntries(COLS.map(([k]) => [k, lines.reduce((s, l) => s + l[k], 0)]))

  function exportCsv() {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`
    const out = [
      [`Dragon portfolio — Australian tax year ${fyLabel(fy)} (1 Jul ${fy - 1} – 30 Jun ${fy})`],
      ['Ticker', ...COLS.map(([, l]) => `${l} (USD)`)],
      ...lines.map(l => [l.ticker, ...COLS.map(([k]) => l[k].toFixed(2))]),
      ['TOTAL', ...COLS.map(([k]) => total[k].toFixed(2))],
      [],
      [NOTE],
    ].map(r => r.map(q).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([out], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `dragon-tax-${fyLabel(fy)}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={fy} onChange={e => setFy(Number(e.target.value))} className={`${inputCls} w-auto`} aria-label="Tax year">
          {years.map(y => <option key={y} value={y}>{fyLabel(y)} (1 Jul {y - 1} – 30 Jun {y})</option>)}
        </select>
        <button type="button" onClick={exportCsv} className={`${btnGhost} flex items-center gap-1.5`}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
            <th className="text-left font-medium px-3 py-2">Ticker</th>
            {COLS.map(([k, l]) => <th key={k} className="text-right font-medium px-3 py-2">{l}</th>)}
          </tr></thead>
          <tbody className="font-mono">
            {lines.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center font-sans text-gray-600">Nothing in {fyLabel(fy)}.</td></tr>}
            {lines.map(l => (
              <tr key={l.ticker} className="border-b border-gray-800/60">
                <td className="px-3 py-2 font-sans text-white">{l.ticker}</td>
                {COLS.map(([k]) => <td key={k} className="px-3 py-2 text-right text-gray-300">{k === 'ccNet' || k === 'realized' ? signed(l[k]) : money(l[k])}</td>)}
              </tr>
            ))}
            {lines.length > 0 && (
              <tr className="font-semibold">
                <td className="px-3 py-2 font-sans text-white">Total</td>
                {COLS.map(([k]) => <td key={k} className="px-3 py-2 text-right text-white">{k === 'ccNet' || k === 'realized' ? signed(total[k]) : money(total[k])}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">{NOTE}</p>
    </div>
  )
}
