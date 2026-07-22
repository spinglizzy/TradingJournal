import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { Info, TriangleAlert, Check, Plus, Trash2, PenLine } from 'lucide-react'
import { DatePicker } from '../ui/DatePicker.jsx'
import {
  analyseStrikes, buildSnapshot,
  DEFAULT_THRESHOLD_PCT, DEFAULT_MIN_WEEKLY_PREM,
} from '../../lib/strikeCalc.js'

const SERIES_COLORS = ['#818cf8', '#34d399', '#fbbf24']

const money   = (v, d = 2) => (v == null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(d)}`)
const signed  = (v, d = 2) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(d)}`)
const pct     = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`)

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

const FLAG_STYLES = {
  red:     { box: 'border-red-500/40 bg-red-500/5',         text: 'text-red-400',     label: 'Books a loss' },
  amber:   { box: 'border-amber-500/40 bg-amber-500/5',     text: 'text-amber-400',   label: 'Caution' },
  green:   { box: 'border-emerald-500/40 bg-emerald-500/5', text: 'text-emerald-400', label: 'Clear' },
  unknown: { box: 'border-gray-700 bg-gray-800/40',         text: 'text-gray-400',    label: 'No basis' },
}

const emptyRow = () => ({ strike: '', premium: '', expiry: '', delta: '' })

/**
 * Strike Selection Calculator (spec §9).
 *
 * Consumes `basis` from the wheel basis engine — it never recomputes it. When
 * basis is null (nothing assigned yet) the safety check is skipped and said so
 * explicitly rather than defaulting B to zero.
 */
export default function StrikeCalculator({ ticker, basis, shares, defaultExpiry, onWrite, onClose }) {
  const [underlying, setUnderlying] = useState('')
  const [rows, setRows] = useState([
    { ...emptyRow(), expiry: defaultExpiry || '' },
    { ...emptyRow(), expiry: defaultExpiry || '' },
  ])
  const [thresholdPct, setThresholdPct] = useState(DEFAULT_THRESHOLD_PCT)
  const [minWeekly, setMinWeekly]       = useState(DEFAULT_MIN_WEEKLY_PREM)
  const [showSettings, setShowSettings] = useState(false)

  const N = shares || 0

  const analysis = useMemo(() => analyseStrikes({
    basis, shares: N, underlying, candidates: rows,
    thresholdPct: Number(thresholdPct) || DEFAULT_THRESHOLD_PCT,
    minWeeklyPremium: Number(minWeekly) || DEFAULT_MIN_WEEKLY_PREM,
  }), [basis, N, underlying, rows, thresholdPct, minWeekly])

  const setRow = (i, patch) => setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows(rs => (rs.length >= 3 ? rs : [...rs, { ...emptyRow(), expiry: defaultExpiry || '' }]))
  const delRow = (i) => setRows(rs => (rs.length <= 2 ? rs : rs.filter((_, idx) => idx !== i)))

  const { candidates, pairs, differingExpiries, guidance } = analysis
  const headline = pairs[0]

  return (
    <div className="space-y-5">
      {/* ── Context strip ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl">
        <div>
          <div className="text-[11px] text-gray-500">Ticker</div>
          <div className="text-sm font-semibold text-white">{ticker}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Shares held</div>
          <div className="text-sm font-mono text-white">{N}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Effective basis (B)</div>
          <div className="text-sm font-mono text-white">
            {basis == null ? <span className="text-gray-500">not assigned</span> : money(basis)}
          </div>
        </div>
        <div className="min-w-[150px]">
          <label className="block text-[11px] text-gray-500 mb-1">
            Underlying price (S) <span className="text-gray-600">manual</span>
          </label>
          <input
            type="number" step="0.01" inputMode="decimal" placeholder="15.90"
            value={underlying} onChange={e => setUnderlying(e.target.value)}
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(v => !v)}
          className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors self-end pb-1.5"
        >
          {showSettings ? 'Hide thresholds' : 'Thresholds'}
        </button>
      </div>

      {showSettings && (
        <div className="flex flex-wrap gap-5 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Thin-margin threshold (% of basis)
            </label>
            <input
              type="number" step="0.005" min="0"
              value={thresholdPct} onChange={e => setThresholdPct(e.target.value)}
              className={`${inputCls} w-32`}
            />
            <p className="text-[11px] text-gray-600 mt-1">
              Scales with price: {pct(Number(thresholdPct) || 0)} is{' '}
              {basis == null ? '—' : money(basis * (Number(thresholdPct) || 0))} on this basis.
            </p>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Minimum weekly premium ($ / share)
            </label>
            <input
              type="number" step="0.01" min="0"
              value={minWeekly} onChange={e => setMinWeekly(e.target.value)}
              className={`${inputCls} w-32`}
            />
            <p className="text-[11px] text-gray-600 mt-1">
              DTE-scaled — a 45-day contract must clear this per week, not in total.
            </p>
          </div>
        </div>
      )}

      {/* ── Candidate entry ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Candidate strikes</h3>
          {rows.length < 3 && (
            <button
              type="button" onClick={addRow}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add candidate
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_1.5fr_1.3fr_1fr_auto] gap-2 px-1 text-[11px] text-gray-500">
            <span>Strike</span>
            <span>Premium — $ per share</span>
            <span>Expiry</span>
            <span>Delta (optional)</span>
            <span className="w-7" />
          </div>

          {rows.map((row, i) => {
            const N_ = N || 0
            const totalPreview = row.premium !== '' && !Number.isNaN(Number(row.premium))
              ? Number(row.premium) * N_
              : null
            return (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1.5fr_1.3fr_1fr_auto] gap-2 items-start">
                <input
                  type="number" step="0.01" inputMode="decimal" placeholder="16.00"
                  value={row.strike} onChange={e => setRow(i, { strike: e.target.value })}
                  className={inputCls} aria-label={`Candidate ${i + 1} strike`}
                />
                <div>
                  <div className="relative">
                    <input
                      type="number" step="0.01" inputMode="decimal" placeholder="0.24"
                      value={row.premium} onChange={e => setRow(i, { premium: e.target.value })}
                      className={`${inputCls} pr-16`} aria-label={`Candidate ${i + 1} premium per share`}
                    />
                    {/* Persistent unit label — not a placeholder. Per-share vs
                        per-contract is the likeliest data-entry error here.
                        This panel stays per-share on purpose: every figure it
                        computes below (weekly-equivalent floor, value at expiry,
                        the chart) is per-share, so a "/contract" label here would
                        make its own comparison lines read against the wrong unit.
                        The number is identical to what the log form calls
                        "$ / contract" — only the word differs. */}
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">
                      $ / share
                    </span>
                  </div>
                  {totalPreview != null && (
                    <p className="text-[11px] text-gray-500 mt-1 font-mono">
                      = {money(totalPreview)} total × {N_} sh
                    </p>
                  )}
                </div>
                <DatePicker
                  value={row.expiry} onChange={val => setRow(i, { expiry: val })}
                  placeholder="Expiry"
                />
                <input
                  type="number" step="0.01" inputMode="decimal" placeholder="0.30"
                  value={row.delta} onChange={e => setRow(i, { delta: e.target.value })}
                  className={inputCls} aria-label={`Candidate ${i + 1} delta`}
                />
                <button
                  type="button" onClick={() => delRow(i)} disabled={rows.length <= 2}
                  className="p-1.5 text-gray-600 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors"
                  aria-label={`Remove candidate ${i + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Errors / warnings ───────────────────────────────────────────── */}
      {analysis.errors.map((e, i) => (
        <div key={i} className="flex gap-2 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /> {e}
        </div>
      ))}
      {analysis.warnings.map((w, i) => (
        <div key={i} className="flex gap-2 px-4 py-3 bg-amber-900/15 border border-amber-800/40 rounded-lg text-sm text-amber-400">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /> {w}
        </div>
      ))}

      {candidates.length < 2 ? (
        <p className="text-sm text-gray-500 px-1">
          Enter a strike and premium for at least two candidates to compare them.
        </p>
      ) : (
        <>
          {/* ── 1. Crossover headline ─────────────────────────────────── */}
          {headline && (
            <div className="px-5 py-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5">
              <div className="text-xs text-indigo-300/80 mb-1">
                Crossover — above this price at expiry, ${headline.higher.strike.toFixed(2)} outperforms
              </div>
              <div className="text-3xl font-bold font-mono text-white">
                {money(headline.crossover)}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Below it, ${headline.lower.strike.toFixed(2)} wins on the extra premium. Above it,
                ${headline.higher.strike.toFixed(2)} wins on the extra capital gain.
                {analysis.underlying != null && (
                  <> Underlying is {money(analysis.underlying)} — {' '}
                    {analysis.underlying >= headline.crossover
                      ? 'already above the crossover.'
                      : `${money(headline.crossover - analysis.underlying)} below it.`}
                  </>
                )}
              </p>
            </div>
          )}

          {/* ── Differing-expiry notice: annualised becomes primary ─────── */}
          {differingExpiries && (
            <div className="flex gap-2 px-4 py-3 bg-amber-900/15 border border-amber-800/40 rounded-lg text-sm text-amber-300">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Candidates have <strong>different expiries</strong>. Dollar figures are misleading on
                their own here — the longer-dated contract looks fatter purely because it holds more
                time. Compare the <strong>annualised</strong> columns instead; they are shown first below.
              </span>
            </div>
          )}

          {/* ── 2. Outcome table ──────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Value per share at expiry</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-800">
                    <th className="text-left font-medium px-4 py-2">Zone</th>
                    {candidates.map((c, i) => (
                      <th key={c.index} className="text-right font-medium px-4 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: SERIES_COLORS[i % 3] }} />
                          ${c.strike.toFixed(2)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono text-gray-300">
                  {buildZones(candidates).map(zone => (
                    <tr key={zone.label} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-4 py-2.5 font-sans text-gray-400 whitespace-nowrap">{zone.label}</td>
                      {candidates.map(c => {
                        const cell = zone.cell(c)
                        return (
                          <td key={c.index} className="px-4 py-2.5 text-right whitespace-nowrap">
                            {cell.text}
                            {cell.called && <span className="ml-1.5 text-[10px] text-amber-400/80 font-sans">called</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[11px] text-gray-500 border-t border-gray-800">
              S<sub>exp</sub> = price at expiry. A call finishing in the money caps the shares at its strike.
            </p>
          </div>

          {/* ── Payoff chart ──────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Payoff</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={analysis.chart} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="price" type="number" domain={analysis.chartDomain}
                    tickFormatter={v => `$${v.toFixed(2)}`}
                    stroke="#4b5563" fontSize={11} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `$${v.toFixed(2)}`}
                    stroke="#4b5563" fontSize={11} tickLine={false} width={62} domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    labelFormatter={v => `Price at expiry: $${Number(v).toFixed(2)}`}
                    formatter={(v, name) => [`$${Number(v).toFixed(3)} / share`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {basis != null && (
                    <ReferenceLine
                      x={basis} stroke="#f87171" strokeDasharray="4 4"
                      label={{ value: `B ${money(basis)}`, fill: '#f87171', fontSize: 10, position: 'insideTopLeft' }}
                    />
                  )}
                  {pairs.map((p, i) => (
                    <ReferenceLine
                      key={i} x={p.crossover} stroke="#a78bfa" strokeDasharray="4 4"
                      label={{ value: `× ${money(p.crossover)}`, fill: '#a78bfa', fontSize: 10, position: 'insideTopRight' }}
                    />
                  ))}
                  {candidates.map((c, i) => (
                    <Line
                      key={c.index} type="monotone" dataKey={`k${c.index}`}
                      name={`$${c.strike.toFixed(2)} @ ${money(c.premium)}`}
                      stroke={SERIES_COLORS[i % 3]} strokeWidth={2} dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Lines cross at exactly the crossover price. The red marker is your break-even basis line.
            </p>
          </div>

          {/* ── 3. Per-candidate detail ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {candidates.map((c, i) => {
              const style = FLAG_STYLES[c.safety.level]
              return (
                <div key={c.index} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: SERIES_COLORS[i % 3] }} />
                      <span className="text-base font-semibold text-white font-mono">${c.strike.toFixed(2)}</span>
                      <span className="text-xs text-gray-500 font-mono">@ {money(c.premium)}/sh</span>
                    </div>
                    {c.days != null && (
                      <span className="text-[11px] text-gray-500">{c.days}d</span>
                    )}
                  </div>

                  {/* Annualised first when expiries differ — otherwise secondary */}
                  {differingExpiries ? (
                    <>
                      <Metric label="Annualised called return" value={pct(c.annualisedCalledReturn)} big />
                      <Metric label="Annualised premium yield" value={pct(c.annualisedPremiumYield)} />
                      <Metric label="Called-away profit" value={signed(c.calledProfit)} sub={c.calledProfitPct != null ? pct(c.calledProfitPct) : null} />
                    </>
                  ) : (
                    <>
                      <Metric label="Called-away profit" value={signed(c.calledProfit)} sub={c.calledProfitPct != null ? `${pct(c.calledProfitPct)} on basis` : null} big />
                      <Metric label="Annualised called return" value={pct(c.annualisedCalledReturn)} />
                      <Metric label="Annualised premium yield" value={pct(c.annualisedPremiumYield)} />
                    </>
                  )}
                  <Metric label="Downside cushion" value={`${money(c.cushion)}/sh`} sub={`${money(c.cushionTotal)} total`} />

                  {/* Separation flag */}
                  <div className={`rounded-lg border px-3 py-2 ${style.box}`}>
                    <div className={`text-[11px] font-semibold mb-0.5 ${style.text}`}>{style.label}</div>
                    <p className="text-xs text-gray-300 leading-snug">{c.safety.message}</p>
                    {c.safety.separation != null && (
                      <div className="flex gap-4 mt-1.5 text-[10px] text-gray-500 font-mono">
                        <span>separation {signed(c.safety.separation)}</span>
                        <span>net if called {signed(c.safety.netIfCalled)}</span>
                      </div>
                    )}
                  </div>

                  {c.deadChain.dead && (
                    <div className="text-[11px] text-amber-400/90 leading-snug">
                      Weekly-equivalent premium is {money(c.deadChain.weeklyEquivalent, 3)} — below the
                      {' '}{money(c.deadChain.minWeeklyPremium)} floor.
                    </div>
                  )}

                  {onWrite && (
                    <button
                      type="button"
                      onClick={() => onWrite(
                        { strike: c.strike, premium: c.premium, expiry: c.expiry, contracts: Math.floor(N / 100) || 1 },
                        buildSnapshot(analysis, c.strike),
                      )}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                        text-indigo-300 hover:text-white border border-indigo-500/40 hover:bg-indigo-600
                        hover:border-indigo-600 rounded-lg transition-all"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      Write this call
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── 4. Implied probability + delta ────────────────────────── */}
          {pairs.map((p, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <div>
                  <div className="text-[11px] text-gray-500">
                    ${p.lower.strike.toFixed(2)} vs ${p.higher.strike.toFixed(2)} — market-implied odds you need to beat
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{pct(p.impliedProb)}</div>
                </div>
                {p.avgDelta != null && (
                  <div>
                    <div className="text-[11px] text-gray-500">Average delta between the strikes</div>
                    <div className="text-lg font-mono text-gray-300">{pct(p.avgDelta)}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-gray-500">Certain cost of taking ${p.higher.strike.toFixed(2)}</div>
                  <div className="text-lg font-mono text-gray-300">{money(p.certainCost)}</div>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-400">Simplified — the true threshold is somewhat lower.</strong>{' '}
                This is the breakeven for a binary framing (finish below ${p.lower.strike.toFixed(2)}, or above
                ${p.higher.strike.toFixed(2)}) and it ignores the middle zone. Between {money(p.crossover)} and
                ${p.higher.strike.toFixed(2)} the higher strike is already winning without ever being called,
                so the bias is conservative: it makes the higher strike look like a worse bet than it is.
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Because the chain is priced off delta, this figure will usually sit close to the average delta
                between the two strikes{p.avgDelta != null ? ` (${pct(p.avgDelta)} here)` : ''}. That agreement is
                expected, not a bug — the two strikes are near-EV-neutral by construction. The edge only exists
                where you actively disagree with the market's estimate.
              </p>
            </div>
          ))}

          {/* ── 5. Guidance ───────────────────────────────────────────── */}
          {guidance && (
            <div className={`flex gap-2.5 px-4 py-3 rounded-xl border text-sm ${
              guidance.tone === 'warn'
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
                : 'border-gray-700 bg-gray-800/40 text-gray-300'
            }`}>
              {guidance.tone === 'warn'
                ? <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                : <Check className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />}
              <span>{guidance.text}</span>
            </div>
          )}
        </>
      )}

      {/* ── Persistent scope note (spec §4, §9.10) ──────────────────────── */}
      <div className="flex gap-2 px-4 py-3 bg-gray-800/40 border border-gray-700 rounded-lg text-xs text-gray-400 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
        <span>
          This compares strikes at a <strong>single expiry</strong>. It does not evaluate rolling out in
          time — "write this strike now" versus "roll out to a later expiry" is not modelled, and it does
          not judge whether writing at all is wise. Underlying price is entered by hand; there is no live
          quote feed in this version.
        </span>
      </div>

      {onClose && (
        <div className="flex justify-end">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, sub, big }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`font-mono text-white ${big ? 'text-xl font-bold' : 'text-sm'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 font-mono">{sub}</div>}
    </div>
  )
}

/**
 * Zone rows for the outcome table. With N candidates the boundaries are the
 * sorted strikes, and a candidate is "called" in every zone at or above its own
 * strike.
 */
function buildZones(candidates) {
  const strikes = candidates.map(c => c.strike)
  const fmt = (v) => `$${v.toFixed(2)}`

  const zones = [{
    label: `Finish below ${fmt(strikes[0])}`,
    cell: (c) => ({ text: `S_exp + ${money(c.premium)}`, called: false }),
  }]

  for (let i = 0; i < strikes.length - 1; i++) {
    zones.push({
      label: `Between ${fmt(strikes[i])} and ${fmt(strikes[i + 1])}`,
      cell: (c) => (c.strike <= strikes[i]
        ? { text: `${money(c.strike + c.premium)}`, called: true }
        : { text: `S_exp + ${money(c.premium)}`, called: false }),
    })
  }

  zones.push({
    label: `Finish above ${fmt(strikes[strikes.length - 1])}`,
    cell: (c) => ({ text: `${money(c.strike + c.premium)}`, called: true }),
  })

  return zones
}
