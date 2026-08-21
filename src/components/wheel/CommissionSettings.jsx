import { useState } from 'react'
import { RotateCcw, Receipt } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import {
  DEFAULT_COMMISSIONS, saveCommissions, resetCommissions, optionOrderFee, rollFees,
} from '../../lib/commissions.js'
import { useCommissions } from '../../lib/useCommissions.js'

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

const money = (v) => `$${Number(v).toFixed(2)}`

function Row({ label, hint, value, onChange, prefix = '$' }) {
  return (
    <div className="grid grid-cols-[1fr_7rem] gap-3 items-start">
      <div>
        <div className="text-sm text-gray-300">{label}</div>
        <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{hint}</p>
      </div>
      <div className="relative">
        <input
          type="number" step="0.01" min="0" inputMode="decimal"
          value={value} onChange={e => onChange(e.target.value)}
          className={`${inputCls} pl-6`}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
          {prefix}
        </span>
      </div>
    </div>
  )
}

/**
 * Your broker's rate card. These numbers only PRE-FILL the commission field on
 * every wheel action — each modal still lets you type over the estimate, and it
 * is the typed number that books.
 *
 * Kept on this device (localStorage), not in the database: the durable record is
 * the fee written onto each leg, which is what the basis engine reads.
 */
export default function CommissionSettings({ open, onClose }) {
  const saved = useCommissions()
  const [form, setForm] = useState(saved)
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  // Re-seed when reopened after an external change (e.g. a reset elsewhere).
  const [seed, setSeed] = useState(saved)
  if (seed !== saved) { setSeed(saved); setForm(saved) }

  const cfg  = {
    perContract:   Number(form.perContract)   || 0,
    perOrder:      Number(form.perOrder)      || 0,
    assignmentFee: Number(form.assignmentFee) || 0,
    shareOrderFee: Number(form.shareOrderFee) || 0,
  }
  const one    = optionOrderFee(1, cfg)
  const ten    = optionOrderFee(10, cfg)
  const roll3  = rollFees(3, cfg, { combo: true })

  return (
    <Modal isOpen={open} onClose={onClose} title="Commission rates" size="md">
      <div className="space-y-5">
        <p className="text-xs text-gray-500 leading-relaxed">
          Every wheel action pre-fills its commission from these. Override any single fill in the
          action itself — what you type there is what books against the cost basis.
        </p>

        <div className="space-y-4">
          <Row
            label="Per option contract"
            hint="Charged on each contract, each side. 3 contracts to open then close = 6 × this."
            value={form.perContract} onChange={set('perContract')}
          />
          <Row
            label="Per order (ticket fee)"
            hint="Flat charge per submitted order, whatever its size. Added once to each ticket."
            value={form.perOrder} onChange={set('perOrder')}
          />
          <Row
            label="Assignment / exercise"
            hint="Charged when a put is assigned to you or a call is exercised against you. Often $0."
            value={form.assignmentFee} onChange={set('assignmentFee')}
          />
          <Row
            label="Share order"
            hint="Commission on selling stock out of a cycle. $0 at most brokers."
            value={form.shareOrderFee} onChange={set('shareOrderFee')}
          />
        </div>

        <div className="px-3 py-2.5 rounded-lg border border-gray-800 bg-gray-900/60">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5">
            <Receipt className="w-3 h-3" /> What that works out to
          </div>
          <ul className="space-y-1 text-[11px] font-mono text-gray-500">
            <li>1 contract, one order &nbsp;→&nbsp; <span className="text-gray-300">{money(one)}</span></li>
            <li>10 contracts, one order &nbsp;→&nbsp; <span className="text-gray-300">{money(ten)}</span></li>
            <li>
              roll 3 contracts (one combo order) &nbsp;→&nbsp;{' '}
              <span className="text-gray-300">{money(roll3.total)}</span>
              <span className="text-gray-600"> = {money(roll3.closeFee)} close + {money(roll3.openFee)} open</span>
            </li>
          </ul>
        </div>

        <div className="flex gap-3 justify-between items-center">
          <button
            type="button"
            onClick={() => setForm(resetCommissions())}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Defaults ({money(DEFAULT_COMMISSIONS.perContract)} + {money(DEFAULT_COMMISSIONS.perOrder)})
          </button>
          <div className="flex gap-3">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { saveCommissions(cfg); onClose() }}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Save rates
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
