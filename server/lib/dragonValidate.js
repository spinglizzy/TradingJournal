/**
 * Validation for Dragon rows off the wire: the transaction routes and restore
 * both go through normalize(), so a backup can't smuggle in what the form can't.
 */
import { TYPES, FEE_TYPES, SHARES_PER_CONTRACT } from './dragonEngine.js'

export const bad = (msg) => Object.assign(new Error(msg), { status: 400 })
export const r6 = (v) => Math.round(v * 1e6) / 1e6

/** A real calendar date in YYYY-MM-DD (rejects 2026-02-30, 2026-13-45). */
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) && new Date(Date.parse(s)).toISOString().slice(0, 10) === s

// Plain decimals only: no "0x10", no [5], no true. Anything this big is a typo, and
// keeping |n| ≤ 1e12 keeps shares × price far from Infinity.
const DECIMAL = /^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i
export const MAX_NUM = 1e12
export const num = (v, name, { min = 0, strict = false } = {}) => {
  const n = typeof v === 'number' || (typeof v === 'string' && DECIMAL.test(v)) ? Number(v) : NaN
  if (!Number.isFinite(n) || (strict ? n <= min : n < min)) {
    throw bad(`${name} must be a number ${strict ? 'greater than' : 'of at least'} ${min}.`)
  }
  if (Math.abs(n) > MAX_NUM) throw bad(`${name} is too large.`)
  return n
}
/** Shares are stored to 6 dp — check what's stored, not what was typed (1e-7 would round to 0). */
export const sharesNum = (v, name = 'Shares') => {
  const n = r6(num(v, name, { strict: true }))
  if (!(n > 0)) throw bad(`${name} must be at least 0.000001.`)
  return n
}

export const MAX_TICKER = 15, MAX_NAME = 200, MAX_NOTES = 2000
export const text = (v, name, max) => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw bad(`${name} must be text.`)
  if (v.length > max) throw bad(`${name} is too long (max ${max} characters).`)
  return v
}
export const bool = (v, name, fallback) => {
  if (v === undefined) return fallback
  if (typeof v !== 'boolean') throw bad(`${name} must be true or false.`)
  return v
}

/** Types whose ref_id means something; on any other type a ref_id is refused. */
export const REF_TYPES = ['SELL', 'CC_CLOSE', 'CC_ROLL', 'CC_EXPIRE', 'RECLASS']

/**
 * Validate one transaction and fill in its cash `amount`.
 * Fields that don't belong to the type are nulled so a stale form can't leak them in.
 */
export function normalize(b, holding, ledger) {
  if (!b || typeof b !== 'object') throw bad('Each entry must be an object')
  const type = b.type
  if (!TYPES.includes(type)) throw bad('Unknown transaction type')
  if (!isDate(b.date)) throw bad('Date is required (YYYY-MM-DD)')
  if (!holding.pays_dividend && (type === 'DIVIDEND' || type === 'DRIP')) throw bad(`${holding.ticker} is marked as not paying a dividend.`)

  const t = { type, date: b.date, notes: text(b.notes, 'Notes', MAX_NOTES), shares: null, price: null, amount: 0,
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
    if (!isDate(b.expiry)) throw bad('Expiry is required')
    t.expiry = b.expiry
  }

  switch (type) {
    case 'BUY': case 'DRIP': case 'SELL':
      t.shares = sharesNum(b.shares)
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
