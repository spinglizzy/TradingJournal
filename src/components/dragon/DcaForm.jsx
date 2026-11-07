import { useState } from 'react'
import { dragonApi } from '../../api/dragon.js'
import { DatePicker } from '../ui/DatePicker.jsx'
import { Field, ErrorBox } from './ui.jsx'
import { inputCls, btnPrimary, btnGhost, money, todayStr, splitEqually } from './format.js'

const r6 = (v) => Math.round(v * 1e6) / 1e6

/**
 * Monthly DCA: one date, a buy per ticked holding. "Split equally" fills each
 * dollar amount; price comes from the latest price; shares = amount ÷ price until
 * you type the actual fill.
 */
export default function DcaForm({ holdings, onSaved, onCancel }) {
  const [date, setDate]   = useState(todayStr())
  const [total, setTotal] = useState('300')
  const [rows, setRows]   = useState(() => Object.fromEntries(holdings.map(h => [h.id, {
    on: true, dollars: '', price: h.current_price ?? '', shares: '', sharesTyped: false }])))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  /** Shares follow amount ÷ price until the actual fill is typed in. */
  const withShares = (r) => r.sharesTyped ? r : { ...r, shares: Number(r.dollars) > 0 && Number(r.price) > 0 ? String(r6(Number(r.dollars) / Number(r.price))) : '' }
  const set = (id, p) => setRows(rs => ({ ...rs, [id]: withShares({ ...rs[id], ...p }) }))

  function split() {
    const on = holdings.filter(h => rows[h.id].on)
    const parts = splitEqually(Number(total), on.length)
    setRows(rs => {
      const next = { ...rs }
      on.forEach((h, i) => { next[h.id] = withShares({ ...rs[h.id], dollars: parts[i].toFixed(2), sharesTyped: false }) })
      return next
    })
  }

  const buys = holdings.filter(h => rows[h.id].on && rows[h.id].shares !== '').map(h => ({ holding_id: h.id, shares: rows[h.id].shares, price: rows[h.id].price }))
  const spend = buys.reduce((s, b) => s + Number(b.shares) * Number(b.price), 0)
  const planned = holdings.filter(h => rows[h.id].on).reduce((s, h) => s + (Number(rows[h.id].dollars) || 0), 0)

  async function submit(e) {
    e.preventDefault()
    if (!buys.length) return setError('Tick at least one holding and enter its shares')
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
      <div className="grid grid-cols-3 gap-4 items-end">
        <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Total to invest">
          <input type="number" step="0.01" min="0" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} className={inputCls} />
        </Field>
        <button type="button" onClick={split} disabled={!(Number(total) > 0) || !holdings.some(h => rows[h.id].on)} className={`${btnGhost} h-[38px]`}>
          Split equally across ticked
        </button>
      </div>
      <div className="overflow-x-auto -mx-1 px-1"><table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-[11px] text-gray-500 border-b border-gray-800">
            <th className="w-8" />
            <th className="text-left font-medium py-2">Ticker</th>
            <th className="text-left font-medium py-2 px-1">Amount $</th>
            <th className="text-left font-medium py-2 px-1">Fill price</th>
            <th className="text-left font-medium py-2 px-1">Shares</th>
            <th className="text-right font-medium py-2">Cost</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => {
            const r = rows[h.id]
            const t = Number(r.shares) * Number(r.price)
            return (
              <tr key={h.id} className={`border-b border-gray-800/60 last:border-0 ${r.on ? '' : 'opacity-40'}`}>
                <td className="py-2"><input type="checkbox" checked={r.on} aria-label={`Include ${h.ticker}`} onChange={e => set(h.id, { on: e.target.checked })} /></td>
                <td className="py-2 font-medium text-white">{h.ticker}
                  {h.price_source && <div className="text-[10px] text-gray-600 font-normal">{h.price_source} price</div>}</td>
                <td className="py-2 px-1">
                  <input type="number" step="0.01" min="0" inputMode="decimal" aria-label={`${h.ticker} amount`} disabled={!r.on}
                    value={r.dollars} onChange={e => set(h.id, { dollars: e.target.value })} className={inputCls} />
                </td>
                <td className="py-2 px-1">
                  <input type="number" step="0.0001" min="0" inputMode="decimal" aria-label={`${h.ticker} price`} disabled={!r.on}
                    value={r.price} onChange={e => set(h.id, { price: e.target.value })} className={inputCls} />
                </td>
                <td className="py-2 px-1">
                  <input type="number" step="0.000001" min="0" inputMode="decimal" aria-label={`${h.ticker} shares`} disabled={!r.on}
                    value={r.shares} onChange={e => set(h.id, { shares: e.target.value, sharesTyped: e.target.value !== '' })} className={inputCls} />
                </td>
                <td className="py-2 text-right font-mono text-gray-300">{r.on && r.shares !== '' && Number.isFinite(t) ? money(t) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <div className="text-right text-sm text-gray-400">
        Planned {money(planned)} · {buys.length} buy(s) costing <span className="font-mono font-semibold text-white">{money(spend)}</span>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Log buys'}</button>
      </div>
    </form>
  )
}
