/**
 * Common trade shape that all broker sync handlers produce before inserting.
 * Every field here maps directly to a column in the trades table.
 *
 * @typedef {Object} NormalizedTrade
 * @property {string} ticker
 * @property {'long'|'short'} direction
 * @property {number} entry_price
 * @property {number} position_size  - shares or contracts
 * @property {string} date           - 'YYYY-MM-DD'
 * @property {string} broker         - 'tradier' | 'schwab' | 'tradestation' | 'etrade' | 'tradovate'
 * @property {string} broker_trade_id - unique ID from the broker — used for dedup
 */

/**
 * Validates a normalized trade object. Returns true if it's safe to insert.
 * Logs the reason and returns false if something is missing/invalid.
 * @param {NormalizedTrade} t
 * @returns {boolean}
 */
export function isValidTrade(t) {
  if (!t.ticker)                           return false
  if (!['long', 'short'].includes(t.direction)) return false
  if (isNaN(t.entry_price) || t.entry_price <= 0) return false
  if (isNaN(t.position_size) || t.position_size <= 0) return false
  if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return false
  if (!t.broker_trade_id)                  return false
  return true
}

/**
 * Inserts a batch of normalized trades for a user using ON CONFLICT DO NOTHING.
 * Returns { imported, skipped } counts.
 * @param {object} pool - pg Pool
 * @param {string} userId
 * @param {NormalizedTrade[]} trades
 * @returns {Promise<{ imported: number, skipped: number }>}
 */
export async function insertNormalizedTrades(pool, userId, trades) {
  let imported = 0
  let skipped = 0

  for (const t of trades) {
    if (!isValidTrade(t)) { skipped++; continue }

    const result = await pool.query(
      `INSERT INTO trades
         (user_id, ticker, direction, entry_price, position_size, date, status, broker, broker_trade_id)
       VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8)
       ON CONFLICT (user_id, broker, broker_trade_id) DO NOTHING`,
      [userId, t.ticker, t.direction, t.entry_price, t.position_size, t.date, t.broker, t.broker_trade_id]
    )
    if (result.rowCount > 0) imported++
    else skipped++
  }

  return { imported, skipped }
}
