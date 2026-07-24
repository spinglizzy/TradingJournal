import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldAlert, ChevronDown, ChevronRight, EyeOff, Plus } from 'lucide-react'
import { gateApi } from '../../api/gate.js'
import { useGate } from '../../contexts/GateContext.jsx'
import { GateBody } from './PreEntryGate.jsx'

/**
 * The Pre-Entry Gate as a section inside the premarket plan.
 *
 * This is the primary way the gate gets used: the plan is what's already open on
 * screen through the session, so the check lives where his eyes already are and
 * costs one glance instead of a context switch. The Shift+G overlay stays as the
 * fallback for when the plan isn't open.
 *
 * Two things it does that the overlay can't:
 *   * Zones come from the plan being edited right now, including levels added
 *     minutes ago and not yet saved.
 *   * Checks already run today are listed underneath, so mid-session he can see
 *     what he has already assessed and what he decided.
 *
 * Hotkeys are ARMED, not always-on: the plan is full of text inputs and a live
 * `1` key would be a landmine. Clicking anywhere in the panel arms it, clicking
 * outside disarms it, and the state is shown in the header.
 */

/** NY trading date — must match the server's session_date bucketing. */
function nySessionDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function VerdictChip({ check }) {
  const no = check.verdict === 'NO_TRADE'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
      no ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
         : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    }`}>
      {no ? 'No trade' : `Enter ${check.grade}`}
    </span>
  )
}

export default function GatePanel({ zones = [], onHide }) {
  const { factors, refreshFactors } = useGate()
  const [collapsed, setCollapsed] = useState(false)
  const [armed,     setArmed]     = useState(false)
  const [checks,    setChecks]    = useState([])
  const panelRef = useRef(null)

  const loadChecks = useCallback(() => {
    gateApi.list({ session_date: nySessionDate(), limit: 20 })
      .then(setChecks)
      .catch(() => {})
  }, [])

  useEffect(() => { loadChecks() }, [loadChecks])

  // Arm on click inside, disarm on click outside. mousedown so the arm state is
  // already correct by the time a keystroke could land.
  useEffect(() => {
    function onDown(e) { setArmed(!!panelRef.current?.contains(e.target)) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const noTradeCount = checks.filter(c => c.verdict === 'NO_TRADE').length

  return (
    <div
      ref={panelRef}
      className={`rounded-xl border bg-gray-900/60 transition-colors ${
        armed ? 'border-rose-500/40' : 'border-gray-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 text-left group"
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300" />
            : <ChevronDown  className="w-4 h-4 text-gray-500 group-hover:text-gray-300" />}
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-white">Pre-Entry Gate</h3>
        </button>

        {checks.length > 0 && (
          <span className="text-[11px] text-gray-600">
            {checks.length} today
            {noTradeCount > 0 && <span className="text-rose-400/80 ml-1.5">{noTradeCount} no trade</span>}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              armed
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                : 'bg-gray-800 text-gray-500 border-gray-700'
            }`}
            title={armed ? 'Number and letter keys toggle gate items' : 'Click the panel to enable keyboard shortcuts'}
          >
            {armed ? 'keys live' : 'click to arm keys'}
          </span>
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              className="text-gray-600 hover:text-gray-300 p-1 rounded hover:bg-gray-800 transition-colors"
              title="Hide this section"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          <GateBody
            variant="inline"
            active
            hotkeys={armed}
            factors={factors}
            zones={zones}
            onSaved={loadChecks}
            onFactorsChanged={refreshFactors}
          />

          {/* Checks already run today */}
          {checks.length > 0 && (
            <div className="pt-3 border-t border-gray-800">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                Today's checks
              </p>
              <div className="space-y-1">
                {checks.map(c => (
                  <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-[11px] font-mono text-gray-500 shrink-0">
                      {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-gray-300 shrink-0">{c.instrument}</span>
                    <VerdictChip check={c} />
                    {c.zone_label && <span className="text-[11px] text-indigo-300/70 shrink-0">{c.zone_label}</span>}
                    <span className="text-[11px] text-gray-600 truncate">{c.reason}</span>
                    {c.linked_trade_id && (
                      <span className="ml-auto text-[10px] text-gray-500 shrink-0" title="Linked to a logged trade">
                        {c.linked_ticker || 'linked'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The slim "put it back" bar shown in the plan once the panel is hidden. */
export function GatePanelPlaceholder({ onAdd }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-800 hover:border-rose-500/40 rounded-xl text-xs text-gray-600 hover:text-rose-300 transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />
      Add Pre-Entry Gate
    </button>
  )
}
