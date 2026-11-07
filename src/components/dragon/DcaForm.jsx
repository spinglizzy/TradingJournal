import { useState } from 'react'
import { dragonApi } from '../../api/dragon.js'
import { DatePicker } from '../ui/DatePicker.jsx'
import { Field, ErrorBox } from './ui.jsx'
import { inputCls, btnPrimary, btnGhost, money, todayStr } from './format.js'

/** Monthly DCA: one date, a buy line per holding. Blank lines are skipped. */
export default function DcaForm({ holdings, onSaved, onCancel }) {
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState(() => Object.fromEntries(holdings.map(h => [h.id, { shares: '', price: h.current_price ?? '' }])))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const set = (id, p) => setRows(r => ({ ...r, [id]: { ...r[id], ...p } }))

  const buys = holdings.filter(h => rows[h.id].shares !== '').map(h => ({ holding_id: h.id, ...rows[h.id] }))
  const total = buys.reduce((s, b) => s + Number(b.shares) * Number(b.price), 0)

  async function submit(e) {
    e.preventDefault()
    if (!buys.length) return setError('Enter shares for at least one holding')
    if (buys.some(b => !(Number(b.shares) > 0) || !(Number(b.price) > 0))) return setError('Shares and price must be more than 0')
    setSaving(true); setError(null)
    try {
      await dragonApi.batchBuys({ date, buys })
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-gray-500 border-b border-gray-800">
            <th className="text-left font-medium py-2">Ticker</th>
            <th className="text-left font-medium py-2 px-2">Shares</th>
            <th className="text-left font-medium py-2 px-2">Price / share</th>
            <th className="text-right font-medium py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => {
            const r = rows[h.id]
            const t = Number(r.shares) * Number(r.price)
            return (
              <tr key={h.id} className="border-b border-gray-800/60 last:border-0">
                <td className="py-2 font-medium text-white">{h.ticker}</td>
                <td className="py-2 px-2">
                  <input type="number" step="0.000001" min="0" inputMode="decimal" aria-label={`${h.ticker} shares`}
                    value={r.shares} onChange={e => set(h.id, { shares: e.target.value })} className={inputCls} />
                </td>
                <td className="py-2 px-2">
                  <input type="number" step="0.0001" min="0" inputMode="decimal" aria-label={`${h.ticker} price`}
                    value={r.price} onChange={e => set(h.id, { price: e.target.value })} className={inputCls} />
                </td>
                <td className="py-2 text-right font-mono text-gray-300">{r.shares !== '' && Number.isFinite(t) ? money(t) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="text-right text-sm text-gray-400">
        {buys.length} buy(s) · <span className="font-mono font-semibold text-white">{money(total)}</span>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Log buys'}</button>
      </div>
    </form>
  )
}
