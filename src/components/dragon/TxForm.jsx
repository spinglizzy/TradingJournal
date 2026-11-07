import { useState } from 'react'
import { dragonApi } from '../../api/dragon.js'
import { DatePicker } from '../ui/DatePicker.jsx'
import { SHARES_PER_CONTRACT, FEE_TYPES } from '../../../server/lib/dragonEngine.js'
import { Field, ErrorBox } from './ui.jsx'
import { inputCls, btnPrimary, btnGhost, money, fmtShares, todayStr, TYPE_LABEL, callLabel } from './format.js'

const SHARE_TYPES = ['BUY', 'DRIP', 'SELL']
const CALL_REF_TYPES = ['CC_CLOSE', 'CC_ROLL', 'CC_EXPIRE']

/**
 * One form for every ledger entry type — new, or editing `tx` (type stays fixed).
 * Option prices are the broker's quote per share ("$ / contract", 1.20 → $120),
 * same as the Wheel forms. The server re-derives `amount` and replays the ledger;
 * the checks here are only for a fast, friendly error.
 */
export default function TxForm({ holding, state, ledger, type, tx, onSaved, onCancel }) {
  const editing = !!tx
  // Calls this entry may end: the ones open now, plus (when editing) the one it already ends.
  const calls = [...state.openCalls, ...(tx?.ref_id ? ledger.filter(x => x.id === tx.ref_id) : [])]
  // Dividends a reclassification can point at, newest first.
  const dividends = ledger.filter(x => x.type === 'DIVIDEND').sort((a, b) => (a.date < b.date ? 1 : -1))
  const [f, setF] = useState(() => ({
    date:      tx?.date ?? todayStr(),
    shares:    tx?.shares ?? '',
    price:     tx?.price ?? (SHARE_TYPES.includes(type) ? holding.current_price ?? '' : ''),
    amount:    tx?.amount ?? '',
    fees:      tx?.fees || '',
    tax_withheld: tx?.tax_withheld ?? '',
    strike:    tx?.strike ?? '',
    expiry:    tx?.expiry ?? '',
    contracts: tx?.contracts ?? (type === 'CC_OPEN' ? 1 : calls[0]?.contracts ?? 1),
    premium:   tx?.premium ?? '',
    ref_id:    tx?.ref_id ?? (type === 'SELL' ? '' : type === 'RECLASS' ? dividends[0]?.id ?? '' : calls[0]?.id ?? ''),
    notes:     tx?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const set = (p) => setF(prev => ({ ...prev, ...p }))

  const ref = calls.find(c => c.id === Number(f.ref_id))
  const n = (v) => (v === '' ? NaN : Number(v))
  const optContracts = type === 'CC_CLOSE' ? ref?.contracts : n(f.contracts)
  const gross = SHARE_TYPES.includes(type) ? n(f.shares) * n(f.price)
    : ['CC_OPEN', 'CC_CLOSE', 'CC_ROLL'].includes(type) ? n(f.premium) * SHARES_PER_CONTRACT * optContracts
    : null
  // Fees always work against you: added to what you pay, taken off what you receive.
  const fee = FEE_TYPES.includes(type) && f.fees !== '' ? n(f.fees) : 0
  const cash = gross == null ? null : (type === 'BUY' || type === 'CC_CLOSE') ? gross + fee : gross - fee
  // Contracts this form may sell: free now, plus the old call's when rolling it.
  // shortcut: approximate when editing an older call that's since been closed — the server's replay is the real check.
  const maxContracts = state.freeContracts + (editing ? Number(tx.contracts ?? 0) : type === 'CC_ROLL' ? ref?.contracts ?? 0 : 0)

  function check() {
    if (!f.date) return 'Date is required'
    if (SHARE_TYPES.includes(type)) {
      if (!(n(f.shares) > 0)) return 'Shares must be more than 0'
      if (!(n(f.price) > 0)) return 'Price must be more than 0'
      if (type === 'SELL' && !editing && n(f.shares) > state.shares + 1e-9) return `You only hold ${fmtShares(state.shares)} shares`
    }
    if (type === 'DIVIDEND' && !(n(f.amount) > 0)) return 'Enter the net dividend received'
    if (type === 'ROC' && !(n(f.amount) > 0)) return 'Enter the return of capital received'
    if (type === 'RECLASS' && !f.ref_id) return 'Pick the dividend being reclassified'
    if (type === 'RECLASS' && !(n(f.amount) > 0)) return 'Enter the amount reclassified'
    if (CALL_REF_TYPES.includes(type) && !ref) return 'Pick the call'
    if (type === 'CC_OPEN' || type === 'CC_ROLL') {
      if (!(n(f.strike) > 0)) return 'Strike is required'
      if (!f.expiry) return 'Expiry is required'
      if (f.expiry <= f.date) return 'Expiry must be after the date'
      if (!Number.isInteger(n(f.contracts)) || n(f.contracts) < 1) return 'Contracts must be a whole number'
      if (n(f.contracts) > maxContracts) return `Your shares cover ${maxContracts} more contract(s)`
    }
    if (['CC_OPEN', 'CC_CLOSE', 'CC_ROLL'].includes(type) && !Number.isFinite(n(f.premium))) return 'Enter the price'
    if (!(fee >= 0)) return 'Fees can’t be negative'
    if (f.tax_withheld !== '' && !(n(f.tax_withheld) >= 0)) return 'Tax withheld can’t be negative'
    return null
  }

  async function submit(e) {
    e.preventDefault()
    const msg = check()
    if (msg) return setError(msg)
    setSaving(true); setError(null)
    try {
      const body = { ...f, type, holding_id: holding.id, ref_id: f.ref_id || null }
      if (editing) await dragonApi.updateTx(tx.id, body)
      else await dragonApi.createTx(body)
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const callPicker = (label, allowNone) => (
    <Field label={label}>
      <select value={f.ref_id} onChange={e => {
        const c = calls.find(x => x.id === Number(e.target.value))
        set({ ref_id: e.target.value, ...(c && type === 'CC_EXPIRE' ? { date: c.expiry } : {}),
          ...(c && type === 'SELL' ? { shares: c.contracts * SHARES_PER_CONTRACT, price: c.strike } : {}),
          ...(c && type === 'CC_ROLL' ? { contracts: c.contracts } : {}) })
      }} className={inputCls}>
        {allowNone && <option value="">— Not called away —</option>}
        {calls.map(c => <option key={c.id} value={c.id}>{callLabel(c)}</option>)}
      </select>
    </Field>
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="text-xs text-gray-500">
        <span className="font-semibold text-white">{holding.ticker}</span> · {TYPE_LABEL[type]}
        {' '}· holding {fmtShares(state.shares)} sh
      </div>

      {CALL_REF_TYPES.includes(type) && callPicker(type === 'CC_ROLL' ? 'Call being rolled' : 'Call')}
      {type === 'SELL' && calls.length > 0 && callPicker('Called away?', true)}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date">
          <DatePicker value={f.date} onChange={v => set({ date: v })} />
        </Field>
        {type === 'DIVIDEND' && (
          <Field label="Net amount received" hint="After withholding">
            <input type="number" step="0.01" min="0" inputMode="decimal" value={f.amount}
              onChange={e => set({ amount: e.target.value })} className={inputCls} placeholder="5.00" />
          </Field>
        )}
      </div>

      {type === 'ROC' && (
        <Field label="Return of capital received" hint="Lowers both the adjusted basis and Schwab's tax lots. Not dividend income.">
          <input type="number" step="0.01" min="0" inputMode="decimal" value={f.amount}
            onChange={e => set({ amount: e.target.value })} className={inputCls} placeholder="0.00" />
        </Field>
      )}

      {type === 'RECLASS' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Dividend being reclassified" hint="Income moves to return of capital in that dividend's tax year.">
            <select value={f.ref_id} onChange={e => set({ ref_id: e.target.value })} className={inputCls}>
              {dividends.map(d => <option key={d.id} value={d.id}>{d.date} · {money(d.amount)}</option>)}
            </select>
          </Field>
          <Field label="Amount reclassified" hint="No cash moves — it was already received.">
            <input type="number" step="0.01" min="0" inputMode="decimal" value={f.amount}
              onChange={e => set({ amount: e.target.value })} className={inputCls} placeholder="0.00" />
          </Field>
        </div>
      )}

      {type === 'DIVIDEND' && (
        <Field label="US tax withheld (optional)" hint="For the tax-year report only. The basis uses the net amount above.">
          <input type="number" step="0.01" min="0" inputMode="decimal" value={f.tax_withheld}
            onChange={e => set({ tax_withheld: e.target.value })} className={inputCls} placeholder="0.00" />
        </Field>
      )}

      {SHARE_TYPES.includes(type) && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Shares" hint={type === 'SELL' ? `Max ${fmtShares(state.shares)}` : 'Up to 6 decimals'}>
            <input type="number" step="0.000001" min="0" inputMode="decimal" value={f.shares}
              onChange={e => set({ shares: e.target.value })} className={inputCls} />
          </Field>
          <Field label={type === 'SELL' && ref ? 'Price (strike)' : 'Price / share'}>
            <input type="number" step="0.0001" min="0" inputMode="decimal" value={f.price}
              onChange={e => set({ price: e.target.value })} className={inputCls} />
          </Field>
        </div>
      )}

      {(type === 'CC_OPEN' || type === 'CC_ROLL') && (
        <div className="grid grid-cols-3 gap-4">
          <Field label={type === 'CC_ROLL' ? 'New strike' : 'Strike'}>
            <input type="number" step="0.01" min="0" value={f.strike} onChange={e => set({ strike: e.target.value })} className={inputCls} />
          </Field>
          <Field label={type === 'CC_ROLL' ? 'New expiry' : 'Expiry'}>
            <DatePicker value={f.expiry} onChange={v => set({ expiry: v })} placeholder="Pick expiry" />
          </Field>
          <Field label="Contracts" hint={`Max ${maxContracts}`}>
            <input type="number" step="1" min="1" max={maxContracts} value={f.contracts}
              onChange={e => set({ contracts: e.target.value })} className={inputCls} />
          </Field>
        </div>
      )}

      {['CC_OPEN', 'CC_CLOSE', 'CC_ROLL'].includes(type) && (
        <Field
          label={type === 'CC_OPEN' ? 'Premium received' : type === 'CC_CLOSE' ? 'Buy-back price paid' : 'Net roll price'}
          hint={type === 'CC_ROLL' ? 'Credit as positive (0.25), debit as negative (-0.10).' : 'The quote your broker shows (1.20), not the dollar total.'}
        >
          <div className="relative">
            <input type="number" step="0.01" inputMode="decimal" min={type === 'CC_ROLL' ? undefined : 0}
              value={f.premium} onChange={e => set({ premium: e.target.value })} className={`${inputCls} pr-24`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">$ / contract</span>
          </div>
        </Field>
      )}

      {FEE_TYPES.includes(type) && (
        <Field label="Fees & commission" hint="Always counted against you: added to a buy or buy-back, taken off a sale or premium.">
          <input type="number" step="0.01" min="0" inputMode="decimal" value={f.fees}
            onChange={e => set({ fees: e.target.value })} className={inputCls} placeholder="0.00" />
        </Field>
      )}

      {Number.isFinite(cash) && (
        <div className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-xs text-gray-400">
          {type === 'CC_ROLL' ? (cash >= 0 ? 'Net credit' : 'Net debit') : type === 'CC_CLOSE' ? 'Debit' : type === 'CC_OPEN' ? 'Credit' : 'Total'}
          {fee > 0 && ' after fees'}
          <span className="ml-2 text-sm font-mono font-semibold text-white">{money(Math.abs(cash))}</span>
        </div>
      )}

      <Field label="Notes">
        <textarea rows={2} value={f.notes} onChange={e => set({ notes: e.target.value })} className={`${inputCls} resize-none`} />
      </Field>

      <ErrorBox>{error}</ErrorBox>

      <div className="flex gap-3 justify-end">
        {onCancel && <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>}
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? 'Saving…' : editing ? 'Save changes' : `Log ${TYPE_LABEL[type].toLowerCase()}`}
        </button>
      </div>
    </form>
  )
}
