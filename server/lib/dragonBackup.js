/**
 * Dragon ledger backup: export (client builds it from GET /api/dragon) and
 * restore (server, through a store, inside one transaction).
 *
 * The JSON keeps the original ids only to rebuild links: holdings get new ids,
 * and every ref_id is remapped onto the restored row it pointed at. Rows are
 * restored in original id order, so a referenced row always exists first.
 */
import { replay, TYPES, CASH_TYPES } from './dragonEngine.js'

export const BACKUP_APP = 'pulse-journal-dragon'
export const BACKUP_VERSION = 1

const HOLDING_FIELDS = ['id', 'ticker', 'name', 'pays_dividend', 'drip', 'current_price', 'price_updated_at', 'price_source', 'created_at']
const TX_FIELDS = ['id', 'holding_id', 'date', 'type', 'shares', 'price', 'amount', 'fees', 'tax_withheld', 'notes',
  'strike', 'expiry', 'contracts', 'premium', 'ref_id', 'import_hash']
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] ?? null]))

export function buildBackup(holdings, transactions, exportedAt = new Date().toISOString()) {
  return {
    app: BACKUP_APP, version: BACKUP_VERSION, exported_at: exportedAt,
    holdings: holdings.map(h => pick(h, HOLDING_FIELDS)),
    transactions: [...transactions].sort((a, b) => a.id - b.id).map(t => pick(t, TX_FIELDS)),
  }
}

/** One readable CSV: holding rows, then every transaction with its ticker. */
export function backupToCsv(b) {
  const tickers = new Map(b.holdings.map(h => [h.id, h.ticker]))
  const q = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`)
  const head = ['record', 'ticker', ...TX_FIELDS, 'name', 'pays_dividend', 'drip', 'current_price']
  const rows = [
    ...b.holdings.map(h => ['HOLDING', h.ticker, h.id, ...TX_FIELDS.slice(1).map(() => null), h.name, h.pays_dividend, h.drip, h.current_price]),
    ...b.transactions.map(t => ['TRANSACTION', tickers.get(t.holding_id) ?? '', ...TX_FIELDS.map(k => t[k]), null, null, null, null]),
  ]
  return [head, ...rows].map(r => r.map(q).join(',')).join('\r\n')
}

const bad = (msg) => Object.assign(new Error(msg), { status: 400 })

export function validateBackup(b) {
  if (!b || b.app !== BACKUP_APP) throw bad('Not a Dragon backup file.')
  if (b.version !== BACKUP_VERSION) throw bad(`Backup version ${b.version} isn't supported (expected ${BACKUP_VERSION}).`)
  if (!Array.isArray(b.holdings) || !Array.isArray(b.transactions)) throw bad('Backup is missing holdings or transactions.')
  const ids = new Set(b.holdings.map(h => h.id))
  for (const t of b.transactions) {
    if (![...TYPES, ...CASH_TYPES].includes(t.type)) throw bad(`Backup has an unknown transaction type: ${t.type}`)
    if (CASH_TYPES.includes(t.type) ? t.holding_id != null : !ids.has(t.holding_id)) throw bad(`Transaction ${t.id} points at a holding that isn't in the backup.`)
  }
}

/**
 * store: isEmpty() → bool, wipe(), insertHolding(h) → row, insertTx(holdingId|null, tx) → row
 * Throws (and the route rolls back) on a non-empty ledger without `wipe`, a broken
 * link, or a ledger that no longer replays.
 */
export async function restoreBackup(backup, store, { wipe = false } = {}) {
  validateBackup(backup)
  if (!(await store.isEmpty())) {
    if (!wipe) throw Object.assign(new Error('Your Dragon ledger isn’t empty. Confirm a wipe to replace it with this backup.'), { status: 409 })
    await store.wipe()
  }
  const holdingId = new Map(), txId = new Map(), ledgers = new Map()
  for (const h of backup.holdings) holdingId.set(h.id, (await store.insertHolding(h)).id)
  for (const t of [...backup.transactions].sort((a, b) => a.id - b.id)) {
    if (t.ref_id != null && !txId.has(t.ref_id)) throw bad(`Transaction ${t.id} refers to ${t.ref_id}, which isn't earlier in the backup.`)
    const hid = t.holding_id == null ? null : holdingId.get(t.holding_id)
    const row = await store.insertTx(hid, { ...t, ref_id: t.ref_id == null ? null : txId.get(t.ref_id) })
    txId.set(t.id, row.id)
    if (hid != null) (ledgers.get(hid) ?? ledgers.set(hid, []).get(hid)).push(row)
  }
  for (const rows of ledgers.values()) replay(rows)   // same validation as every other write
  return { holdings: holdingId.size, transactions: txId.size }
}
