import { useState } from 'react'
import { Flag, Pencil, TriangleAlert } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import { DatePicker } from '../ui/DatePicker.jsx'
import { wheelApi } from '../../api/wheel.js'
import LegForm from './LegForm.jsx'
import { SHARES_PER_CONTRACT } from './constants.js'

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Number(v)).toFixed(2)}`
const todayStr = () => new Date().toISOString().slice(0, 10)

const btn = 'px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap'

/**
 * Quick actions on an open leg. These are lifecycle events, not new trades —
 * marking an outcome updates the cycle's lots, basis and P&L (spec §7).
 */
export default function LegActions({ leg, onDone, compact }) {
  const [busy, setBusy]   = useState(null)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // 'roll' | 'close' | 'edit'

  if (leg.leg_status !== 'open') return null

  async function run(kind, fn) {
    setBusy(kind); setError(null)
    try {
      await fn()
      setModal(null)
      onDone?.()
    } catch (err) {
      setError(err?.message || 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const isPut = leg.option_type === 'put'

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button" disabled={!!busy}
          onClick={() => run('expire', () => wheelApi.expire(leg.id, { date: leg.expiry }))}
          className={`${btn} border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40`}
        >
          Expired
        </button>

        {isPut ? (
          <button
            type="button" disabled={!!busy}
            onClick={() => run('assign', () => wheelApi.assign(leg.id, { date: leg.expiry }))}
            className={`${btn} border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40`}
          >
            Assigned
          </button>
        ) : (
          <button
            type="button" disabled={!!busy}
            onClick={() => run('call', () => wheelApi.callAway(leg.id, { date: leg.expiry }))}
            className={`${btn} border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40`}
          >
            Called away
          </button>
        )}

        <button
          type="button" disabled={!!busy} onClick={() => setModal('roll')}
          className={`${btn} border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-40`}
        >
          Roll
        </button>
        <button
          type="button" disabled={!!busy} onClick={() => setModal('close')}
          className={`${btn} border-violet-500/40 text-violet-400 hover:bg-violet-500/10 disabled:opacity-40`}
        >
          Buy to close
        </button>

        <button
          type="button" disabled={!!busy} onClick={() => { setError(null); setModal('edit') }}
          title="Fix the details of this leg — including put/call if it was logged as the wrong type"
          className={`${btn} flex items-center gap-1 border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 disabled:opacity-40`}
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>

        {!compact && (
          <button
            type="button" disabled={!!busy}
            onClick={() => run('flag', () => wheelApi.flagLeg(leg.id, !leg.needs_roll))}
            title={leg.needs_roll ? 'Clear the roll flag' : 'Flag this leg as needing a roll'}
            className={`${btn} flex items-center gap-1 disabled:opacity-40 ${
              leg.needs_roll
                ? 'border-orange-500/50 text-orange-400 bg-orange-500/10'
                : 'border-gray-700 text-gray-500 hover:text-orange-400 hover:border-orange-500/40'
            }`}
          >
            <Flag className="w-3 h-3" />
            {leg.needs_roll ? 'Flagged' : 'Flag'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex gap-2 mt-2 px-3 py-2 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
          {error}
        </div>
      )}

      <RollModal
        open={modal === 'roll'} leg={leg} busy={busy === 'roll'} error={error}
        onClose={() => { setModal(null); setError(null) }}
        onSubmit={(body) => run('roll', () => wheelApi.roll(leg.id, body))}
      />
      <CloseModal
        open={modal === 'close'} leg={leg} busy={busy === 'close'} error={error}
        onClose={() => { setModal(null); setError(null) }}
        onSubmit={(body) => run('close', () => wheelApi.close(leg.id, body))}
      />

      {/* LegForm owns its own saving/error state, so this one just opens and closes. */}
      <Modal
        isOpen={modal === 'edit'}
        onClose={() => setModal(null)}
        title={`Edit ${leg.ticker} leg`}
        size="md"
      >
        <LegForm
          leg={leg}
          onSaved={() => { setModal(null); onDone?.() }}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </>
  )
}

/** Quoted-contract-price input that shows the total, mirroring the premium entry rule. */
function CostField({ label, value, onChange, shares, hint }) {
  const per = Number(value)
  const total = value !== '' && Number.isFinite(per) ? per * shares : null
  return (
    <div>
      <label className="block text-xs text-gray-400 font-medium mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number" step="0.01" min="0" required inputMode="decimal" placeholder="0.12"
          value={value} onChange={e => onChange(e.target.value)}
          className={`${inputCls} pr-24`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">
          $ / contract
        </span>
      </div>
      {total != null && (
        <p className="text-[11px] text-gray-500 mt-1 font-mono">= {money(total)} total × {shares} sh</p>
      )}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

function RollModal({ open, leg, busy, error, onClose, onSubmit }) {
  const shares = (leg.contracts || 0) * SHARES_PER_CONTRACT
  const [closeCost, setCloseCost] = useState('')
  const [strike, setStrike]       = useState(leg.strike ?? '')
  const [expiry, setExpiry]       = useState('')
  const [premium, setPremium]     = useState('')
  const [date, setDate]           = useState(todayStr())

  const [dateError, setDateError] = useState(null)

  const debit  = Number(closeCost) * shares
  const credit = Number(premium) * shares
  const net    = (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? debit : 0)
  const ready  = closeCost !== '' && premium !== '' && strike !== '' && expiry !== ''

  return (
    <Modal isOpen={open} onClose={onClose} title={`Roll ${leg.ticker} ${leg.strike} ${leg.option_type === 'put' ? 'put' : 'call'}`} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // DatePicker is a button, not an <input required> — guard here instead.
          if (!expiry) return setDateError('New expiry is required')
          if (!date)   return setDateError('Date rolled is required')
          setDateError(null)
          onSubmit({
            close_cost: Number(closeCost) * shares,
            strike: Number(strike),
            expiry,
            premium: Number(premium) * shares,
            contracts: leg.contracts,
            date,
          })
        }}
        className="space-y-4"
      >
        <p className="text-xs text-gray-500 leading-relaxed">
          Buying the current leg back and selling a new one. The buy-to-close debit is recorded against
          this leg, so a roll that costs more than it brings in correctly pulls the cycle's net premium
          down instead of quietly inflating it.
        </p>

        <CostField
          label="Buy-to-close cost" value={closeCost} onChange={setCloseCost} shares={shares}
          hint="What you pay to close the existing leg. Enter 0 if it closed for nothing."
        />

        <div className="border-t border-gray-800 pt-4 space-y-4">
          <h4 className="text-xs font-semibold text-gray-300">New leg</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">New strike</label>
              <input type="number" step="0.01" required value={strike}
                onChange={e => setStrike(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">New expiry</label>
              <DatePicker value={expiry} onChange={setExpiry} placeholder="Pick expiry" />
            </div>
          </div>
          <CostField label="New premium received" value={premium} onChange={setPremium} shares={shares} />
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-1.5">Date rolled</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>

        {ready && (
          <div className={`px-3 py-2 rounded-lg border ${
            net >= 0 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
          }`}>
            <span className="text-xs text-gray-400">Net for this roll</span>
            <span className={`ml-2 text-sm font-mono font-semibold ${net >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {net >= 0 ? '+' : ''}{money(net)}
            </span>
            {net < 0 && <span className="ml-2 text-[11px] text-amber-400/80">net debit — basis will rise</span>}
          </div>
        )}

        {(error || dateError) && (
          <div className="flex gap-2 px-3 py-2 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />{error || dateError}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="px-5 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg transition-colors">
            {busy ? 'Rolling…' : 'Roll leg'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CloseModal({ open, leg, busy, error, onClose, onSubmit }) {
  const shares = (leg.contracts || 0) * SHARES_PER_CONTRACT
  const [closeCost, setCloseCost] = useState('')
  const [date, setDate] = useState(todayStr())
  const [dateError, setDateError] = useState(null)

  const kept = Number(leg.premium) - Number(closeCost) * shares

  return (
    <Modal isOpen={open} onClose={onClose} title={`Buy back ${leg.ticker} ${leg.strike} ${leg.option_type === 'put' ? 'put' : 'call'}`} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // DatePicker is a button, not an <input required> — guard here instead.
          if (!date) return setDateError('Date closed is required')
          setDateError(null)
          onSubmit({ close_cost: Number(closeCost) * shares, date })
        }}
        className="space-y-4"
      >
        <CostField label="Buy-to-close cost" value={closeCost} onChange={setCloseCost} shares={shares} />

        {closeCost !== '' && (
          <div className={`px-3 py-2 rounded-lg border ${
            kept >= 0 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
          }`}>
            <span className="text-xs text-gray-400">Premium kept on this leg</span>
            <span className={`ml-2 text-sm font-mono font-semibold ${kept >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {kept >= 0 ? '+' : ''}{money(kept)}
            </span>
            <span className="ml-2 text-[11px] text-gray-500 font-mono">
              {money(leg.premium)} credit − {money(Number(closeCost) * shares)} debit
            </span>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Date closed</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {(error || dateError) && (
          <div className="flex gap-2 px-3 py-2 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />{error || dateError}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors">
            {busy ? 'Closing…' : 'Buy to close'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Sell shares — the whole lot (abandon the wheel) or a slice of it.
 *
 * A partial sale keeps its gain in the position instead of booking it, so the
 * effective basis of the shares left behind falls. Mirrors `retainGain` in
 * server/lib/wheelEngine.js; the server is still the one that computes it, this
 * only previews the number so the size of the trim can be chosen against it.
 */
export function SellSharesModal({ open, cycle, onClose, onDone }) {
  const [price, setPrice]   = useState('')
  const [shares, setShares] = useState('')
  const [date, setDate]     = useState(todayStr())
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  // Re-mounted per cycle by the `key` on the call site, so the fields start
  // empty (= sell everything) each time the modal is opened on a position.
  if (!cycle) return null

  const held  = Number(cycle.shares)
  const strike = Number(cycle.avg_assigned_strike)
  const netPremium = Number(cycle.net_premium)

  const qtyRaw = shares === '' ? held : Math.round(Number(shares))
  const qtyOk  = Number.isFinite(qtyRaw) && qtyRaw > 0 && qtyRaw <= held
  const qty    = qtyOk ? qtyRaw : held
  const remaining = held - qty
  const partial   = qtyOk && remaining > 0

  const priceNum = Number(price)
  const priced   = price !== '' && Number.isFinite(priceNum) && priceNum > 0
  const proceeds = priceNum * qty

  const basisNow = held > 0 ? strike - netPremium / held : null
  // Gain on the shares that leave stays with the cycle, so the survivors carry
  // the whole premium: B_new = strike − (net premium + gain) / remaining.
  const gain     = qty * (priceNum - strike)
  const newBasis = priced && partial ? strike - (netPremium + gain) / remaining : null

  // Full exit: everything books, so show the lifetime P&L of the cycle instead.
  const estimate = priced && !partial
    ? held * (priceNum - strike) + netPremium
    : null

  async function submit(e) {
    e.preventDefault()
    // DatePicker is a button, not an <input required> — guard here instead.
    if (!date) return setError('Date sold is required')
    if (!qtyOk) return setError(`Shares to sell must be between 1 and ${held}`)
    setBusy(true); setError(null)
    try {
      await wheelApi.sellShares(cycle.id, { price: priceNum, shares: qty, date })
      onDone?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to record the sale')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={`Sell ${cycle.ticker} shares`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          {partial
            ? <>Trimming {qty} of {held} shares. The gain stays in the position and pulls your effective
                basis down on the {remaining} you keep — it books when the cycle finally goes flat.</>
            : <>Selling all {held} shares abandons the wheel on {cycle.ticker} and closes the cycle at your
                sale price. Close or roll any open covered calls first.</>}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-1.5">Shares to sell</label>
            <input type="number" step="1" min="1" max={held} inputMode="numeric" placeholder={String(held)}
              value={shares} onChange={e => setShares(e.target.value)} className={inputCls} />
            <div className="flex items-center gap-1.5 mt-1.5">
              {[0.25, 0.5, 0.75].map(f => {
                const n = Math.round(held * f / SHARES_PER_CONTRACT) * SHARES_PER_CONTRACT || SHARES_PER_CONTRACT
                return n < held ? (
                  <button key={f} type="button" onClick={() => setShares(String(n))}
                    className="px-1.5 py-0.5 text-[10px] font-mono text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors">
                    {n}
                  </button>
                ) : null
              })}
              <button type="button" onClick={() => setShares(String(held))}
                className="px-1.5 py-0.5 text-[10px] font-mono text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors">
                all {held}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 font-medium mb-1.5">Sale price per share</label>
            <input type="number" step="0.01" min="0.01" required inputMode="decimal" placeholder="16.40"
              value={price} onChange={e => setPrice(e.target.value)} className={inputCls} />
            {priced && (
              <p className="text-[11px] text-gray-500 mt-1.5 font-mono">
                = {money(proceeds)} on {qty} sh
              </p>
            )}
          </div>
        </div>

        {newBasis != null && (
          <div className={`px-3 py-2 rounded-lg border ${
            newBasis <= basisNow ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
          }`}>
            <span className="text-xs text-gray-400">New effective basis on {remaining} shares</span>
            <span className={`ml-2 text-sm font-mono font-semibold ${newBasis <= basisNow ? 'text-emerald-400' : 'text-amber-400'}`}>
              {money(newBasis)}
            </span>
            <span className="ml-1.5 text-[11px] font-mono text-gray-500">
              from {money(basisNow)} ({newBasis <= basisNow ? '−' : '+'}{money(Math.abs(newBasis - basisNow))})
            </span>
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              B = {money(strike)} − ({money(netPremium)} premium {gain >= 0 ? '+' : '−'} {money(Math.abs(gain))} gain) / {remaining}
            </p>
          </div>
        )}

        {estimate != null && (
          <div className={`px-3 py-2 rounded-lg border ${
            estimate >= 0 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
          }`}>
            <span className="text-xs text-gray-400">Cycle P&amp;L if you sell here</span>
            <span className={`ml-2 text-sm font-mono font-semibold ${estimate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {estimate >= 0 ? '+' : ''}{money(estimate)}
            </span>
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              {held} × ({money(priceNum)} − {money(strike)}) + {money(netPremium)} premium
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Date sold</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {error && (
          <div className="flex gap-2 px-3 py-2 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />{error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={busy || !qtyOk}
            className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">
            {busy ? 'Selling…' : partial ? `Sell ${qty} shares` : `Sell all ${held}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
