import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { wheelApi } from '../../api/wheel.js'
import { DatePicker } from '../ui/DatePicker.jsx'
import { SHARES_PER_CONTRACT } from './constants.js'
import FeeField, { useAutoFee } from './FeeField.jsx'
import { optionOrderFee, feeBreakdown } from '../../lib/commissions.js'
import { useCommissions } from '../../lib/useCommissions.js'

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
 * Log a wheel option leg — or, given `leg`, correct one that is still open.
 *
 * Writes to the same `trades` table as every other trade, tagged
 * `strategy_tag = 'wheel'` — one entry, one place it lives.
 *
 * Premium is entered as the quoted contract price (0.30) and stored as the total
 * dollars for the leg (0.30 × 100 × contracts). The unit label is persistent and
 * the computed total is shown live, because misreading that quote is the
 * likeliest data-entry error in the whole feature.
 *
 * Editing keeps the ticker fixed: moving a leg to another ticker means moving it
 * to another cycle, which is a different operation from fixing a typo. Delete and
 * re-log for that.
 */
export default function LegForm({ leg, prefill = {}, lockTicker, snapshot, onSaved, onCancel }) {
  const editing = !!leg
  // Stored premium is the leg TOTAL; the form works in the broker's quoted
  // contract price, so convert back through the contract count it was saved with.
  const quotedFromLeg = () => {
    const shares = (Number(leg.contracts) || 0) * SHARES_PER_CONTRACT
    if (!(shares > 0)) return ''
    // Round the division back to a quotable price — 30/100 must read 0.3, not
    // 0.30000000000000004 in the input the user is about to re-submit.
    return Math.round((Number(leg.premium) / shares) * 1e4) / 1e4
  }

  const [form, setForm] = useState(() => editing ? {
    ticker:      leg.ticker,
    option_type: leg.option_type ?? 'put',
    strike:      leg.strike ?? '',
    expiry:      leg.expiry ?? '',
    contracts:   leg.contracts ?? 1,
    premium:     quotedFromLeg(),
    date:        leg.date ?? todayStr(),
    notes:       leg.notes ?? '',
  } : {
    ticker:      prefill.ticker      ?? '',
    option_type: prefill.option_type ?? 'put',
    strike:      prefill.strike      ?? '',
    expiry:      prefill.expiry      ?? '',
    contracts:   prefill.contracts   ?? 1,
    premium:     prefill.premium     ?? '',
    date:        prefill.date        ?? todayStr(),
    notes:       prefill.notes       ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const cfg = useCommissions()

  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  const contracts   = Math.max(0, Math.round(Number(form.contracts) || 0))
  const shares      = contracts * SHARES_PER_CONTRACT
  // Editing shows what the leg was actually charged; a new leg follows the rate
  // card and re-prices as the contract count changes.
  const fee = useAutoFee(optionOrderFee(contracts, cfg), { initial: editing ? leg.fees : (prefill.fees ?? null) })
  const quoted      = Number(form.premium)
  const totalPremium = Number.isFinite(quoted) && form.premium !== '' ? quoted * shares : null

  async function submit(e) {
    e.preventDefault()
    // DatePicker is a button, not an <input required> — the browser can't guard
    // these two, so check them here rather than posting a half-empty leg.
    if (!form.expiry) return setError('Expiry is required')
    if (!form.date)   return setError('Date opened is required')
    setSaving(true)
    setError(null)
    try {
      const body = {
        option_type: form.option_type,
        strike:      Number(form.strike),
        expiry:      form.expiry,
        contracts,
        premium:     totalPremium,   // TOTAL dollars for the leg
        date:        form.date,
        fees:        fee.amount,
        notes:       form.notes || null,
      }
      const saved = editing
        ? await wheelApi.updateLeg(leg.id, body)
        : await wheelApi.createLeg({
            ...body,
            ticker: String(form.ticker).trim().toUpperCase(),
            strike_selection_snapshot: snapshot ?? null,
          })
      onSaved?.(saved.leg)
    } catch (err) {
      // Save failures must surface — never swallow them into a silent no-op.
      setError(err?.message || (editing ? 'Failed to save changes' : 'Failed to save leg'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ticker" hint={editing ? 'Fixed — the leg belongs to this ticker’s cycle.' : undefined}>
          <input
            type="text" required value={form.ticker} disabled={editing || !!lockTicker}
            onChange={e => set({ ticker: e.target.value })}
            placeholder="HL"
            className={`${inputCls} uppercase disabled:opacity-60`}
          />
        </Field>
        <Field
          label="Type"
          hint={editing && form.option_type !== leg.option_type
            ? `Changing ${leg.option_type === 'put' ? 'cash-secured put → covered call' : 'covered call → cash-secured put'}`
            : undefined}
        >
          <select
            value={form.option_type} onChange={e => set({ option_type: e.target.value })}
            className={`${inputCls} ${editing && form.option_type !== leg.option_type ? 'border-amber-500/60' : ''}`}
          >
            <option value="put">Cash-secured put</option>
            <option value="call">Covered call</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Strike">
          <input
            type="number" step="0.01" required inputMode="decimal" placeholder="17.50"
            value={form.strike} onChange={e => set({ strike: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Expiry">
          <DatePicker
            value={form.expiry}
            onChange={val => set({ expiry: val })}
            placeholder="Pick expiry"
          />
        </Field>
        <Field label="Contracts" hint={`= ${shares} shares`}>
          <input
            type="number" step="1" min="1" required
            value={form.contracts} onChange={e => set({ contracts: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      <Field
        label="Premium received"
        hint="Credit for selling to open. Enter the contract price your broker quotes (0.30), not the dollar total."
      >
        <div className="relative">
          <input
            type="number" step="0.01" required inputMode="decimal" placeholder="0.30"
            value={form.premium} onChange={e => set({ premium: e.target.value })}
            className={`${inputCls} pr-24`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">
            $ / contract
          </span>
        </div>
        {totalPremium != null && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/25">
            <span className="text-xs text-gray-400">Total credit for this leg</span>
            <span className="ml-2 text-sm font-mono font-semibold text-emerald-400">
              {money(totalPremium)}
            </span>
            <span className="ml-2 text-[11px] text-gray-500 font-mono">
              {money(quoted)} × {shares} sh
            </span>
          </div>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date opened">
          <DatePicker
            value={form.date}
            onChange={val => set({ date: val })}
            placeholder="Pick a date"
          />
        </Field>
        <FeeField
          label="Commission" fee={fee}
          breakdown={feeBreakdown(contracts, cfg)}
        />
      </div>

      <Field label="Notes">
        <textarea
          rows={2} value={form.notes} onChange={e => set({ notes: e.target.value })}
          placeholder="Why this strike?"
          className={`${inputCls} resize-none`}
        />
      </Field>

      {snapshot && (
        <p className="text-[11px] text-indigo-400/80">
          The strike comparison that produced this choice will be saved with the leg.
        </p>
      )}

      {error && (
        <div className="flex gap-2 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
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
          type="submit" disabled={saving}
          className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Log leg'}
        </button>
      </div>
    </form>
  )
}
