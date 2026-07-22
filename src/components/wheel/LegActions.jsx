import { useState } from 'react'
import { Flag, TriangleAlert } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import { wheelApi } from '../../api/wheel.js'
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
  const [modal, setModal] = useState(null) // 'roll' | 'close'

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
    </>
  )
}

/** Per-share cost input that shows the total, mirroring the premium entry rule. */
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
          className={`${inputCls} pr-20`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">
          $ / share
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

  const debit  = Number(closeCost) * shares
  const credit = Number(premium) * shares
  const net    = (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? debit : 0)
  const ready  = closeCost !== '' && premium !== '' && strike !== '' && expiry !== ''

  return (
    <Modal isOpen={open} onClose={onClose} title={`Roll ${leg.ticker} ${leg.strike} ${leg.option_type === 'put' ? 'put' : 'call'}`} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
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
              <input type="date" required value={expiry}
                onChange={e => setExpiry(e.target.value)} className={inputCls} />
            </div>
          </div>
          <CostField label="New premium received" value={premium} onChange={setPremium} shares={shares} />
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-1.5">Date rolled</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
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

  const kept = Number(leg.premium) - Number(closeCost) * shares

  return (
    <Modal isOpen={open} onClose={onClose} title={`Buy back ${leg.ticker} ${leg.strike} ${leg.option_type === 'put' ? 'put' : 'call'}`} size="sm">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit({ close_cost: Number(closeCost) * shares, date }) }}
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
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
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
          <button type="submit" disabled={busy}
            className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors">
            {busy ? 'Closing…' : 'Buy to close'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Sell the shares outright and abandon the wheel. */
export function SellSharesModal({ open, cycle, onClose, onDone }) {
  const [price, setPrice] = useState('')
  const [date, setDate]   = useState(todayStr())
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  if (!cycle) return null

  const proceeds = Number(price) * cycle.shares
  const estimate = price !== '' && Number.isFinite(Number(price))
    ? cycle.shares * (Number(price) - Number(cycle.avg_assigned_strike)) + Number(cycle.net_premium)
    : null

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await wheelApi.sellShares(cycle.id, { price: Number(price), date })
      onDone?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to record the sale')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={`Sell ${cycle.shares} ${cycle.ticker} shares`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          This abandons the wheel on {cycle.ticker} and closes the cycle at your sale price. Close or roll
          any open covered calls first.
        </p>

        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Sale price per share</label>
          <input type="number" step="0.01" min="0.01" required inputMode="decimal" placeholder="16.40"
            value={price} onChange={e => setPrice(e.target.value)} className={inputCls} />
          {price !== '' && (
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              = {money(proceeds)} proceeds × {cycle.shares} sh
            </p>
          )}
        </div>

        {estimate != null && (
          <div className={`px-3 py-2 rounded-lg border ${
            estimate >= 0 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
          }`}>
            <span className="text-xs text-gray-400">Cycle P&amp;L if you sell here</span>
            <span className={`ml-2 text-sm font-mono font-semibold ${estimate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {estimate >= 0 ? '+' : ''}{money(estimate)}
            </span>
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              {cycle.shares} × ({money(Number(price))} − {money(Number(cycle.avg_assigned_strike))}) + {money(Number(cycle.net_premium))} premium
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Date sold</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
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
          <button type="submit" disabled={busy}
            className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">
            {busy ? 'Selling…' : 'Sell shares'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
