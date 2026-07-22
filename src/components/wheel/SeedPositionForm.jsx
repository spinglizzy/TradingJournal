import { useState } from 'react'
import { TriangleAlert, Info } from 'lucide-react'
import { wheelApi } from '../../api/wheel.js'
import { SHARES_PER_CONTRACT } from './constants.js'

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`
const todayStr = () => new Date().toISOString().slice(0, 10)

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 font-medium mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

/**
 * Open a cycle from shares you were already assigned — a run whose put was
 * never logged here, typically because it predates the tab.
 *
 * The share count and assignment strike are what set your break-even, so both
 * are required. Premium is optional: if you can't reconstruct what you
 * collected, leaving it at zero gives a basis equal to the assignment strike,
 * which is conservative — it will never flatter a strike choice.
 */
export default function SeedPositionForm({ prefill = {}, onSaved, onCancel }) {
  const [form, setForm] = useState({
    ticker:            prefill.ticker            ?? '',
    shares:            prefill.shares            ?? 100,
    assigned_strike:   prefill.assigned_strike   ?? '',
    assigned_at:       prefill.assigned_at       ?? todayStr(),
    premium_collected: prefill.premium_collected ?? '',
    fees:              prefill.fees              ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  const qty       = Math.round(Number(form.shares) || 0)
  const strike    = Number(form.assigned_strike)
  const premium   = Number(form.premium_collected) || 0
  const fees      = Number(form.fees) || 0
  const netPrem   = premium - fees
  const lotsOk    = qty > 0 && qty % SHARES_PER_CONTRACT === 0
  const basis     = lotsOk && strike > 0 ? strike - netPrem / qty : null

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const { cycle } = await wheelApi.createCycle({
        ticker:            String(form.ticker).trim().toUpperCase(),
        shares:            qty,
        assigned_strike:   strike,
        assigned_at:       form.assigned_at,
        premium_collected: premium,
        fees,
      })
      onSaved?.(cycle)
    } catch (err) {
      setError(err?.message || 'Failed to open the cycle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2 px-3 py-2.5 bg-gray-800/40 border border-gray-700 rounded-lg text-xs text-gray-400 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
        <span>
          Use this when you already hold assigned shares whose put was never logged here — then you can
          write covered calls against them. It records the assignment as a closed put leg, exactly as if
          you'd tracked the position from the start.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Ticker">
          <input
            type="text" required value={form.ticker}
            onChange={e => set({ ticker: e.target.value })}
            placeholder="HL" className={`${inputCls} uppercase`}
          />
        </Field>
        <Field
          label="Shares held"
          hint={qty > 0 && !lotsOk
            ? `${qty} is not a multiple of ${SHARES_PER_CONTRACT} — assignment comes in round lots`
            : `= ${qty / SHARES_PER_CONTRACT} contract${qty / SHARES_PER_CONTRACT === 1 ? '' : 's'}`}
        >
          <input
            type="number" step="100" min="100" required value={form.shares}
            onChange={e => set({ shares: e.target.value })}
            className={`${inputCls} ${qty > 0 && !lotsOk ? 'border-amber-500/60' : ''}`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Assignment strike" hint="The price you were put the shares at.">
          <input
            type="number" step="0.01" required inputMode="decimal" placeholder="17.50"
            value={form.assigned_strike} onChange={e => set({ assigned_strike: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Date assigned">
          <input
            type="date" required value={form.assigned_at}
            onChange={e => set({ assigned_at: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Premium collected on that put"
          hint="Total dollars, not per share. Leave blank if you can't reconstruct it."
        >
          <input
            type="number" step="0.01" inputMode="decimal" placeholder="0.00"
            value={form.premium_collected} onChange={e => set({ premium_collected: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Fees on that put">
          <input
            type="number" step="0.01" value={form.fees}
            onChange={e => set({ fees: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      {basis != null && (
        <div className="px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/25">
          <div className="text-xs text-gray-400 mb-0.5">Opening effective basis</div>
          <div className="text-lg font-mono font-semibold text-emerald-400">{money(basis)}</div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            {money(strike)} − {money(netPrem)} / {qty} sh
            {fees > 0 && <span className="text-gray-600"> (premium {money(premium)} less {money(fees)} fees)</span>}
          </div>
        </div>
      )}

      {error && (
        <div className="flex gap-2 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        {onCancel && (
          <button
            type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit" disabled={saving || !lotsOk}
          className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {saving ? 'Opening…' : 'Open cycle'}
        </button>
      </div>
    </form>
  )
}
