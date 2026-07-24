/**
 * Pre-Entry Gate — verdict engine tests. Pure functions, no DB.
 *   node gate-tests.mjs   (or: npm run test:gate)
 *
 * The point of these is the ORDER of the verdict rules. Any of them can fire on
 * the same check, and the gate is only useful if it names the reason he'd
 * actually recognise — the kill, not the arithmetic downstream of it.
 */
import assert from 'node:assert/strict'
import { evaluateGate, verdictHeadline, GATE_THRESHOLD, MAX_CONTESTED } from './server/lib/gateVerdict.js'

const FACTORS = [
  { key: 'cisd',      label: 'CISD',                required: true,  kind: 'confluence', sort_order: 10 },
  { key: 'key_level', label: 'Key level tap (1hr)', required: true,  kind: 'confluence', sort_order: 20 },
  { key: 'resweep',   label: 'Resweep',             required: false, kind: 'confluence', sort_order: 30 },

  { key: 'choppy',            label: 'Choppy conditions',                  kind: 'kill', sort_order: 10 },
  { key: 'htf_level_at_stop', label: 'HTF key level at stop loss',         kind: 'kill', sort_order: 20 },
  { key: 'eqh_eql_at_stop',   label: 'Equal highs/lows at stop loss',      kind: 'kill', sort_order: 30 },
  { key: 'lrl_at_stop',       label: 'LRL at stop loss',                   kind: 'kill', sort_order: 40 },
  { key: 'against_bias',      label: 'Entry not aligned with bias',        kind: 'kill', sort_order: 50 },
  { key: 'be_taken',          label: 'Breakeven level taken before entry', kind: 'kill', sort_order: 60 },

  { key: 'news',    label: 'News in 15 min',   kind: 'contested', sort_order: 10 },
  { key: 'extended',label: 'Extended from mean', kind: 'contested', sort_order: 20 },
  { key: 'late',    label: 'Late in session',  kind: 'contested', sort_order: 30 },
]

const run = (check) => evaluateGate(check, FACTORS)
const ALL3 = ['cisd', 'key_level', 'resweep']

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`) }
}

console.log('\nPre-Entry Gate — verdict engine\n')

// ── Rule 5 / 6: the passing cases ───────────────────────────────────────────
test('all three confluences, nothing contested → A+', () => {
  const v = run({ confluences: ALL3, contested: [], kills: [] })
  assert.equal(v.verdict, 'ENTER')
  assert.equal(v.grade, 'A+')
  assert.equal(v.net_score, 3)
})

test('both required only, nothing contested → A at net 2', () => {
  const v = run({ confluences: ['cisd', 'key_level'], contested: [], kills: [] })
  assert.equal(v.verdict, 'ENTER')
  assert.equal(v.grade, 'A')
  assert.equal(v.net_score, 2)
})

test('all three minus one contested → A, not A+', () => {
  const v = run({ confluences: ALL3, contested: ['news'], kills: [] })
  assert.equal(v.verdict, 'ENTER')
  assert.equal(v.grade, 'A')
  assert.equal(v.net_score, 2)
})

// ── Rule 4: the gate ────────────────────────────────────────────────────────
test('net 1 is below the gate → NO TRADE', () => {
  const v = run({ confluences: ['cisd', 'key_level'], contested: ['news'], kills: [] })
  assert.equal(v.verdict, 'NO_TRADE')
  assert.equal(v.grade, null)
  assert.equal(v.net_score, 1)
  assert.match(v.reason, /Net score 1/)
  assert.match(v.reason, new RegExp(`gate is at ${GATE_THRESHOLD}`))
})

test('net score may go negative and still reports the score', () => {
  const v = run({ confluences: ['cisd', 'key_level'], contested: ['news', 'extended'], kills: [] })
  assert.equal(v.net_score, 0)
  assert.equal(v.verdict, 'NO_TRADE')
})

// ── Rule 3: contested cap, and that it outranks the score ───────────────────
test('more than 2 contested is a NO TRADE even at the ceiling', () => {
  const v = run({ confluences: ALL3, contested: ['news', 'extended', 'late'], kills: [] })
  assert.equal(v.verdict, 'NO_TRADE')
  assert.match(v.reason, /3 contested factors/)
  assert.equal(v.net_score, 0)
})

test('exactly 2 contested is allowed — the cap is "more than 2"', () => {
  const v = run({ confluences: ALL3, contested: ['news', 'extended'], kills: [] })
  assert.equal(v.contested_ok, undefined)   // no such field; the verdict is the answer
  assert.equal(v.verdict, 'NO_TRADE')       // net 1, fails rule 4, NOT rule 3
  assert.match(v.reason, /Net score 1/, 'at 2 contested the reason must be the score, not the cap')
  assert.equal(MAX_CONTESTED, 2)
})

// ── Rule 2: required confluences ────────────────────────────────────────────
test('missing CISD names CISD, not the score', () => {
  const v = run({ confluences: ['key_level', 'resweep'], contested: [], kills: [] })
  assert.equal(v.verdict, 'NO_TRADE')
  assert.match(v.reason, /No CISD/)
  assert.equal(v.net_score, 2, 'score still computed, just not the reason')
})

test('missing both required names both', () => {
  const v = run({ confluences: ['resweep'], contested: [], kills: [] })
  assert.match(v.reason, /CISD/)
  assert.match(v.reason, /Key level tap/)
})

test('a non-required confluence missing is fine', () => {
  const v = run({ confluences: ['cisd', 'key_level'], contested: [], kills: [] })
  assert.equal(v.verdict, 'ENTER')
})

// ── Rule 1: kills outrank everything ────────────────────────────────────────
test('a kill vetoes a perfect A+ setup', () => {
  const v = run({ confluences: ALL3, contested: [], kills: ['choppy'] })
  assert.equal(v.verdict, 'NO_TRADE')
  assert.equal(v.grade, null)
  assert.match(v.reason, /Choppy conditions/)
  assert.match(v.reason, /instant kill/)
})

test('kill outranks a missing required confluence', () => {
  const v = run({ confluences: [], contested: [], kills: ['lrl_at_stop'] })
  assert.match(v.reason, /LRL at stop loss/, 'the kill is the first failing reason, not the missing CISD')
})

test('multiple kills report the first in config order, not click order', () => {
  const v = run({ confluences: ALL3, contested: [], kills: ['be_taken', 'choppy'] })
  assert.match(v.reason, /Choppy conditions/, 'choppy sorts first (10 < 60)')
})

// ── Ceiling / config hygiene ────────────────────────────────────────────────
test('an unknown confluence key does not inflate the score', () => {
  const v = run({ confluences: [...ALL3, 'made_up'], contested: [], kills: [] })
  assert.equal(v.net_score, 3, 'ceiling is the configured confluence count')
  assert.equal(v.grade, 'A+')
})

test('free-text contested factors subtract like any other', () => {
  const v = run({ confluences: ALL3, contested: ['some_thing_i_typed'], kills: [] })
  assert.equal(v.net_score, 2)
  assert.equal(v.grade, 'A')
})

test('an unknown kill key still vetoes', () => {
  const v = run({ confluences: ALL3, contested: [], kills: ['brand_new_kill'] })
  assert.equal(v.verdict, 'NO_TRADE')
  assert.match(v.reason, /brand_new_kill/, 'falls back to the key when there is no label yet')
})

// ── Empty state ─────────────────────────────────────────────────────────────
test('an untouched check is a NO TRADE, not an ENTER', () => {
  const v = run({ confluences: [], contested: [], kills: [] })
  assert.equal(v.verdict, 'NO_TRADE')
  assert.equal(v.net_score, 0)
})

// ── Headlines are second person, never system language ──────────────────────
test('fail headline tells him to stand down', () => {
  assert.equal(verdictHeadline('NO_TRADE', null), "This isn't a good trade. Let it go.")
})

test('pass headlines state the grade', () => {
  assert.match(verdictHeadline('ENTER', 'A+'), /A\+/)
  assert.match(verdictHeadline('ENTER', 'A'),  /Grade A/)
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
