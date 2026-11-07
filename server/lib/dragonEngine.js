/**
 * Dragon (long-term dividend portfolio) — pure cost-basis engine.
 *
 * Average-cost method, one adjusted basis per holding, derived ONLY by replaying
 * the ledger. Nothing here is stored; every figure is recomputed on read.
 *
 *   total cost = BUY + DRIP − DIVIDEND − net CC premium − cost removed by SELLs
 *   shares     = BUY + DRIP − SELL
 *   basis      = total cost ÷ shares   (may be ≤ 0: the position has paid for itself)
 *
 * `amount` is the cash figure on every row. It is positive for everything except
 * CC_ROLL, where it is the signed net (credit positive, debit negative).
 *
 * Imported by the client (instant numbers) and the server (which replays the
 * ledger before every write, so an edit/delete can never leave it invalid).
 */

export const SHARES_PER_CONTRACT = 100
export const TYPES = ['BUY', 'DIVIDEND', 'DRIP', 'SELL', 'CC_OPEN', 'CC_CLOSE', 'CC_ROLL', 'CC_EXPIRE']

const r6 = (v) => Math.round(v * 1e6) / 1e6
const EPS = 1e-9

export class LedgerError extends Error {
  constructor(message) { super(message); this.status = 400 }
}

/** Date order, then entry order. An unsaved row (no id) sorts last within its day. */
export const sortLedger = (txs) => [...txs].sort((a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id ?? Infinity) - (b.id ?? Infinity))

const label = (t) => `${t.type} on ${t.date}`

/**
 * Replay one holding's ledger. Throws LedgerError on the first row that would
 * make it impossible (oversell, uncovered calls, closing a call that isn't open).
 */
export function replay(transactions) {
  let shares = 0, cost = 0
  let cashInvested = 0, dividends = 0, ccNet = 0, realized = 0
  const open = new Map()  // id → the row that opened the call (CC_OPEN or CC_ROLL)
  const timeline = []
  const income = []       // { date, dividend, cc } per income-bearing row

  const takeOpen = (t) => {
    const call = open.get(t.ref_id)
    if (!call) throw new LedgerError(`${label(t)}: that covered call isn't open at this date.`)
    open.delete(t.ref_id)
    return call
  }
  const openContracts = () => [...open.values()].reduce((s, c) => s + c.contracts, 0)
  const openCall = (t) => {
    if (!(t.contracts >= 1) || !Number.isInteger(t.contracts)) throw new LedgerError(`${label(t)}: contracts must be a whole number ≥ 1.`)
    if (!t.expiry || t.expiry <= t.date) throw new LedgerError(`${label(t)}: expiry must be after the date the call was sold.`)
    const allowed = Math.floor((shares + EPS) / SHARES_PER_CONTRACT)
    if (openContracts() + t.contracts > allowed) {
      throw new LedgerError(`${label(t)}: ${t.contracts} contract(s) needs ${t.contracts * SHARES_PER_CONTRACT} free shares — you hold ${shares} with ${openContracts()} call(s) already open.`)
    }
    open.set(t.id, t)
  }

  for (const t of sortLedger(transactions)) {
    const amt = Number(t.amount) || 0
    switch (t.type) {
      case 'BUY':
        shares = r6(shares + Number(t.shares)); cost += amt; cashInvested += amt; break
      case 'DRIP':
        shares = r6(shares + Number(t.shares)); cost += amt; break
      case 'DIVIDEND':
        cost -= amt; dividends += amt; income.push({ date: t.date, dividend: amt, cc: 0 }); break
      case 'CC_OPEN':
        openCall(t); cost -= amt; ccNet += amt; income.push({ date: t.date, dividend: 0, cc: amt }); break
      case 'CC_CLOSE':
        takeOpen(t); cost += amt; ccNet -= amt; income.push({ date: t.date, dividend: 0, cc: -amt }); break
      case 'CC_ROLL':
        takeOpen(t); openCall(t); cost -= amt; ccNet += amt; income.push({ date: t.date, dividend: 0, cc: amt }); break
      case 'CC_EXPIRE':
        takeOpen(t); break
      case 'SELL': {
        if (t.ref_id != null) takeOpen(t)   // called away: the call ends with the shares
        const n = Number(t.shares)
        if (n > shares + EPS) throw new LedgerError(`${label(t)}: selling ${n} shares but only ${shares} held.`)
        const basis = cost / shares
        const removed = basis * n
        realized += amt - removed
        shares = r6(shares - n)
        cost = shares === 0 ? 0 : cost - removed
        if (openContracts() * SHARES_PER_CONTRACT > shares + EPS) {
          throw new LedgerError(`${label(t)}: would leave ${openContracts()} open call(s) uncovered — close or mark the call called away first.`)
        }
        break
      }
      default:
        throw new LedgerError(`Unknown transaction type ${t.type}`)
    }
    timeline.push({ id: t.id, date: t.date, type: t.type, shares, totalCost: cost, basis: shares > 0 ? cost / shares : null })
  }

  const contracts = Math.floor((shares + EPS) / SHARES_PER_CONTRACT)
  return {
    shares,
    totalCost: cost,
    basis: shares > 0 ? cost / shares : null,
    cashInvested, dividends, ccNet, realized,
    openCalls: [...open.values()],
    contracts,                                   // floor(shares ÷ 100)
    freeContracts: contracts - openContracts(),  // what CC_OPEN may still sell
    toNextContract: r6((contracts + 1) * SHARES_PER_CONTRACT - shares),
    timeline, income,
  }
}

/** Income rows → [{ month: 'YYYY-MM', dividend, cc, total }] in month order. */
export function incomeByMonth(incomeRows) {
  const m = new Map()
  for (const r of incomeRows) {
    const k = r.date.slice(0, 7)
    const e = m.get(k) ?? { month: k, dividend: 0, cc: 0, total: 0 }
    e.dividend += r.dividend; e.cc += r.cc; e.total += r.dividend + r.cc
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

/** Whole calendar days from `from` (YYYY-MM-DD) to `expiry`. */
export const daysTo = (expiry, from = new Date().toISOString().slice(0, 10)) =>
  Math.round((Date.parse(expiry) - Date.parse(from)) / 86400000)
