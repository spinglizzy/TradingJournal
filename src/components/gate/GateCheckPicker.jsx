import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { TriangleAlert, ShieldCheck } from 'lucide-react'
import { gateApi } from '../../api/gate.js'

/**
 * Link a logged trade back to the gate check that preceded it.
 *
 * "Same session" is the same NY calendar day: gate_checks.session_date is set
 * server-side in America/New_York and trades.date is a TEXT 'YYYY-MM-DD', so the
 * two line up directly. Trades carry no entry time, so the day is as fine-grained
 * as the data allows.
 *
 * Linking a NO TRADE check flags the trade as a rulebreak. It never blocks the
 * save — an accurate record matters more than enforcement.
 */
export default function GateCheckPicker({ date, value, onChange }) {
  const [checks,  setChecks]  = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!date) { setChecks([]); return }
      setLoading(true)
      try {
        const rows = await gateApi.list({ session_date: date })
        if (!cancelled) setChecks(rows)
      } catch {
        if (!cancelled) setChecks([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [date])

  const selected = checks.find(c => c.id === value)
  const isRulebreak = selected?.verdict === 'NO_TRADE'

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-xs text-gray-600">Loading checks…</p>
      ) : checks.length === 0 ? (
        <p className="text-xs text-gray-600 italic">
          No gate checks on {date || 'this date'}. Nothing to link.
        </p>
      ) : (
        <div className="space-y-1.5">
          {checks.map(c => {
            const no  = c.verdict === 'NO_TRADE'
            const on  = c.id === value
            // A check already attached to a different trade — selecting it moves the link.
            const taken = c.linked_trade_id != null && !on
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(on ? null : c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                  on
                    ? no ? 'bg-rose-500/10 border-rose-500/50' : 'bg-emerald-500/10 border-emerald-500/50'
                    : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
                }`}
              >
                <span className="text-xs font-mono text-gray-400 shrink-0">
                  {format(new Date(c.created_at), 'HH:mm:ss')}
                </span>
                <span className="text-xs font-mono font-bold text-white shrink-0">{c.instrument}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                  no ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                     : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {no ? 'No trade' : `Enter ${c.grade}`}
                </span>
                <span className="text-xs text-gray-500 truncate flex-1">{c.reason}</span>
                {taken && (
                  <span className="text-[10px] text-amber-500/80 shrink-0" title={`Currently linked to ${c.linked_ticker ?? 'another trade'}`}>
                    linked
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        isRulebreak ? (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40">
            <TriangleAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-rose-300">This one gets flagged as a rulebreak.</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                The gate said no — {selected.reason} Log it anyway; the review view needs it to be honest.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              Gate-passed, grade {selected.grade}.
            </p>
          </div>
        )
      )}
    </div>
  )
}
