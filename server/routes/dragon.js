import { Router } from 'express'
import pool from '../db.js'
import { TYPES, SHARES_PER_CONTRACT, replay } from '../lib/dragonEngine.js'

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

const TX_COLS = `id, holding_id, date, type, shares, price, amount, notes, strike, expiry, contracts, premium, ref_id`

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
    strike: null, expiry: null, contracts: null, premium: null, ref_id: null }
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
    `INSERT INTO dragon_holdings (user_id, ticker, name, pays_dividend, drip, current_price, price_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::float8 IS NULL THEN NULL ELSE NOW() END) RETURNING *`,
    [req.userId, ticker, req.body.name || null, req.body.pays_dividend !== false, req.body.drip !== false, price])
  return h
}))

router.put('/holdings/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { holding } = await loadLedger(client, req.params.id, req.userId)
  const b = req.body
  const price = 'current_price' in b
    ? (b.current_price === '' || b.current_price == null ? null : num(b.current_price, 'Price'))
    : holding.current_price
  const { rows: [h] } = await client.query(
    `UPDATE dragon_holdings SET name = $2, pays_dividend = $3, drip = $4, current_price = $5,
       price_updated_at = CASE WHEN $5::float8 IS DISTINCT FROM current_price THEN NOW() ELSE price_updated_at END
     WHERE id = $1 RETURNING *`,
    [holding.id, b.name ?? holding.name, b.pays_dividend ?? holding.pays_dividend, b.drip ?? holding.drip, price])
  return h
}))

router.delete('/holdings/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { holding } = await loadLedger(client, req.params.id, req.userId)
  await client.query(`DELETE FROM dragon_holdings WHERE id = $1`, [holding.id])
}))

// ── Transactions ─────────────────────────────────────────────────────────────
const insertTx = (client, userId, holdingId, t) => client.query(
  `INSERT INTO dragon_transactions (holding_id, user_id, date, type, shares, price, amount, notes, strike, expiry, contracts, premium, ref_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${TX_COLS}`,
  [holdingId, userId, t.date, t.type, t.shares, t.price, t.amount, t.notes, t.strike, t.expiry, t.contracts, t.premium, t.ref_id])

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
    `SELECT holding_id, type FROM dragon_transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId])
  if (!cur) throw Object.assign(new Error('Transaction not found'), { status: 404 })
  const { holding, ledger } = await loadLedger(client, cur.holding_id, req.userId)
  const id = Number(req.params.id)
  // Type is fixed on edit — changing it would orphan whatever references this row.
  const t = { ...normalize({ ...req.body, type: cur.type }, holding, ledger.filter(x => x.id !== id)), id }
  const updated = ledger.map(x => x.id === id ? t : x)
  // A buy-back is priced off the call's contract count; keep its cash in step if that changed.
  const closes = updated.filter(x => x.type === 'CC_CLOSE' && x.ref_id === id && t.contracts)
  for (const c of closes) c.amount = Number(c.premium) * SHARES_PER_CONTRACT * t.contracts
  replay(updated)
  for (const c of closes) await client.query(`UPDATE dragon_transactions SET amount = $2 WHERE id = $1`, [c.id, c.amount])
  const { rows: [row] } = await client.query(
    `UPDATE dragon_transactions SET date=$2, shares=$3, price=$4, amount=$5, notes=$6, strike=$7, expiry=$8,
       contracts=$9, premium=$10, ref_id=$11 WHERE id = $1 RETURNING ${TX_COLS}`,
    [id, t.date, t.shares, t.price, t.amount, t.notes, t.strike, t.expiry, t.contracts, t.premium, t.ref_id])
  return row
}))

router.delete('/transactions/:id', (req, res, next) => withTx(res, next, async (client) => {
  const { rows: [cur] } = await client.query(
    `SELECT holding_id FROM dragon_transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId])
  if (!cur) throw Object.assign(new Error('Transaction not found'), { status: 404 })
  const { ledger } = await loadLedger(client, cur.holding_id, req.userId)
  const id = Number(req.params.id)
  if (ledger.some(x => x.ref_id === id)) throw bad('Another entry closes this call — delete that one first.')
  replay(ledger.filter(x => x.id !== id))
  await client.query(`DELETE FROM dragon_transactions WHERE id = $1`, [id])
}))

export default router
