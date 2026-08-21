/**
 * One-shot backfill: move wheel P&L from the legs onto one result row per run.
 *
 *   node wheel-cyclepnl-backfill.mjs            # dry run
 *   node wheel-cyclepnl-backfill.mjs --apply
 *
 * A wheel play is one trade — see cycleJournalPnl in server/lib/wheelEngine.js.
 * Rows written before that was true have premium booked leg by leg, which both
 * claimed results mid-run and left every cycle's SHARE P&L out of the journal
 * entirely. This clears every leg's `pnl` and writes the summary row each closed
 * cycle should have, dated the day the run ended.
 *
 * Supersedes wheel-rollpnl-backfill.mjs, which deferred only roll chains.
 *
 * Idempotent: recomputeCycle performs the same two operations on every cycle
 * event, so re-running this finds nothing to do.
 */
import 'dotenv/config'
import pg from 'pg'
import { cycleJournalPnl, sumLegPremium } from './server/lib/wheelEngine.js'

const APPLY = process.argv.includes('--apply')
const pool  = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const { rows: cycles } = await pool.query('SELECT * FROM wheel_cycles ORDER BY id')
const { rows: rows }   = await pool.query(
  `SELECT * FROM trades WHERE strategy_tag = 'wheel' ORDER BY wheel_cycle_id, id`)

const legs    = rows.filter(r => r.leg_status != null)
const summary = rows.filter(r => r.leg_status == null)

const clearing = legs.filter(l => l.pnl != null)
const plan = []
for (const c of cycles) {
  const own      = legs.filter(l => l.wheel_cycle_id === c.id)
  const existing = summary.find(r => r.wheel_cycle_id === c.id)
  const pnl      = cycleJournalPnl(c, own)
  if (pnl == null) { if (existing) plan.push({ action: 'delete', cycle: c.id, ticker: c.ticker, id: existing.id }); continue }
  plan.push({
    action: existing ? 'update' : 'insert',
    cycle: c.id, ticker: c.ticker, date: c.closed_at, pnl,
    premium: Math.round(sumLegPremium(own) * 100) / 100,
    id: existing?.id ?? null,
  })
}

console.log(`legs to clear: ${clearing.length} (booking ${clearing.reduce((s, l) => s + Number(l.pnl), 0).toFixed(2)} today)`)
console.table(plan)
console.log(`result rows total: ${plan.filter(p => p.action !== 'delete').reduce((s, p) => s + p.pnl, 0).toFixed(2)}`)

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write'); await pool.end(); process.exit(0) }

const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(
    `UPDATE trades SET pnl = NULL, updated_at = NOW()
      WHERE strategy_tag = 'wheel' AND leg_status IS NOT NULL AND pnl IS NOT NULL`)

  for (const p of plan) {
    const c = cycles.find(x => x.id === p.cycle)
    if (p.action === 'delete') { await client.query('DELETE FROM trades WHERE id = $1', [p.id]); continue }

    const notes = `The complete ${c.ticker} wheel run, ${c.opened_at} to ${p.date}: `
      + `premium across every leg, net of commissions, plus the gain or loss on the `
      + `shares. The individual legs carry no P&L of their own — the run is the trade.`

    const { rows: [strategy] } = await client.query(
      `SELECT id FROM strategies WHERE user_id = $1 AND lower(name) = lower('Wheel Play') LIMIT 1`, [c.user_id])
    if (!strategy) throw new Error(`no "Wheel Play" strategy for user ${c.user_id}`)

    if (p.action === 'update') {
      await client.query(
        `UPDATE trades SET date = $1, ticker = $2, pnl = $3, direct_pnl = $3, notes = $4,
                           account_id = $5, updated_at = NOW() WHERE id = $6`,
        [p.date, c.ticker, p.pnl, notes, c.account_id, p.id])
    } else {
      await client.query(`
        INSERT INTO trades (
          date, ticker, direction, entry_price, position_size, fees, notes, account_id,
          status, entry_mode, instrument_type, strategy_tag, pnl, direct_pnl,
          wheel_cycle_id, strategy_id, user_id
        ) VALUES ($1,$2,'short',0,0,0,$3,$4,'closed','direct_pnl','option','wheel',$5,$5,$6,$7,$8)`,
        [p.date, c.ticker, notes, c.account_id, p.pnl, c.id, strategy.id, c.user_id])
    }
  }
  await client.query('COMMIT')
  console.log(`\napplied: ${clearing.length} legs cleared, ${plan.length} result row(s) written`)
} catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
await pool.end()
