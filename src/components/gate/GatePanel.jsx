import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, ChevronDown, ChevronRight, EyeOff, Plus, Trash2 } from 'lucide-react'
import { gateApi } from '../../api/gate.js'
import { useGate } from '../../contexts/GateContext.jsx'
import { labelFor } from '../../lib/gateFactors.js'
import PreEntryGate from './PreEntryGate.jsx'

/**
 * The Pre-Entry Gate as a widget inside the premarket plan.
 *
 * This is the only way the gate is used: the plan is what's already open on
 * screen through the session, so the check lives where his eyes already are and
 * costs one glance instead of a context switch.
 *
 * Scenarios logged today are listed underneath and expand on click to show
 * exactly what was ticked — that's the record he goes back to after the session,
 * alongside the timestamp, to pull the bar up in replay.
 */

/** NY trading date — must match the server's session_date bucketing. */
function nySessionDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function VerdictChip({ verdict, grade }) {
  const no = verdict === 'NO_TRADE'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
      no ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
         : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    }`}>
      {no ? 'No trade' : `Enter ${grade}`}
    </span>
  )
}

/** What he did, which is not the same thing as what the gate said. */
function DecisionChip({ took }) {
  if (took == null) return null
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
      took ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
           : 'bg-gray-800 text-gray-400 border-gray-700'
    }`}>
      {took ? 'Took it' : 'Passed'}
    </span>
  )
}

/** One group of ticked factors in the expanded detail. */
function TickedList({ title, keys, kind, factors, tone }) {
  if (!keys?.length) return null
  const chip = {
    rose:    'bg-rose-500/10 text-rose-300 border-rose-500/25',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    amber:   'bg-amber-500/10 text-amber-300 border-amber-500/25',
  }[tone]
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {keys.map(k => (
          <span key={k} className={`px-2 py-0.5 rounded text-[11px] border ${chip}`}>
            {labelFor(factors, kind, k)}
          </span>
        ))}
      </div>
    </div>
  )
}

function CheckRow({ check, factors, onDelete }) {
  const [open, setOpen] = useState(false)
  const no = check.verdict === 'NO_TRADE'
  // Taken against a NO TRADE verdict — the thing this whole feature exists to count.
  const rulebreak = no && check.took_trade === true

  return (
    <div className={`rounded-lg border transition-colors ${
      rulebreak ? 'border-rose-500/40 bg-rose-500/5' : 'border-gray-800 bg-gray-900/60'
    }`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left"
      >
        {open
          ? <ChevronDown  className="w-3 h-3 text-gray-600 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
        <span className="text-[11px] font-mono text-gray-500 shrink-0">
          {new Date(check.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-[11px] font-mono font-bold text-gray-300 shrink-0">{check.instrument}</span>
        <VerdictChip verdict={check.verdict} grade={check.grade} />
        <DecisionChip took={check.took_trade} />
        {rulebreak && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-rose-400 shrink-0">rulebreak</span>
        )}
        <span className="text-[11px] text-gray-600 truncate">{check.reason}</span>
        {check.linked_trade_id && (
          <span className="ml-auto text-[10px] text-gray-500 shrink-0" title="Linked to a logged trade">
            {check.linked_ticker || 'linked'}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-800/60">
          <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-2">
            <span className="font-mono">
              {new Date(check.created_at).toLocaleString([], {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </span>
            <span>net score <span className="font-mono text-gray-300">{check.net_score > 0 ? `+${check.net_score}` : check.net_score}</span></span>
            <button
              type="button"
              onClick={() => onDelete(check)}
              className="ml-auto flex items-center gap-1 text-gray-600 hover:text-rose-400 transition-colors"
              title="Delete this logged scenario"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>

          <p className={`text-xs ${no ? 'text-rose-300' : 'text-emerald-300'}`}>{check.reason}</p>

          <TickedList title="Instant kills"  keys={check.kills}       kind="kill"       factors={factors} tone="rose" />
          <TickedList title="Confluences"    keys={check.confluences} kind="confluence" factors={factors} tone="emerald" />
          <TickedList title="Contested"      keys={check.contested}   kind="contested"  factors={factors} tone="amber" />

          {check.note && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1">Your note</p>
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{check.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GatePanel({ onHide }) {
  const { factors, refreshFactors } = useGate()
  const [collapsed, setCollapsed] = useState(false)
  const [checks,    setChecks]    = useState([])

  const loadChecks = useCallback(() => {
    gateApi.list({ session_date: nySessionDate(), limit: 30 })
      .then(setChecks)
      .catch(() => {})
  }, [])

  useEffect(() => { loadChecks() }, [loadChecks])

  const handleDelete = useCallback(async (check) => {
    try {
      await gateApi.remove(check.id)
      loadChecks()
    } catch (err) {
      console.error('Could not delete scenario:', err)
      alert(`Couldn't delete that scenario: ${err?.message || 'unknown error'}`)
    }
  }, [loadChecks])

  const noTradeCount  = checks.filter(c => c.verdict === 'NO_TRADE').length
  const rulebreakCount = checks.filter(c => c.verdict === 'NO_TRADE' && c.took_trade === true).length

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60">
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
            {checks.length} logged today
            {noTradeCount > 0 && <span className="text-rose-400/80 ml-1.5">{noTradeCount} no trade</span>}
            {rulebreakCount > 0 && <span className="text-rose-400 ml-1.5 font-medium">{rulebreakCount} rulebreak</span>}
          </span>
        )}

        {onHide && (
          <button
            type="button"
            onClick={onHide}
            className="ml-auto text-gray-600 hover:text-gray-300 p-1 rounded hover:bg-gray-800 transition-colors"
            title="Hide this section"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          <PreEntryGate
            factors={factors}
            onSaved={loadChecks}
            onFactorsChanged={refreshFactors}
          />

          {/* Scenarios logged today — click one to see what was ticked */}
          {checks.length > 0 && (
            <div className="pt-3 border-t border-gray-800">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                Today's log <span className="normal-case tracking-normal text-gray-600">— click a row to see what you ticked</span>
              </p>
              <div className="space-y-1">
                {checks.map(c => (
                  <CheckRow key={c.id} check={c} factors={factors} onDelete={handleDelete} />
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
