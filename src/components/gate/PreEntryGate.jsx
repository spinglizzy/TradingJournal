import { useCallback, useMemo, useState } from 'react'
import { Check, RotateCcw, Save } from 'lucide-react'
import { gateApi } from '../../api/gate.js'
import { groupFactors, slugify, DEFAULT_FACTORS } from '../../lib/gateFactors.js'
import { evaluateGate, verdictHeadline, GATE_THRESHOLD, MAX_CONTESTED } from '../../../server/lib/gateVerdict.js'

/**
 * The Pre-Entry Gate.
 *
 * One screen, no wizard. Every tick re-derives the verdict locally — evaluateGate
 * is pure and shared with the server, so the answer lands on the same frame as
 * the click.
 *
 * Ticking writes NOTHING. The scenario is saved only when he presses one of the
 * two log buttons, which is also where the decision gets recorded: he can log a
 * setup he passed on and a setup he took, and the difference between the verdict
 * and the decision is the whole point of the review view.
 *
 * It renders as a widget inside the premarket plan — the thing already open on
 * screen through the session. There is no overlay and no keyboard shortcut; the
 * tiles are click targets.
 *
 * Speed rules that shaped this file:
 *   * Kills render first, so a veto is the first thing in reach.
 *   * Nothing below the kill row is interactive once a kill is ticked.
 *   * Factors are prefetched by GateProvider, so this does no blocking I/O.
 *   * Free text is an escape hatch, never on the critical path.
 */

const TILE = 'relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors select-none'

/** Score meter — ceiling is the number of configured confluences, gate marked at 2. */
function ScoreMeter({ net, ceiling, pass }) {
  const slots = Array.from({ length: ceiling }, (_, i) => i + 1)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Net score</span>
        <span className={`text-2xl font-bold font-mono leading-none ${pass ? 'text-emerald-400' : 'text-gray-500'}`}>
          {net > 0 ? `+${net}` : net}
        </span>
      </div>
      <div className="flex gap-1">
        {slots.map(n => (
          <div key={n} className="flex-1 relative">
            <div className={`h-2 rounded-sm transition-colors ${
              net >= n ? (pass ? 'bg-emerald-500' : 'bg-gray-500') : 'bg-gray-800'
            }`} />
            {n === GATE_THRESHOLD && (
              <div className="absolute -right-px -top-1 -bottom-1 w-px bg-amber-400/80" title={`Gate at ${GATE_THRESHOLD}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">0</span>
        <span className="text-[10px] text-amber-500/80 font-medium">gate {GATE_THRESHOLD}</span>
        <span className="text-[10px] text-gray-600">{ceiling}</span>
      </div>
    </div>
  )
}

/**
 * @param {object[]} factors            the config-driven lists, from GateContext
 * @param {function} onSaved            called after every successful save, so a parent list can refresh
 * @param {function} onFactorsChanged   called when the contested list itself is edited
 */
export default function PreEntryGate({ factors: factorsProp, onSaved, onFactorsChanged }) {
  const factors = factorsProp?.length ? factorsProp : DEFAULT_FACTORS
  const grouped = useMemo(() => groupFactors(factors), [factors])

  const [kills,       setKills]       = useState([])
  const [confluences, setConfluences] = useState([])
  const [contested,   setContested]   = useState([])
  const [instrument,  setInstrument]  = useState(() => localStorage.getItem('gate_instrument') || 'NQ')
  const [freeText,    setFreeText]    = useState('')
  const [note,        setNote]        = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState(null)

  const verdict = useMemo(
    () => evaluateGate({ confluences, contested, kills }, factors),
    [confluences, contested, kills, factors]
  )

  const killed  = kills.length > 0
  const touched = kills.length > 0 || confluences.length > 0 || contested.length > 0
  const ceiling = grouped.confluence.length

  const clear = useCallback(() => {
    setKills([]); setConfluences([]); setContested([])
    setFreeText(''); setNote(''); setSaveError(null)
  }, [])

  /**
   * Write the scenario. `took` is what he actually did, which is deliberately
   * separate from the verdict — logging a taken trade against a NO TRADE is the
   * rulebreak, and the gate has to make that easy to record rather than awkward.
   */
  const logScenario = useCallback(async (took) => {
    if (!touched || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const row = await gateApi.create({
        instrument, confluences, contested, kills,
        note: note.trim() || null,
        took_trade: took,
      })
      onSaved?.(row)
      clear()
    } catch (err) {
      // Surface it — a scenario that silently failed to save is worse than no
      // gate, because the review would under-count exactly the entries that matter.
      console.error('Log scenario failed:', err)
      setSaveError(err?.message || 'Could not log this scenario')
    } finally {
      setSaving(false)
    }
  }, [touched, saving, instrument, confluences, contested, kills, note, onSaved, clear])

  // ── Toggles ────────────────────────────────────────────────────────────────
  const toggle = useCallback((setter) => (key) => {
    setter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }, [])
  const toggleKill       = useMemo(() => toggle(setKills),       [toggle])
  const toggleConfluence = useMemo(() => toggle(setConfluences), [toggle])
  const toggleContested  = useMemo(() => toggle(setContested),   [toggle])

  function addFreeText() {
    const text = freeText.trim()
    if (!text) return
    const key = slugify(text) || text
    if (!contested.includes(key)) setContested(prev => [...prev, key])
    setFreeText('')
    // Grow the tick-list so this is one click next time rather than typing again.
    gateApi.addFactor({ label: text, kind: 'contested' })
      .then(() => onFactorsChanged?.())
      .catch(() => {})
  }

  /**
   * Drop a contested factor off the tick-list for good.
   *
   * The list is seeded from `trades.pd_arrays`, which is labelled "Contested
   * Factors" in the trade form but historically holds PD arrays and timeframes
   * too. Pruning it matters: every tile that isn't a real reason to stand down
   * is a tile to scan past.
   */
  function removeFactor(f) {
    if (!f.id || !f.user_id) return          // system defaults aren't deletable here
    setContested(prev => prev.filter(k => k !== f.key))
    gateApi.delFactor(f.id)
      .then(() => onFactorsChanged?.())
      .catch(err => console.error('Could not remove factor:', err))
  }

  const pass = verdict.verdict === 'ENTER'
  const dim  = killed ? 'opacity-25 pointer-events-none transition-opacity' : 'transition-opacity'

  return (
    <div className="flex flex-col gap-4">

      {/* ── Status strip — instrument, clear ──────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={instrument}
          onChange={e => { const v = e.target.value.toUpperCase(); setInstrument(v); localStorage.setItem('gate_instrument', v) }}
          className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-indigo-500"
          aria-label="Instrument"
        />
        <span className="text-[11px] text-gray-600">nothing is saved until you log it</span>
        <button
          type="button"
          onClick={clear}
          disabled={!touched}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 border border-gray-800 hover:border-gray-700 rounded transition-colors"
          title="Clear without logging"
        >
          <RotateCcw className="w-3 h-3" /> Clear
        </button>
      </div>

      {/* ── Instant kills — always first, always live ─────────────────────── */}
      <section>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Instant kills</h4>
          <span className="text-[11px] text-gray-600">any one vetoes the setup</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {grouped.kill.map(f => {
            const on = kills.includes(f.key)
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleKill(f.key)}
                className={`${TILE} ${on
                  ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-rose-500/40 hover:text-rose-300'}`}
              >
                <span className="text-xs font-medium leading-tight">{f.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Everything below dims once a kill is ticked ───────────────────── */}
      <div className={`grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 ${dim}`}>

        <div className="flex flex-col gap-4">
          {/* Confluences */}
          <section>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Confluences</h4>
              <span className="text-[11px] text-gray-600">+1 each · ceiling +{ceiling}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {grouped.confluence.map(f => {
                const on = confluences.includes(f.key)
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleConfluence(f.key)}
                    className={`${TILE} ${on
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-emerald-500/40 hover:text-emerald-300'}`}
                  >
                    <span className="text-xs font-medium leading-tight">{f.label}</span>
                    {f.required && (
                      <span className={`ml-auto text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                        on ? 'text-emerald-300/70' : 'text-amber-500/80'
                      }`}>
                        req
                      </span>
                    )}
                    {on && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Contested */}
          <section>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Contested</h4>
              <span className="text-[11px] text-gray-600">−1 each · more than {MAX_CONTESTED} is a no</span>
              {contested.length > 0 && (
                <span className={`ml-auto text-[11px] font-mono font-bold ${
                  contested.length > MAX_CONTESTED ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  −{contested.length}
                </span>
              )}
            </div>

            {grouped.contested.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped.contested.map(f => {
                  const on = contested.includes(f.key)
                  return (
                    <div key={f.key} className="relative group">
                      <button
                        type="button"
                        onClick={() => toggleContested(f.key)}
                        className={`w-full ${TILE} ${on
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                          : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-amber-500/40 hover:text-amber-300'}`}
                      >
                        <span className="text-xs font-medium leading-tight pr-3">{f.label}</span>
                      </button>
                      {f.user_id && (
                        <button
                          type="button"
                          onClick={() => removeFactor(f)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 grid place-items-center rounded text-gray-600 hover:text-rose-400 hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                          title={`Remove "${f.label}" from the list`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[11px] text-gray-600 italic">
                No contested factors on the list yet — add one below and it becomes a tick next time.
              </p>
            )}

            {/* Free-text items added this check but not yet on the list */}
            {contested.filter(k => !grouped.contested.some(f => f.key === k)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {contested.filter(k => !grouped.contested.some(f => f.key === k)).map(k => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border bg-amber-500/10 text-amber-300 border-amber-500/20">
                    {k.replace(/_/g, ' ')}
                    <button type="button" onClick={() => toggleContested(k)} className="opacity-60 hover:opacity-100 ml-0.5 leading-none">×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Type anything here and it is ticked for this check AND added to
                the list above, so the vocabulary grows by being used. */}
            <input
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFreeText() } }}
              onBlur={addFreeText}
              placeholder="Add a contested factor — Enter to save it to the list…"
              className="w-full mt-2 bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/60"
            />
          </section>
        </div>

        {/* Score meter — beside the verdict, out of the tick path */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 self-start">
          <ScoreMeter net={verdict.net_score} ceiling={ceiling} pass={pass} />
          <div className="mt-4 pt-3 border-t border-gray-800 space-y-1.5 text-[11px] text-gray-500">
            <div className="flex justify-between"><span>Confluences</span><span className="font-mono text-emerald-400">+{confluences.length}</span></div>
            <div className="flex justify-between"><span>Contested</span><span className="font-mono text-amber-400">−{contested.length}</span></div>
          </div>
        </div>
      </div>

      {/* ── Verdict — plain second person, never system language ──────────── */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${
        pass ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40'
      }`}>
        <div className="flex-1">
          <p className={`text-lg font-bold leading-tight ${pass ? 'text-emerald-300' : 'text-rose-300'}`}>
            {touched ? verdictHeadline(verdict.verdict, verdict.grade) : 'Tick what you see.'}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            {touched ? verdict.reason : "Kills first. If one of them is true, you're done."}
          </p>
        </div>
        {touched && pass && (
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-emerald-500/70 font-medium">Grade</div>
            <div className="text-3xl font-bold text-emerald-300 leading-none">{verdict.grade}</div>
          </div>
        )}
      </div>

      {/* ── Log the scenario ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2.5">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder={pass
            ? 'Why you took it, or why you passed anyway (optional)…'
            : 'Why you stood down — or why you took it anyway (optional)…'}
          className="w-full bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-indigo-500 resize-none"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => logScenario(true)}
            disabled={!touched || saving}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Logging…' : 'Log — took it'}
          </button>
          <button
            type="button"
            onClick={() => logScenario(false)}
            disabled={!touched || saving}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white disabled:opacity-30"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Logging…' : 'Log — passed'}
          </button>
          <span className="text-[11px] text-gray-600">
            {touched
              ? (!pass ? 'Logging this as taken records it as a rulebreak.' : 'Logged either way — the record is the point.')
              : 'Tick something first.'}
          </span>
        </div>
        {saveError && (
          <p className="text-[11px] text-rose-400">{saveError} — nothing was saved, try again.</p>
        )}
      </div>

      <p className="text-center text-[10px] text-gray-700">
        Advisory only — nothing here blocks you.
      </p>
    </div>
  )
}
