/* global process */
/**
 * One-off: move a user's imported Dragon rows from the v1 (raw-text) import hash
 * to the v2 (parsed-number) hash. Reversible: the old hash is kept in
 * import_hash_v1 and --revert puts it back. Needs dragon_migration_05.sql.
 *
 *   node scripts/dragon-rehash.mjs <email> <schwab.csv> [--dry]
 *   node scripts/dragon-rehash.mjs <email> --revert [--dry]
 *
 * Only rows whose stored hash matches a line of the given CSV are touched; rows
 * from other files keep their v1 hash and still count as duplicates (the import
 * checks both). One transaction; --dry rolls it back.
 */
import 'dotenv/config'
import fs from 'node:fs'
import pool from '../server/db.js'
import { parseSchwab } from '../server/lib/schwabImport.js'

const [email, file] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const revert = process.argv.includes('--revert'), dry = process.argv.includes('--dry')
if (!email || (!revert && !file)) { console.error('usage: dragon-rehash.mjs <email> <schwab.csv> | --revert  [--dry]'); process.exit(1) }

const c = await pool.connect()
try {
  const { rows: [u] } = await c.query(`SELECT id FROM auth.users WHERE email = $1`, [email])
  if (!u) throw new Error('No such user')
  await c.query('BEGIN')
  if (revert) {
    const r = await c.query(`UPDATE dragon_transactions SET import_hash = import_hash_v1, import_hash_v1 = NULL
                             WHERE user_id = $1 AND import_hash_v1 IS NOT NULL`, [u.id])
    console.log(`reverted ${r.rowCount} row(s) to their v1 hash`)
  } else {
    const lines = parseSchwab(fs.readFileSync(file, 'utf8'))
    let moved = 0
    for (const l of lines) {
      const r = await c.query(`UPDATE dragon_transactions SET import_hash_v1 = import_hash, import_hash = $3
                               WHERE user_id = $1 AND import_hash = $2 AND import_hash_v1 IS NULL`, [u.id, l.hashV1, l.hash])
      moved += r.rowCount
    }
    const { rows: [left] } = await c.query(
      `SELECT count(*)::int n FROM dragon_transactions WHERE user_id = $1 AND import_hash IS NOT NULL AND import_hash_v1 IS NULL`, [u.id])
    console.log(`${lines.length} CSV line(s); moved ${moved} row(s) to v2; ${left.n} imported row(s) still on v1 (from other files)`)
  }
  await c.query(dry ? 'ROLLBACK' : 'COMMIT')
  console.log(dry ? 'dry run — rolled back' : 'committed')
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error(e.message); process.exitCode = 1
} finally { c.release(); await pool.end() }
