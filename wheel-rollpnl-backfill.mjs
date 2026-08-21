import 'dotenv/config'
import pg from 'pg'
import { legPnl } from './server/lib/wheelEngine.js'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const { rows: legs } = await pool.query(
  `SELECT id, ticker, wheel_cycle_id, rolled_from_id, leg_status, status, premium, close_cost, fees, pnl
   FROM trades WHERE strategy_tag = 'wheel' ORDER BY wheel_cycle_id, id`
)

const byCycle = new Map()
for (const l of legs) {
  const k = l.wheel_cycle_id ?? `orphan-${l.id}`
  if (!byCycle.has(k)) byCycle.set(k, [])
  byCycle.get(k).push(l)
}

const changes = []
for (const [, group] of byCycle) {
  const derived = legPnl(group)
  for (const l of group) {
    const next = derived.get(l.id) ?? null
    const curr = l.pnl == null ? null : Number(l.pnl)
    if (next !== curr) changes.push({ id: l.id, ticker: l.ticker, cycle: l.wheel_cycle_id, leg_status: l.leg_status, from: curr, to: next })
  }
}

console.table(changes)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const before = sum(legs.map(l => (l.pnl == null ? 0 : Number(l.pnl))))
const after  = before + sum(changes.map(c => (c.to ?? 0) - (c.from ?? 0)))
console.log(`booked wheel P&L  before ${before.toFixed(2)}   after ${after.toFixed(2)}   delta ${(after - before).toFixed(2)}`)

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write'); await pool.end(); process.exit(0) }

const client = await pool.connect()
try {
  await client.query('BEGIN')
  for (const c of changes) await client.query('UPDATE trades SET pnl = $1, updated_at = NOW() WHERE id = $2', [c.to, c.id])
  await client.query('COMMIT')
  console.log(`\napplied ${changes.length} row(s)`)
} catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
await pool.end()
