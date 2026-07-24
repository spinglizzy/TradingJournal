import { useCallback, useEffect, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ShieldCheck, TriangleAlert, Clock } from 'lucide-react'
import { useFlushNavigate } from '../../hooks/useFlushNavigate.js'
import { gateApi } from '../../api/gate.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'

/**
 * Gate review — the point of the whole feature.
 *
 * There is no screenshot on a gate check by design. What the chart looked like is
 * the tick-list, which is queryable; what it looked like *visually* is recoverable
 * from the instrument plus the timestamp, both shown in the checks table below, by
 * pulling that bar up in replay after the session. Zero friction at entry.
 */

const RANGES = [
  { key: '7',   label: '7d'  },
  { key: '30',  label: '30d' },
  { key: '90',  label: '90d' },
  { key: 'all', label: 'All' },
]

const fmtR = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`
const fmt$ = (v) => v == null ? '—' : `${v >= 0 ? '+$' : '-$'}${Math.abs(v).toFixed(2)}`

function Stat({ label, value, sub, tone = 'gray', icon: Icon }) {
  const toneCls = {
    gray:    'border-gray-800',
    rose:    'border-rose-500/40',
    emerald: 'border-emerald-500/30',
    amber:   'border-amber-500/30',
  }[tone]
  const valueCls = {
    gray: 'text-white', rose: 'text-rose-400', emerald: 'text-emerald-400', amber: 'text-amber-400',
  }[tone]
  return (
    <div className={`bg-gray-900 border ${toneCls} rounded-xl p-4 card-glow`}>
      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </div>
      <div className={`text-2xl font-bold font-mono leading-none ${valueCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

/** R outcomes for one group of trades, side by side with the other. */
function OutcomeCard({ title, group, tone, note }) {
  const border = tone === 'rose' ? 'border-rose-500/40' : 'border-emerald-500/30'
  return (
    <div className={`bg-gray-900 border ${border} rounded-xl p-4 card-glow`}>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <span className="text-xs text-gray-500">{group.trades} closed</span>
      </div>
      {group.trades === 0 ? (
        <p className="text-xs text-gray-600 italic">{note}</p>
      ) : (
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Avg R</div>
            <div className={`text-xl font-bold font-mono ${(group.avg_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {fmtR(group.avg_r)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Total R</div>
            <div className={`text-xl font-bold font-mono ${(group.total_r ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {fmtR(group.total_r)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Win rate</div>
            <div className="text-sm font-mono text-gray-300">
              {group.win_rate == null ? '—' : `${group.win_rate.toFixed(0)}%`}
              <span className="text-gray-600 ml-1.5 text-xs">{group.wins}W / {group.losses}L</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">P&amp;L</div>
            <div className={`text-sm font-mono ${(group.total_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {fmt$(group.total_pnl)}
            </div>
          </div>
          {group.with_r < group.trades && (
            <p className="col-span-2 text-[10px] text-gray-600 pt-1">
              {group.trades - group.with_r} of these have no R multiple (no stop recorded) and are out of the R figures.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function GateReview() {
  const navigate = useFlushNavigate()
  const [range,   setRange]   = useState('30')
  const [review,  setReview]  = useState(null)
  const [checks,  setChecks]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = range === 'all'
      ? {}
      : { from: format(subDays(new Date(), Number(range)), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }

    try {
      const [r, c] = await Promise.all([gateApi.review(params), gateApi.list({ ...params, limit: 100 })])
      setReview(r)
      setChecks(c)
    } catch (err) {
      setError(err?.message || 'Failed to load gate review')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner className="h-64" />

  if (error) {
    return (
      <div className="py-16 text-center border border-dashed border-gray-800 rounded-xl space-y-2">
        <p className="text-sm text-rose-400">{error}</p>
        <p className="text-xs text-gray-600">
          If this is the first run, <code className="text-gray-500">gate_migration.sql</code> may not be applied yet.
        </p>
      </div>
    )
  }

  const t = review?.totals ?? {}
  const takenRate = t.no_trade > 0 ? (t.rulebreaks / t.no_trade) * 100 : null

  return (
    <div className="space-y-5">
      {/* Range */}
      <div className="flex rounded-lg bg-gray-900 border border-gray-800 p-0.5 w-fit">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
              range === r.key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {t.total === 0 ? (
        <div className="py-16 text-center text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
          No gate checks in this period — the gate lives in your premarket plan.
        </div>
      ) : (
        <>
          {/* Headline counts */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Checks run"     value={t.total} sub={`${t.enter} enter · ${t.no_trade} no trade`} icon={ShieldCheck} />
            <Stat label="Passed the gate" value={t.enter}
                  sub={`${t.a_plus} A+ · ${t.a} A`} tone="emerald" />
            <Stat label="Taken against NO TRADE" value={t.rulebreaks} tone={t.rulebreaks > 0 ? 'rose' : 'gray'}
                  sub={takenRate == null ? 'no NO TRADE verdicts yet' : `${takenRate.toFixed(0)}% of no-trade calls`}
                  icon={TriangleAlert} />
            <Stat label="Trades with no check" value={review.ungated_trades} tone={review.ungated_trades > 0 ? 'amber' : 'gray'}
                  sub="gate skipped entirely" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Logged as taken" value={t.taken} sub={`${t.total - t.taken} passed or unstated`} />
            <Stat label="Linked to a trade" value={t.linked}
                  sub={t.taken > t.linked ? `${t.taken - t.linked} taken but not linked yet` : 'all taken checks linked'}
                  tone={t.taken > t.linked ? 'amber' : 'gray'} />
          </div>

          {/* R outcomes, split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OutcomeCard
              title="Rulebreaks — taken against NO TRADE"
              group={review.outcomes.rulebreak}
              tone="rose"
              note="None. Every trade you logged had a passing check behind it."
            />
            <OutcomeCard
              title="Gate-passed trades"
              group={review.outcomes.passed}
              tone="emerald"
              note="No gate-passed trades closed in this period yet."
            />
          </div>

          {/* Kill frequency */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
              <h4 className="text-sm font-semibold text-white mb-3">Kill factors, most frequent</h4>
              {review.kills.length === 0 ? (
                <p className="text-xs text-gray-600 italic">No kills ticked in this period.</p>
              ) : (
                <div className="space-y-2">
                  {review.kills.map(k => {
                    const pct = (k.count / review.kills[0].count) * 100
                    return (
                      <div key={k.kill_key}>
                        <div className="flex justify-between items-baseline text-xs mb-1">
                          <span className="text-gray-300">{k.label}</span>
                          <span className="font-mono text-gray-500">
                            {k.count}
                            {k.taken_anyway > 0 && (
                              <span className="text-rose-400 ml-2" title="Trades taken despite this kill">
                                {k.taken_anyway} taken
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-sm overflow-hidden">
                          <div className="h-full bg-rose-500/70 rounded-sm" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>

          {/* Every check — timestamp + instrument are the replay handle */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-glow">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <h4 className="text-sm font-semibold text-white">Checks</h4>
              <span className="text-[11px] text-gray-600">timestamp + instrument — pull the bar in replay</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Time','Instr','Verdict','Score','Reason','Trade'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-3 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {checks.map(c => {
                    const no = c.verdict === 'NO_TRADE'
                    const rulebreak = no && c.linked_trade_id != null
                    return (
                      <tr key={c.id} className={`hover:bg-gray-800/30 transition-colors ${rulebreak ? 'bg-rose-500/5' : ''}`}>
                        <td className="px-3 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap">
                          {format(new Date(c.created_at), 'MMM d HH:mm:ss')}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-bold text-white">{c.instrument}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                            no ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                               : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {no ? 'No trade' : `Enter ${c.grade}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-gray-400">
                          {c.net_score > 0 ? `+${c.net_score}` : c.net_score}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 max-w-md truncate" title={c.reason}>{c.reason}</td>
                        <td className="px-3 py-2.5">
                          {c.linked_trade_id ? (
                            <button
                              onClick={() => navigate(`/trades/${c.linked_trade_id}`)}
                              className={`text-xs font-medium hover:underline ${rulebreak ? 'text-rose-400' : 'text-indigo-400'}`}
                            >
                              {rulebreak && '⚠ '}{c.linked_ticker || 'View'}
                              {c.linked_r != null && <span className="ml-1.5 font-mono text-gray-500">{fmtR(c.linked_r)}</span>}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-700">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
