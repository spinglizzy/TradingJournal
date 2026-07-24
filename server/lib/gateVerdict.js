/**
 * Pre-Entry Gate — the verdict engine.
 *
 * Pure: no I/O, no React, no pg. The client imports this directly so the verdict
 * updates on the same frame as a tick (a round trip at trigger time would defeat
 * the point of the feature), and server/routes/gate.js re-derives from the same
 * function on every write so a tampered or stale client can never persist a
 * verdict the rules don't produce.
 *
 * Scoring: net_score = confluences.length - contested.length. Ceiling is the
 * number of active confluences (3 today). Nothing else scores.
 */

export const GATE_THRESHOLD    = 2   // net score at or above this passes
export const MAX_CONTESTED     = 2   // more than this is an automatic NO TRADE

/** Sort helper so "the first failing reason" is stable and matches display order. */
function bySortOrder(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.key).localeCompare(String(b.key))
}

function labelFor(factors, kind, key) {
  const f = factors.find(x => x.kind === kind && x.key === key)
  // Free-text contested factors have no config row — the key IS the label.
  return f?.label ?? key
}

/**
 * @param {object}   check
 * @param {string[]} check.confluences  selected confluence keys
 * @param {string[]} check.contested    selected contested keys (may include free text)
 * @param {string[]} check.kills        selected kill keys
 * @param {object[]} factors            active gate_factors rows: { key, label, kind, required, sort_order }
 * @returns {{ verdict:'ENTER'|'NO_TRADE', grade:'A+'|'A'|null, net_score:number, reason:string }}
 */
export function evaluateGate({ confluences = [], contested = [], kills = [] } = {}, factors = []) {
  const confluenceFactors = factors.filter(f => f.kind === 'confluence').sort(bySortOrder)
  const requiredKeys      = confluenceFactors.filter(f => f.required).map(f => f.key)
  const confluenceCeiling = confluenceFactors.length

  // Only count selections the config still knows about, so a deactivated
  // confluence can't keep inflating the score of a fresh check.
  const validConfluences = confluences.filter(k => confluenceFactors.some(f => f.key === k))
  const net_score = validConfluences.length - contested.length

  // ── Rule 1: any instant kill vetoes, regardless of score ──
  if (kills.length > 0) {
    const killFactors = factors.filter(f => f.kind === 'kill').sort(bySortOrder)
    // Report in config order, not click order — "first failing reason" should be
    // the one highest in the list he just looked at.
    const first = killFactors.find(f => kills.includes(f.key))?.key ?? kills[0]
    return {
      verdict: 'NO_TRADE',
      grade: null,
      net_score,
      reason: `${labelFor(factors, 'kill', first)} — that's an instant kill.`,
    }
  }

  // ── Rule 2: either required confluence missing ──
  const missing = requiredKeys.filter(k => !validConfluences.includes(k))
  if (missing.length > 0) {
    const names = missing.map(k => labelFor(factors, 'confluence', k))
    return {
      verdict: 'NO_TRADE',
      grade: null,
      net_score,
      reason: names.length === 1
        ? `No ${names[0]}. That one is required.`
        : `No ${names.join(' and no ')}. Both are required.`,
    }
  }

  // ── Rule 3: more than 2 contested factors ──
  if (contested.length > MAX_CONTESTED) {
    return {
      verdict: 'NO_TRADE',
      grade: null,
      net_score,
      reason: `${contested.length} contested factors. ${MAX_CONTESTED} is the limit.`,
    }
  }

  // ── Rule 4: net score below the gate ──
  if (net_score < GATE_THRESHOLD) {
    return {
      verdict: 'NO_TRADE',
      grade: null,
      net_score,
      reason: `Net score ${net_score}. The gate is at ${GATE_THRESHOLD}.`,
    }
  }

  // ── Rule 5: everything, nothing against it ──
  if (validConfluences.length === confluenceCeiling && contested.length === 0) {
    return {
      verdict: 'ENTER',
      grade: 'A+',
      net_score,
      reason: `All ${confluenceCeiling} confluences, nothing contested.`,
    }
  }

  // ── Rule 6: passes the gate ──
  return {
    verdict: 'ENTER',
    grade: 'A',
    net_score,
    reason: `Net score ${net_score}, at or above the gate.`,
  }
}

/**
 * The headline line for the verdict panel. Second person, plain language —
 * on a fail it reads like a person telling him to stand down, never like a
 * validation error.
 */
export function verdictHeadline(verdict, grade) {
  if (verdict === 'NO_TRADE') return "This isn't a good trade. Let it go."
  return grade === 'A+' ? "Take it. That's an A+." : 'Take it. Grade A.'
}
