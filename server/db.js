import 'dotenv/config'
import pg from 'pg'
const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
})

// Schema is managed by supabase_migration.sql — run that in the Supabase SQL editor.
// This function just verifies the DB connection on startup.
export async function initDb() {
  await pool.query('SELECT 1')
  console.log('Database connection ready')
}

export function calcPnl(direction, entryPrice, exitPrice, positionSize, fees, stopLoss) {
  if (exitPrice == null) return { pnl: null, pnl_percent: null, r_multiple: null }
  const mult = direction === 'long' ? 1 : -1
  const pnl = mult * (exitPrice - entryPrice) * positionSize - fees
  const pnl_percent = (pnl / (entryPrice * positionSize)) * 100
  let r_multiple = null
  if (stopLoss != null) {
    const riskPerUnit = Math.abs(entryPrice - stopLoss)
    const riskTotal = riskPerUnit * positionSize
    if (riskTotal > 0) r_multiple = pnl / riskTotal
  }
  return { pnl, pnl_percent, r_multiple }
}

export default pool
