/**
 * Dragon ledger backup: export (client builds it from GET /api/dragon) and
 * restore (server, through a store, inside one transaction).
 *
 * The JSON keeps the original ids only to rebuild links: holdings get new ids,
 * and every ref_id is remapped onto the restored row it pointed at. Rows are
 * restored in original id order, so a referenced row always exists first.
 */
import { replay, TYPES, CASH_TYPES } from './dragonEngine.js'
import { normalize, num, isDate, text, bad, REF_TYPES, MAX_TICKER, MAX_NAME, MAX_NOTES } from './dragonValidate.js'

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

export function validateBackup(b) {
  if (!b || b.app !== BACKUP_APP) throw bad('Not a Dragon backup file.')
  if (b.version !== BACKUP_VERSION) throw bad(`Backup version ${b.version} isn't supported (expected ${BACKUP_VERSION}).`)
  if (!Array.isArray(b.holdings) || !Array.isArray(b.transactions)) throw bad('Backup is missing holdings or transactions.')
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o)
  const ids = new Set(), txIds = new Set(), hashes = new Set()
  for (const h of b.holdings) {
    if (!isObj(h) || ids.has(h.id)) throw bad('Backup has a malformed or repeated holding.')
    ids.add(h.id)
    if (!(text(h.ticker, 'Ticker', MAX_TICKER) ?? '').trim()) throw bad('Backup has a holding with no ticker.')
    text(h.name, `${h.ticker} name`, MAX_NAME)
    for (const k of ['pays_dividend', 'drip']) if (h[k] != null && typeof h[k] !== 'boolean') throw bad(`${h.ticker} ${k} must be true or false.`)
    if (h.current_price != null) num(h.current_price, `${h.ticker} price`)
    if (![null, undefined, 'auto', 'manual'].includes(h.price_source)) throw bad(`${h.ticker} has an unknown price source.`)
  }
  for (const t of b.transactions) if (!isObj(t) || !Number.isInteger(t.id)) throw bad('Backup has a malformed transaction id.')
  for (const t of [...b.transactions].sort((x, y) => x.id - y.id)) {
    if (txIds.has(t.id)) throw bad(`Backup repeats transaction id ${t.id}.`)
    if (t.ref_id != null && !txIds.has(t.ref_id)) throw bad(`Transaction ${t.id} refers to ${t.ref_id}, which isn't earlier in the backup.`)
    txIds.add(t.id)
    if (![...TYPES, ...CASH_TYPES].includes(t.type)) throw bad(`Backup has an unknown transaction type: ${t.type}`)
    if (CASH_TYPES.includes(t.type) ? t.holding_id != null : !ids.has(t.holding_id)) throw bad(`Transaction ${t.id} points at a holding that isn't in the backup.`)
    if (t.ref_id != null && !REF_TYPES.includes(t.type)) throw bad(`Transaction ${t.id} (${t.type}) can't refer to another entry.`)
    if (t.import_hash != null) {
      if (typeof t.import_hash !== 'string' || hashes.has(t.import_hash)) throw bad(`Transaction ${t.id} has a malformed or repeated import hash.`)
      hashes.add(t.import_hash)
    }
  }
}

/** One backup row through the same checks as the form; the backup's exact cash figure is kept once it's valid. */
function cleanTx(t, ticker, ledger, refId) {
  const at = (fn) => { try { return fn() } catch (e) { throw bad(`Transaction ${t.id}: ${e.message}`) } }
  if (CASH_TYPES.includes(t.type)) {
    return at(() => {
      if (!isDate(t.date)) throw bad('Date is required (YYYY-MM-DD)')
      return { type: t.type, date: t.date, amount: num(t.amount, 'Amount', { strict: true }), notes: text(t.notes, 'Notes', MAX_NOTES),
        shares: null, price: null, fees: 0, tax_withheld: null, strike: null, expiry: null, contracts: null, premium: null, ref_id: null, import_hash: t.import_hash ?? null }
    })
  }
  return at(() => {
    const v = normalize({ ...t, ref_id: refId }, { pays_dividend: true, ticker }, ledger)
    const amount = num(t.amount, 'Amount', { min: t.type === 'CC_ROLL' ? -Infinity : 0 })
    if (refId != null && v.ref_id == null) throw bad(`a ${t.type} can't refer to another entry here.`)
    return { ...v, amount, import_hash: t.import_hash ?? null }
  })
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
  const holdingId = new Map(), txId = new Map(), ledgers = new Map(), ticker = new Map()
  for (const h of backup.holdings) {
    holdingId.set(h.id, (await store.insertHolding({ ...h, ticker: h.ticker.trim().toUpperCase() })).id)
    ticker.set(h.id, h.ticker)
  }
  for (const t of [...backup.transactions].sort((a, b) => a.id - b.id)) {
    if (t.ref_id != null && !txId.has(t.ref_id)) throw bad(`Transaction ${t.id} refers to ${t.ref_id}, which isn't earlier in the backup.`)
    const hid = t.holding_id == null ? null : holdingId.get(t.holding_id)
    const refId = t.ref_id == null ? null : txId.get(t.ref_id)
    const row = await store.insertTx(hid, cleanTx(t, ticker.get(t.holding_id), hid == null ? [] : ledgers.get(hid) ?? [], refId))
    txId.set(t.id, row.id)
    if (hid != null) (ledgers.get(hid) ?? ledgers.set(hid, []).get(hid)).push(row)
  }
  for (const rows of ledgers.values()) replay(rows)   // same validation as every other write
  return { holdings: holdingId.size, transactions: txId.size }
}
