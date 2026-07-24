import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldAlert, X, Check, RotateCcw, MapPin, Cloud, CloudOff, Keyboard } from 'lucide-react'
import { gateApi } from '../../api/gate.js'
import { groupFactors, slugify, DEFAULT_FACTORS } from '../../lib/gateFactors.js'
import { evaluateGate, verdictHeadline, GATE_THRESHOLD, MAX_CONTESTED } from '../../../server/lib/gateVerdict.js'

/**
 * The Pre-Entry Gate.
 *
 * One screen, no wizard, no submit button. Every tick re-derives the verdict
 * locally (evaluateGate is pure and shared with the server) and schedules an
 * auto-save. The row is created on the first tick and updated after that, so a
 * check is on the record whether or not the trade gets taken.
 *
 * Two shells over the same body:
 *   * `GateBody variant="inline"` — lives inside the premarket plan, which is
 *     what's actually open during the session. Zones come straight from the plan
 *     being edited, so a level added this morning is tickable immediately.
 *   * `PreEntryGate` — the Shift+G full-screen overlay, for when the plan isn't open.
 *
 * Speed rules that shaped this file:
 *   * Kills render first and are hotkeyed 1-6, so a veto is one keystroke.
 *   * Nothing below the kill row is interactive once a kill is ticked.
 *   * Factors are prefetched by GateProvider, so opening does no blocking I/O.
 *   * Free text is behind `/` — an escape hatch, never on the critical path.
 */

const TILE = 'relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors select-none'

function Key({ children, tone = 'gray' }) {
  const cls = {
    gray:    'bg-gray-800 text-gray-500 border-gray-700',
    rose:    'bg-rose-500/20 text-rose-200 border-rose-500/40',
    emerald: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    amber:   'bg-amber-500/20 text-amber-200 border-amber-500/40',
  }[tone]
  return (
    <kbd className={`shrink-0 w-5 h-5 grid place-items-center rounded border text-[10px] font-bold font-mono uppercase ${cls}`}>
      {children}
    </kbd>
  )
}

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
 * The gate itself.
 *
 * @param {'overlay'|'inline'} variant
 * @param {boolean} active     mount/arm the check. Overlay: is it open. Inline: always true.
 * @param {boolean} hotkeys    are number/letter keys live right now
 * @param {object[]} zones     supplied by the premarket plan when inline; fetched when not
 * @param {function} onSaved   called after every successful save, so a parent list can refresh
 */
export function GateBody({
  variant = 'overlay',
  active = true,
  hotkeys = true,
  factors: factorsProp,
  zones: zonesProp,
  onClose,
  onSaved,
  onFactorsChanged,
}) {
  const inline  = variant === 'inline'
  const factors = factorsProp?.length ? factorsProp : DEFAULT_FACTORS
  const grouped = useMemo(() => groupFactors(factors), [factors])

  const [kills,       setKills]       = useState([])
  const [confluences, setConfluences] = useState([])
  const [contested,   setContested]   = useState([])
  const [zone,        setZone]        = useState(null)     // { label, kills[] }
  const [fetchedZones, setFetchedZones] = useState([])
  const [instrument,  setInstrument]  = useState(() => localStorage.getItem('gate_instrument') || 'NQ')
  const [freeText,    setFreeText]    = useState('')
  const [checkId,     setCheckId]     = useState(null)
  const [saveState,   setSaveState]   = useState('idle')   // idle | saving | saved | error
  const [openedAt,    setOpenedAt]    = useState(null)

  const freeRef  = useRef(null)
  const discard  = useRef(false)    // Escape out of the free-text box = throw it away, not commit it
  const saveRef  = useRef(null)     // debounce timer
  const latest   = useRef(null)     // newest payload, so a flush never saves a stale one
  const inflight = useRef(false)

  // Inline, zones come from the plan currently being edited — including edits not
  // yet saved. Only the overlay has to go and ask the server.
  const zones = zonesProp ?? fetchedZones

  const verdict = useMemo(
    () => evaluateGate({ confluences, contested, kills }, factors),
    [confluences, contested, kills, factors]
  )

  const killed  = kills.length > 0
  const touched = kills.length > 0 || confluences.length > 0 || contested.length > 0
  const ceiling = grouped.confluence.length

  // ── Reset for a new check ──────────────────────────────────────────────────
  const reset = useCallback(() => {
    setKills([]); setConfluences([]); setContested([])
    setZone(null); setFreeText(''); setCheckId(null); setSaveState('idle')
    setOpenedAt(new Date())
  }, [])

  // Each run is an independent assessment of one setup, never a form being
  // resumed — so the overlay starts clean every time it opens.
  useEffect(() => {
    if (!active) return
    reset()
    if (zonesProp) return
    gateApi.zones().then(r => setFetchedZones(r.zones || [])).catch(() => setFetchedZones([]))
  }, [active, reset, zonesProp])

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const payload = useMemo(() => ({
    instrument, confluences, contested, kills,
    zone_label: zone?.label ?? null,
  }), [instrument, confluences, contested, kills, zone])

  latest.current = payload

  const flush = useCallback(async () => {
    if (!touched || inflight.current) return
    inflight.current = true
    setSaveState('saving')
    try {
      const body = latest.current
      let row
      if (checkId == null) {
        row = await gateApi.create(body)
        setCheckId(row.id)
        setOpenedAt(new Date(row.created_at))
      } else {
        row = await gateApi.update(checkId, body)
      }
      setSaveState('saved')
      onSaved?.(row)
    } catch (err) {
      // Surface it — a check that silently failed to save is worse than no gate,
      // because the review view would under-count exactly the entries that matter.
      console.error('Gate check save failed:', err)
      setSaveState('error')
    } finally {
      inflight.current = false
    }
  }, [checkId, touched, onSaved])

  useEffect(() => {
    if (!active || !touched) return
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(flush, 400)
    return () => clearTimeout(saveRef.current)
  }, [payload, active, touched, flush])

  const saveAndReset = useCallback(() => {
    clearTimeout(saveRef.current)
    if (touched) flush()
    reset()
  }, [flush, reset, touched])

  const closeAndSave = useCallback(() => {
    clearTimeout(saveRef.current)
    if (touched) flush()
    onClose?.()
  }, [flush, onClose, touched])

  // ── Toggles ────────────────────────────────────────────────────────────────
  const toggle = useCallback((setter) => (key) => {
    setter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }, [])
  const toggleKill       = useMemo(() => toggle(setKills),       [toggle])
  const toggleConfluence = useMemo(() => toggle(setConfluences), [toggle])
  const toggleContested  = useMemo(() => toggle(setContested),   [toggle])

  /**
   * Picking a premarket zone pre-ticks the level-based kills already marked
   * against that level this morning. Only the level kills are touched — anything
   * ticked live stays ticked.
   */
  const pickZone = useCallback((z) => {
    setZone(prevZone => {
      if (prevZone?.label === z.label) {
        const levelKeys = grouped.kill.filter(k => k.level_based).map(k => k.key)
        setKills(prev => prev.filter(k => !(levelKeys.includes(k) && z.kills.includes(k))))
        return null
      }
      setKills(prev => [...new Set([...prev, ...z.kills])])
      return z
    })
  }, [grouped])

  function addFreeText() {
    const text = freeText.trim()
    if (!text) return
    const key = slugify(text) || text
    if (!contested.includes(key)) setContested(prev => [...prev, key])
    setFreeText('')
    freeRef.current?.blur()
    // Grow the tick-list so this is one keystroke next time rather than typing again.
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
   * is a tile to scan past, and the whole budget is ten seconds.
   */
  function removeFactor(f) {
    if (!f.id || !f.user_id) return          // system defaults aren't deletable here
    setContested(prev => prev.filter(k => k !== f.key))
    gateApi.delFactor(f.id)
      .then(() => onFactorsChanged?.())
      .catch(err => console.error('Could not remove factor:', err))
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !hotkeys) return

    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable
      if (e.key === 'Escape') {
        if (typing) { e.target.blur(); return }
        if (!inline) { e.preventDefault(); closeAndSave() }
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return

      const k = e.key.toLowerCase()

      if (k === '/') { e.preventDefault(); freeRef.current?.focus(); return }
      if (k === 'x') { e.preventDefault(); saveAndReset(); return }
      if (k === 'z' && zones.length) {
        e.preventDefault()
        const i = zones.findIndex(z => z.label === zone?.label)
        pickZone(zones[(i + 1) % zones.length])
        return
      }

      const hit = (list, fn) => {
        const f = list.find(x => x.hotkey === k)
        if (!f) return false
        e.preventDefault(); fn(f.key); return true
      }

      if (hit(grouped.kill, toggleKill)) return
      // Once a kill is ticked there is nothing left to assess — swallow the rest
      // so a stray keystroke can't quietly change a score he is no longer reading.
      if (killed) return
      if (hit(grouped.confluence, toggleConfluence)) return
      hit(grouped.contested, toggleContested)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, hotkeys, inline, grouped, killed, zones, zone, saveAndReset, closeAndSave, pickZone,
      toggleKill, toggleConfluence, toggleContested])

  if (!active) return null

  const pass = verdict.verdict === 'ENTER'
  const dim  = killed ? 'opacity-25 pointer-events-none transition-opacity' : 'transition-opacity'

  return (
    <div className={inline ? 'flex flex-col gap-4' : 'flex-1 min-h-0 overflow-hidden px-5 py-4 flex flex-col gap-4'}>

      {/* ── Status strip — instrument, replay timestamp, save state ───────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={instrument}
          onChange={e => { const v = e.target.value.toUpperCase(); setInstrument(v); localStorage.setItem('gate_instrument', v) }}
          className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-indigo-500"
          aria-label="Instrument"
        />
        {openedAt && (
          <span className="text-[11px] font-mono text-gray-600" title="Timestamp saved with this check — use it to find the bar in replay">
            {openedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        {hotkeys && (
          <span className="text-[10px] text-emerald-500/70 flex items-center gap-1" title="Number and letter keys toggle items">
            <Keyboard className="w-3 h-3" /> keys live
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-gray-600 flex items-center gap-1.5">
            {saveState === 'error'
              ? <><CloudOff className="w-3.5 h-3.5 text-rose-400" /><span className="text-rose-400">not saved</span></>
              : saveState === 'saved'
                ? <><Cloud className="w-3.5 h-3.5 text-emerald-500/70" />saved</>
                : saveState === 'saving' ? <><Cloud className="w-3.5 h-3.5 animate-pulse" />saving…</> : null}
          </span>
          <button
            type="button"
            onClick={saveAndReset}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 rounded transition-colors"
            title="Save this one and start another check (X)"
          >
            <RotateCcw className="w-3 h-3" /> New <Key>X</Key>
          </button>
        </div>
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
            const fromZone = on && zone?.kills?.includes(f.key)
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleKill(f.key)}
                className={`${TILE} ${on
                  ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-rose-500/40 hover:text-rose-300'}`}
              >
                <Key tone={on ? 'rose' : 'gray'}>{f.hotkey}</Key>
                <span className="text-xs font-medium leading-tight">{f.label}</span>
                {fromZone && (
                  <span className="ml-auto text-[9px] uppercase tracking-wide text-rose-300/70 shrink-0" title="Pre-ticked from your premarket zone">
                    zone
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Zones — pre-fill from the premarket plan ──────────────────────── */}
      {zones.length > 0 && (
        <section className={dim}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Zone <Key>Z</Key>
            </span>
            {zones.map(z => (
              <button
                key={z.id ?? z.label}
                type="button"
                onClick={() => pickZone(z)}
                className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                  zone?.label === z.label
                    ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-indigo-500/40'
                }`}
                title={z.kills?.length ? `Pre-ticks ${z.kills.length} kill${z.kills.length === 1 ? '' : 's'}` : 'No kills marked on this zone'}
              >
                {z.label}
                {z.price != null && z.price !== '' && <span className="ml-1.5 font-mono text-[11px] text-gray-500">{z.price}</span>}
                {z.kills?.length > 0 && <span className="ml-1.5 text-[10px] text-rose-400">●{z.kills.length}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Everything below dims once a kill is ticked ───────────────────── */}
      <div className={`${inline ? '' : 'flex-1 min-h-0'} grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 ${dim}`}>

        <div className={`flex flex-col gap-4 ${inline ? '' : 'min-h-0 overflow-y-auto'}`}>
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
                    <Key tone={on ? 'emerald' : 'gray'}>{f.hotkey}</Key>
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
          <section className={inline ? '' : 'flex-1 min-h-0 flex flex-col'}>
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
              <div className={`grid grid-cols-2 lg:grid-cols-3 gap-2 ${inline ? '' : 'overflow-y-auto'}`}>
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
                        {f.hotkey ? <Key tone={on ? 'amber' : 'gray'}>{f.hotkey}</Key> : <span className="w-5 shrink-0" />}
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

            <div className="flex items-center gap-2 mt-2">
              <Key>/</Key>
              <input
                ref={freeRef}
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addFreeText() }
                  if (e.key === 'Escape') {
                    // Stop it reaching the overlay handler, which would close the gate.
                    e.preventDefault(); e.stopPropagation()
                    discard.current = true
                    e.target.blur()
                  }
                }}
                onBlur={() => {
                  if (discard.current) { discard.current = false; setFreeText(''); return }
                  addFreeText()
                }}
                placeholder="Something not on the list…"
                className="flex-1 bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </section>
        </div>

        {/* Score meter — beside the verdict, out of the tick path */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 self-start">
          <ScoreMeter net={verdict.net_score} ceiling={ceiling} pass={pass} />
          <div className="mt-4 pt-3 border-t border-gray-800 space-y-1.5 text-[11px] text-gray-500">
            <div className="flex justify-between"><span>Confluences</span><span className="font-mono text-emerald-400">+{confluences.length}</span></div>
            <div className="flex justify-between"><span>Contested</span><span className="font-mono text-amber-400">−{contested.length}</span></div>
            {zone && <div className="flex justify-between"><span>Zone</span><span className="text-indigo-300">{zone.label}</span></div>}
          </div>
        </div>
      </div>

      {/* ── Verdict — plain second person, never system language ──────────── */}
      <div className={`shrink-0 rounded-xl border p-4 flex items-center gap-4 ${
        pass ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40'
      }`}>
        <div className="flex-1">
          <p className={`text-lg font-bold leading-tight ${pass ? 'text-emerald-300' : 'text-rose-300'}`}>
            {touched ? verdictHeadline(verdict.verdict, verdict.grade) : 'Tick what you see.'}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            {touched ? verdict.reason : `Kills first — ${grouped.kill.map(f => f.hotkey).join('/')}. If one is true, you're done.`}
          </p>
        </div>
        {touched && pass && (
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-emerald-500/70 font-medium">Grade</div>
            <div className="text-3xl font-bold text-emerald-300 leading-none">{verdict.grade}</div>
          </div>
        )}
      </div>

      <p className="shrink-0 text-center text-[10px] text-gray-700">
        Advisory only — nothing here blocks you. Every check is saved either way.{inline ? '' : ' Esc to close.'}
      </p>
    </div>
  )
}

/** Full-screen overlay shell — the Shift+G path, for when the plan isn't open. */
export default function PreEntryGate({ isOpen, onClose, factors, onFactorsChanged }) {
  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-gray-950/95 backdrop-blur-sm flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-gray-800">
        <ShieldAlert className="w-5 h-5 text-amber-400" />
        <h2 className="text-sm font-semibold text-white">Pre-Entry Gate</h2>
        <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <GateBody variant="overlay" active factors={factors} onClose={onClose} onFactorsChanged={onFactorsChanged} />
    </div>,
    document.body
  )
}
