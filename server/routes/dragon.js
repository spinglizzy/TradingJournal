/* global process -- server-only file; the repo eslint config is browser-scoped */
import { Router } from 'express'
import pool from '../db.js'
import { TYPES, FEE_TYPES, SHARES_PER_CONTRACT, replay, reconcileMatch } from '../lib/dragonEngine.js'
import { parseSchwab, planImport, runImport } from '../lib/schwabImport.js'
import { finnhubQuote, refreshQuotes, applyQuotes } from '../lib/quotes.js'
import { parseRbaF11, RBA_F11_URL } from '../lib/fx.js'
import { restoreBackup } from '../lib/dragonBackup.js'

/**
 * Dragon — long-term dividend portfolio.
 *
 * Every write replays the holding's whole ledger with the change applied
 * (dragonEngine.replay) before committing, so an add, edit or delete can never
 * leave an oversell, an uncovered call or a dangling close behind.
 */
const router = Router()

const bad = (msg) => Object.assign(new Error(msg), { status: 400 })
const DATE = /^\d{4}-\d{2}-\d{2}$/
const r6 = (v) => Math.round(v * 1e6) / 1e6
const num = (v, name, { min = 0, strict = false } = {}) => {
  const n = Number(v)
  if (v === '' || v == null || !Number.isFinite(n) || (strict ? n <= min : n < min)) {
    throw bad(`${name} must be a number ${strict ? 'greater than' : 'of at least'} ${min}.`)
  }
  return n
}

const TX_COLS = `id, holding_id, date, type, shares, price, amount, fees, tax_withheld, notes, strike, expiry, contracts, premium, ref_id, import_hash`

async function withTx(res, next, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    res.json(out ?? { ok: true })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err.code === '23505' ? Object.assign(new Error('You already hold that ticker in Dragon.'), { status: 409 }) : err)
  } finally {
    client.release()
  }
}

/** Lock the holding (serialises writes to one ledger) and load its transactions. */
async function loadLedger(client, holdingId, userId) {
  const { rows: [holding] } = await client.query(
    `SELECT * FROM dragon_holdings WHERE id = $1 AND user_id = $2 FOR UPDATE`, [holdingId, userId])
  if (!holding) throw Object.assign(new Error('Holding not found'), { status: 404 })
  const { rows } = await client.query(
    `SELECT ${TX_COLS} FROM dragon_transactions WHERE holding_id = $1 AND user_id = $2`, [holdingId, userId])
  return { holding, ledger: rows }
}

/**
 * Validate one transaction off the wire and fill in its cash `amount`.
 * Fields that don't belong to the type are nulled so a stale form can't leak them in.
 */
function normalize(b, holding, ledger) {
  const type = b.type
  if (!TYPES.includes(type)) throw bad('Unknown transaction type')
  if (!DATE.test(b.date ?? '')) throw bad('Date is required (YYYY-MM-DD)')
  if (!holding.pays_dividend && (type === 'DIVIDEND' || type === 'DRIP')) throw bad(`${holding.ticker} is marked as not paying a dividend.`)

  const t = { type, date: b.date, notes: b.notes || null, shares: null, price: null, amount: 0,
    strike: null, expiry: null, contracts: null, premium: null, ref_id: null,
    fees: FEE_TYPES.includes(type) && b.fees !== '' && b.fees != null ? num(b.fees, 'Fees') : 0,
    tax_withheld: type === 'DIVIDEND' && b.tax_withheld !== '' && b.tax_withheld != null ? num(b.tax_withheld, 'US tax withheld') : null }
  const refCall = () => {
    const ref = ledger.find(x => x.id === Number(b.ref_id) && (x.type === 'CC_OPEN' || x.type === 'CC_ROLL'))
    if (!ref) throw bad('Pick the covered call this closes.')
    t.ref_id = ref.id
    return ref
  }
  const newCall = () => {
    t.strike    = num(b.strike, 'Strike', { strict: true })
    t.contracts = num(b.contracts, 'Contracts', { min: 1 })
    if (!DATE.test(b.expiry ?? '')) throw bad('Expiry is required')
    t.expiry = b.expiry
  }

  switch (type) {
    case 'BUY': case 'DRIP': case 'SELL':
      t.shares = r6(num(b.shares, 'Shares', { strict: true }))
      t.price  = num(b.price, 'Price', { strict: true })
      t.amount = t.shares * t.price
      if (type === 'SELL' && b.ref_id) refCall()   // called away at the strike
      break
    case 'DIVIDEND':
      t.amount = num(b.amount, 'Dividend amount', { strict: true })
      break
    case 'CC_OPEN':
      newCall()
      t.premium = num(b.premium, 'Premium')
      t.amount  = t.premium * SHARES_PER_CONTRACT * t.contracts
      break
    case 'CC_CLOSE': {
      const ref = refCall()
      t.premium = num(b.premium, 'Buy-back price')
      t.amount  = t.premium * SHARES_PER_CONTRACT * ref.contracts
      break
    }
    case 'CC_ROLL':
      refCall(); newCall()
      t.premium = num(b.premium, 'Net roll price', { min: -Infinity })  // signed: credit +, debit −
      t.amount  = t.premium * SHARES_PER_CONTRACT * t.contracts
      break
    case 'CC_EXPIRE':
      refCall()
      break
    case 'ROC':
      t.amount = num(b.amount, 'Return of capital', { strict: true })
      break
    case 'RECLASS': {
      const d = ledger.find(x => x.id === Number(b.ref_id) && x.type === 'DIVIDEND')
      if (!d) throw bad('Pick the dividend being reclassified.')
      t.ref_id = d.id
      t.amount = num(b.amount, 'Amount reclassified', { strict: true })
      break
    }
  }
  return t
}

// ── Reads ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const [h, t] = await Promise.all([
      pool.query(`SELECT * FROM dragon_holdings WHERE user_id = $1 ORDER BY ticker`, [req.userId]),
      pool.query(`SELECT ${TX_COLS} FROM dragon_transactions WHERE user_id = $1 ORDER BY date, id`, [req.userId]),
    ])
    res.json({ holdings: h.rows, transactions: t.rows })
  } catch (err) { next(err) }
})

// ── Holdings ─────────────────────────────────────────────────────────────────
router.post('/holdings', (req, res, next) => withTx(res, next, async (client) => {
  const ticker = String(req.body.ticker ?? '').trim().toUpperCase()
  if (!ticker) throw bad('Ticker is required')
  const price = req.body.current_price === '' || req.body.current_price == null ? null : num(req.body.current_price, 'Price')
  const { rows: [h] } = await client.query(
    `INSERT INTO dragon_holdings (user_id, ticker, name, pays_dividend, drip, current_price, price_updated_at, price_source)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::float8 IS NULL THEN NULL ELSE NOW() END, CASE WHEN $6::float8 IS NULL THEN NULL ELSE 'manual' END) RETURNING *`,
    [req.userId, ticker, req.body.name || null, req.body.pays_dividend !== false, req.body.drip !== false, price])
  return h
}))

router.put('/holdings/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { holding } = await loadLedger(client, req.params.id, req.userId)
  const b = req.body
  const price = 'current_price' in b
    ? (b.current_price === '' || b.current_price == null ? null : num(b.current_price, 'Price'))
    : holding.current_price
  // A typed price is "manual" and clears any fetch warning; clearing it clears the source too.
  const { rows: [h] } = await client.query(
    `UPDATE dragon_holdings SET name = $2, pays_dividend = $3, drip = $4, current_price = $5,
       price_updated_at = CASE WHEN $5::float8 IS DISTINCT FROM current_price THEN NOW() ELSE price_updated_at END,
       price_source = CASE WHEN NOT $6 THEN price_source WHEN $5::float8 IS NULL THEN NULL ELSE 'manual' END,
       price_error  = CASE WHEN $6 THEN NULL ELSE price_error END
     WHERE id = $1 RETURNING *`,
    [holding.id, b.name ?? holding.name, b.pays_dividend ?? holding.pays_dividend, b.drip ?? holding.drip, price, 'current_price' in b])
  return h
}))

router.delete('/holdings/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { holding } = await loadLedger(client, req.params.id, req.userId)
  await client.query(`DELETE FROM dragon_holdings WHERE id = $1`, [holding.id])
}))

// ── Transactions ─────────────────────────────────────────────────────────────
// ── Transactions ─────────────────────────────────────────────────────────────
const insertTx = (client, userId, holdingId, t, hash = null) => client.query(
  `INSERT INTO dragon_transactions (holding_id, user_id, date, type, shares, price, amount, fees, tax_withheld, notes, strike, expiry, contracts, premium, ref_id, import_hash)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${TX_COLS}`,
  [holdingId, userId, t.date, t.type, t.shares, t.price, t.amount, t.fees ?? 0, t.tax_withheld ?? null, t.notes, t.strike, t.expiry, t.contracts, t.premium, t.ref_id, hash])

router.post('/transactions', (req, res, next) => withTx(res, next, async (client) => {
  const { holding, ledger } = await loadLedger(client, req.body.holding_id, req.userId)
  const t = normalize(req.body, holding, ledger)
  replay([...ledger, t])
  const { rows: [row] } = await insertTx(client, req.userId, holding.id, t)
  return row
}))

/** Monthly DCA: several BUYs on one date. Buys only add shares, so they can't invalidate a ledger. */
router.post('/transactions/batch', (req, res, next) => withTx(res, next, async (client) => {
  const { date, buys } = req.body
  if (!Array.isArray(buys) || !buys.length) throw bad('Add at least one buy')
  const out = []
  for (const b of buys) {
    const { holding, ledger } = await loadLedger(client, b.holding_id, req.userId)
    const t = normalize({ ...b, type: 'BUY', date }, holding, ledger)
    out.push((await insertTx(client, req.userId, holding.id, t)).rows[0])
  }
  return out
}))

router.put('/transactions/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { rows: [cur] } = await client.query(
    `SELECT ${TX_COLS} FROM dragon_transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId])
  if (!cur) throw Object.assign(new Error('Transaction not found'), { status: 404 })
  if (!cur.holding_id) throw bad('Cash rows come from the Schwab import — delete and re-import to change one.')
  const { holding, ledger } = await loadLedger(client, cur.holding_id, req.userId)
  const id = Number(req.params.id)
  // Type is fixed on edit — changing it would orphan whatever references this row.
  const t = { ...normalize({ ...req.body, type: cur.type }, holding, ledger.filter(x => x.id !== id)), id }
  // An imported row's amount is the broker's exact cents; keep it unless what it's priced from changed.
  const same = (k) => (t[k] ?? null) === (cur[k] ?? null)
  if (!['DIVIDEND', 'ROC', 'RECLASS'].includes(cur.type) && ['shares', 'price', 'premium', 'contracts'].every(same)) t.amount = cur.amount
  const updated = ledger.map(x => x.id === id ? t : x)
  // A buy-back is priced off the call's contract count; keep its cash in step if that changed.
  const closes = updated.filter(x => x.type === 'CC_CLOSE' && x.ref_id === id && t.contracts && t.contracts !== cur.contracts)
  for (const c of closes) c.amount = Number(c.premium) * SHARES_PER_CONTRACT * t.contracts
  replay(updated)
  for (const c of closes) await client.query(`UPDATE dragon_transactions SET amount = $2 WHERE id = $1`, [c.id, c.amount])
  const { rows: [row] } = await client.query(
    `UPDATE dragon_transactions SET date=$2, shares=$3, price=$4, amount=$5, notes=$6, strike=$7, expiry=$8,
       contracts=$9, premium=$10, ref_id=$11, fees=$12, tax_withheld=$13 WHERE id = $1 RETURNING ${TX_COLS}`,
    [id, t.date, t.shares, t.price, t.amount, t.notes, t.strike, t.expiry, t.contracts, t.premium, t.ref_id, t.fees, t.tax_withheld])
  return row
}))

router.delete('/transactions/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { rows: [cur] } = await client.query(
    `SELECT holding_id FROM dragon_transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId])
  if (!cur) throw Object.assign(new Error('Transaction not found'), { status: 404 })
  const id = Number(req.params.id)
  if (cur.holding_id) {   // cash rows belong to no ledger — nothing to replay
    const { ledger } = await loadLedger(client, cur.holding_id, req.userId)
    if (ledger.some(x => x.ref_id === id)) throw bad('Another entry refers to this one (a close, roll, expiry or reclassification) — delete that one first.')
    replay(ledger.filter(x => x.id !== id))
  }
  await client.query(`DELETE FROM dragon_transactions WHERE id = $1`, [id])
}))

// ── Schwab CSV import ────────────────────────────────────────────────────────
/** The import's only I/O, backed by this transaction's client. */
export function pgStore(client, userId) {
  return {
    hashes: async () => new Set((await client.query(
      `SELECT import_hash FROM dragon_transactions WHERE user_id = $1 AND import_hash IS NOT NULL`, [userId])).rows.map(r => r.import_hash)),
    holdings: async () => new Map((await client.query(
      `SELECT * FROM dragon_holdings WHERE user_id = $1 FOR UPDATE`, [userId])).rows.map(h => [h.ticker, h])),
    createHolding: async ({ ticker, name, pays_dividend }) => (await client.query(
      `INSERT INTO dragon_holdings (user_id, ticker, name, pays_dividend, drip) VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [userId, ticker, name, pays_dividend])).rows[0],
    setPaysDividend: async (h) => (await client.query(
      `UPDATE dragon_holdings SET pays_dividend = true WHERE id = $1 RETURNING *`, [h.id])).rows[0],
    ledger: async (h) => (await client.query(
      `SELECT ${TX_COLS} FROM dragon_transactions WHERE holding_id = $1 AND user_id = $2`, [h.id, userId])).rows,
    insert: async (h, tx, hash) => (await insertTx(client, userId, h?.id ?? null, tx, hash)).rows[0],
    adopt: async (row, m, hash) => (await client.query(
      `UPDATE dragon_transactions SET shares=$2, price=$3, amount=$4, fees=$5, premium=$6, tax_withheld=$7, import_hash=$8
       WHERE id=$1 AND user_id=$9 RETURNING ${TX_COLS}`,
      [row.id, m.shares, m.price, m.amount, m.fees ?? 0, m.premium, m.tax_withheld, hash, userId])).rows[0],
  }
}

/**
 * Preview (commit: false) and commit run the SAME import inside a transaction;
 * the preview just rolls it back, so what you see is exactly what you'd get.
 */
router.post('/import', async (req, res, next) => {
  const { csv, mappings = {}, commit = false } = req.body
  const client = await pool.connect()
  try {
    if (typeof csv !== 'string' || !csv.trim()) throw bad('Choose a Schwab CSV file')
    const plan = planImport(parseSchwab(csv), mappings)
    await client.query('BEGIN')
    const report = await runImport(plan, pgStore(client, req.userId))
    await client.query(commit ? 'COMMIT' : 'ROLLBACK')
    res.json({ ...report, committed: !!commit })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
})

// ── Auto prices (Finnhub) ────────────────────────────────────────────────────
// The key never leaves the server: it's read here and used only in quotes.js's
// outbound request. Responses carry counts, never the key.
router.post('/prices/refresh', async (req, res, next) => {
  try {
    const key = process.env.FINNHUB_API_KEY
    if (!key) return res.json({ configured: false, updated: 0, failed: 0, skipped: 0 })
    const { rows } = await pool.query(
      `SELECT id, ticker, current_price, price_updated_at, price_source FROM dragon_holdings WHERE user_id = $1 ORDER BY ticker`, [req.userId])
    const result = await refreshQuotes(rows, finnhubQuote(key))
    for (const h of applyQuotes(rows, result)) {
      await pool.query(
        `UPDATE dragon_holdings SET current_price = $2, price_updated_at = $3, price_source = $4, price_error = $5 WHERE id = $1 AND user_id = $6`,
        [h.id, h.current_price, h.price_updated_at, h.price_source, h.price_error, req.userId])
    }
    res.json({ configured: true, updated: result.updates.length, failed: result.failures.length, skipped: result.skipped.length })
  } catch (err) { next(err) }
})

// ── Saved reconciliation checks ──────────────────────────────────────────────
router.get('/reconciliations', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.checked_at, r.source, count(x.id)::int AS total, count(x.id) FILTER (WHERE x.match)::int AS matched
       FROM dragon_reconciliations r LEFT JOIN dragon_reconciliation_rows x ON x.reconciliation_id = r.id
       WHERE r.user_id = $1 GROUP BY r.id ORDER BY r.checked_at DESC, r.id DESC LIMIT 50`, [req.userId])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/reconciliations/:id', async (req, res, next) => {
  try {
    const { rows: [r] } = await pool.query(`SELECT * FROM dragon_reconciliations WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId])
    if (!r) throw Object.assign(new Error('Check not found'), { status: 404 })
    const { rows } = await pool.query(
      `SELECT ticker, ledger_shares, schwab_shares, ledger_schwab_basis, schwab_basis, match
       FROM dragon_reconciliation_rows WHERE reconciliation_id = $1 AND user_id = $2 ORDER BY ticker`, [r.id, req.userId])
    res.json({ ...r, rows })
  } catch (err) { next(err) }
})

/** Ledger figures are recomputed here from the ledger — a stale or edited client can't save a false ✅. */
router.post('/reconciliations', (req, res, next) => withTx(res, next, async (client) => {
  const { source, rows } = req.body
  if (!['manual', 'positions_csv'].includes(source)) throw bad('source must be manual or positions_csv')
  if (!Array.isArray(rows)) throw bad('rows must be a list')
  const opt = (v, name) => (v === '' || v == null ? null : num(v, name, { min: -Infinity }))
  const { rows: holdings } = await client.query(`SELECT id, ticker FROM dragon_holdings WHERE user_id = $1`, [req.userId])
  const { rows: txs } = await client.query(`SELECT ${TX_COLS} FROM dragon_transactions WHERE user_id = $1`, [req.userId])
  const out = []
  for (const r of rows) {
    const h = holdings.find(x => x.ticker === r.ticker)
    if (!h) continue
    const sShares = opt(r.schwab_shares, `${r.ticker} Schwab shares`), sBasis = opt(r.schwab_basis, `${r.ticker} Schwab cost basis`)
    if (sShares == null && sBasis == null) continue
    const s = replay(txs.filter(t => t.holding_id === h.id))
    out.push([h.ticker, s.shares, sShares, s.schwabBasis, sBasis, reconcileMatch(s.shares, sShares, s.schwabBasis, sBasis)])
  }
  if (!out.length) throw bad('Enter Schwab’s figures for at least one holding before saving.')
  const { rows: [rec] } = await client.query(
    `INSERT INTO dragon_reconciliations (user_id, source) VALUES ($1, $2) RETURNING *`, [req.userId, source])
  for (const o of out) {
    await client.query(
      `INSERT INTO dragon_reconciliation_rows (reconciliation_id, user_id, ticker, ledger_shares, schwab_shares, ledger_schwab_basis, schwab_basis, match)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [rec.id, req.userId, ...o])
  }
  return { ...rec, total: out.length, matched: out.filter(o => o[5]).length }
}))

// ── RBA AUD/USD rates (cached in dragon_fx_rates) ────────────────────────────
let lastRbaFetch = 0   // per server instance; caps refetching the RBA file at once an hour
const RBA_REFETCH_MS = 60 * 60 * 1000

router.get('/fx', async (req, res, next) => {
  try {
    const from = DATE.test(req.query.from ?? '') ? req.query.from : '2023-01-01'
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const { rows: [{ max }] } = await pool.query(`SELECT max(date) AS max FROM dragon_fx_rates WHERE source = 'rba'`)
    let fetchError = null
    if ((!max || max < yesterday) && Date.now() - lastRbaFetch > RBA_REFETCH_MS) {
      lastRbaFetch = Date.now()
      try {
        const r = await fetch(RBA_F11_URL, { headers: { 'User-Agent': 'PulseJournal/1.0' } })
        if (!r.ok) throw new Error(`RBA returned HTTP ${r.status}`)
        const rates = parseRbaF11(await r.text())
        // A manual rate already entered for a date is kept (ON CONFLICT DO NOTHING).
        await pool.query(
          `INSERT INTO dragon_fx_rates (date, aud_usd, source)
           SELECT d, v, 'rba' FROM unnest($1::text[], $2::float8[]) AS t(d, v) ON CONFLICT (date) DO NOTHING`,
          [rates.map(x => x.date), rates.map(x => x.aud_usd)])
      } catch (e) {
        fetchError = `Couldn't fetch RBA rates (${e.message}). Cached rates are shown; enter any missing ones by hand.`
      }
    }
    // Two weeks before `from`, so a date just after a long weekend still finds its prior business day.
    const start = new Date(Date.parse(from) - 14 * 86400000).toISOString().slice(0, 10)
    const { rows } = await pool.query(`SELECT date, aud_usd, source FROM dragon_fx_rates WHERE date >= $1 ORDER BY date`, [start])
    res.json({ rates: rows, fetchError })
  } catch (err) { next(err) }
})

router.post('/fx', async (req, res, next) => {
  try {
    const { date } = req.body
    if (!DATE.test(date ?? '')) throw bad('Date is required (YYYY-MM-DD)')
    const rate = num(req.body.aud_usd, 'AUD/USD rate', { strict: true })
    if (rate > 5) throw bad('Enter the rate as US dollars per A$1 (e.g. 0.6550).')
    const { rows: [r] } = await pool.query(
      `INSERT INTO dragon_fx_rates (date, aud_usd, source, updated_at) VALUES ($1, $2, 'manual', NOW())
       ON CONFLICT (date) DO UPDATE SET aud_usd = EXCLUDED.aud_usd, source = 'manual', updated_at = NOW() RETURNING date, aud_usd, source`,
      [date, rate])
    res.json(r)
  } catch (err) { next(err) }
})

// ── Restore from backup ──────────────────────────────────────────────────────
export function restoreStore(client, uid) {
  return {
    isEmpty: async () => Number((await client.query(
      `SELECT (SELECT count(*) FROM dragon_holdings WHERE user_id = $1) + (SELECT count(*) FROM dragon_transactions WHERE user_id = $1) AS n`, [uid])).rows[0].n) === 0,
    wipe: async () => {
      await client.query(`DELETE FROM dragon_transactions WHERE user_id = $1`, [uid])
      await client.query(`DELETE FROM dragon_holdings WHERE user_id = $1`, [uid])
    },
    insertHolding: async (h) => (await client.query(
      `INSERT INTO dragon_holdings (user_id, ticker, name, pays_dividend, drip, current_price, price_updated_at, price_source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW())) RETURNING id`,
      [uid, h.ticker, h.name, h.pays_dividend !== false, h.drip !== false, h.current_price, h.price_updated_at, h.price_source, h.created_at])).rows[0],
    insertTx: async (hid, t) => (await insertTx(client, uid, hid, t, t.import_hash ?? null)).rows[0],
  }
}

router.post('/restore', (req, res, next) => withTx(res, next, async (client) =>
  restoreBackup(req.body.backup, restoreStore(client, req.userId), { wipe: req.body.wipe === true })))

export default router
