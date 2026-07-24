import { useMemo } from 'react'
import { Plus, Trash2, MapPin } from 'lucide-react'
import { useGate } from '../../contexts/GateContext.jsx'

/**
 * Premarket levels and zones.
 *
 * This exists to move the level-based instant kills off the critical path. HTF
 * key level at the stop, equal highs/lows at the stop, LRL at the stop — all
 * three are knowable now, from the level alone, hours before anything triggers.
 * Mark them here against each zone and the gate pre-ticks them when that zone is
 * selected, leaving only the genuinely live factors to assess at trigger time.
 *
 * Zones live in journal_entries.plan_data.zones — no schema of their own.
 */

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
  text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

function newId() { return Date.now() + Math.random() }

function emptyZone() {
  return { id: newId(), label: '', price: '', note: '', kills: [] }
}

export default function PremarketZones({ zones = [], onChange }) {
  const { factors } = useGate()

  // Only the kills a level can settle in advance. A non-level kill like "choppy
  // conditions" can't be known from a price, so it never appears here.
  const levelKills = useMemo(
    () => factors
      .filter(f => f.kind === 'kill' && f.level_based)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [factors]
  )

  function add()               { onChange([...zones, emptyZone()]) }
  function remove(id)          { onChange(zones.filter(z => z.id !== id)) }
  function patch(id, p)        { onChange(zones.map(z => z.id === id ? { ...z, ...p } : z)) }
  function toggleKill(id, key) {
    onChange(zones.map(z => z.id !== id ? z : {
      ...z,
      kills: z.kills.includes(key) ? z.kills.filter(k => k !== key) : [...z.kills, key],
    }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400" />
            Levels &amp; Zones
          </h3>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Mark what's sitting at each level now. The Pre-Entry Gate pre-ticks these kills when you pick the zone.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add Zone
        </button>
      </div>

      {zones.length === 0 ? (
        <p className="text-xs text-gray-600 italic">
          No zones yet — add the levels you're watching so the gate can do the level checks for you.
        </p>
      ) : (
        <div className="space-y-2">
          {zones.map(zone => (
            <div key={zone.id} className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={zone.label}
                  onChange={e => patch(zone.id, { label: e.target.value })}
                  placeholder="Zone name — e.g. PDH, 1hr FVG, Asia high"
                  className={`${inputCls} flex-1`}
                />
                <input
                  value={zone.price}
                  onChange={e => patch(zone.id, { price: e.target.value })}
                  placeholder="Price"
                  inputMode="decimal"
                  className={`${inputCls} w-28 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => remove(zone.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-gray-800 shrink-0"
                  title="Remove zone"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <span className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">
                  At the stop for a setup here
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {levelKills.map(k => {
                    const on = (zone.kills || []).includes(k.key)
                    return (
                      <button
                        key={k.key}
                        type="button"
                        onClick={() => toggleKill(zone.id, k.key)}
                        className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                          on
                            ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-rose-500/40 hover:text-rose-300'
                        }`}
                      >
                        {k.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <input
                value={zone.note}
                onChange={e => patch(zone.id, { note: e.target.value })}
                placeholder="Note (optional) — what you want to see here"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
