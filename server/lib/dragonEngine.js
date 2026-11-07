/**
 * Dragon (long-term dividend portfolio) — pure cost-basis engine.
 *
 * Average-cost method, one adjusted basis per holding, derived ONLY by replaying
 * the ledger. Nothing here is stored; every figure is recomputed on read.
 *
 *   total cost = BUY (+fees) + DRIP − DIVIDEND − net CC premium − cost removed by SELLs
 *   shares     = BUY + DRIP − SELL
 *   basis      = total cost ÷ shares   (may be ≤ 0: the position has paid for itself)
 *
 * `amount` is the GROSS cash figure (shares × price, quote × 100 × contracts, net
 * dividend). Positive for every type except CC_ROLL, where it is the signed net
 * (credit positive, debit negative). `fees` sit beside it and always work against
 * you: they add to a buy or a buy-back, and come off a sale or a premium.
 * Tax is never in the basis: DIVIDEND.amount is already net of withholding, and
 * `tax_withheld` is carried for reporting only.
 *
 * Imported by the client (instant numbers) and the server (which replays the
 * ledger before every write, so an edit/delete can never leave it invalid).
 */

export const SHARES_PER_CONTRACT = 100
export const TYPES = ['BUY', 'DIVIDEND', 'DRIP', 'SELL', 'CC_OPEN', 'CC_CLOSE', 'CC_ROLL', 'CC_EXPIRE']
export const CASH_TYPES = ['CASH_IN', 'CASH_OUT']   // account cash, no holding, never touch basis
export const FEE_TYPES = ['BUY', 'SELL', 'CC_OPEN', 'CC_CLOSE', 'CC_ROLL']

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
  let shares = 0, cost = 0, schwabCost = 0
  let cashInvested = 0, dividends = 0, ccNet = 0, realized = 0, fees = 0, taxWithheld = 0
  const open = new Map()  // id → the row that opened the call (CC_OPEN or CC_ROLL)
  const timeline = []
  const events = []       // dated money events, for the income chart and the tax-year report

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
  const ev = (t, e) => events.push({ date: t.date, dividend: 0, tax: 0, cc: 0, realized: 0, fees: 0, ...e })

  for (const t of sortLedger(transactions)) {
    const amt = Number(t.amount) || 0
    const fee = FEE_TYPES.includes(t.type) ? Number(t.fees) || 0 : 0
    fees += fee
    switch (t.type) {
      case 'BUY':
        shares = r6(shares + Number(t.shares)); cost += amt + fee; schwabCost += amt + fee; cashInvested += amt + fee
        if (fee) ev(t, { fees: fee })
        break
      case 'DRIP':
        shares = r6(shares + Number(t.shares)); cost += amt; schwabCost += amt; break
      case 'DIVIDEND': {
        const tax = Number(t.tax_withheld) || 0
        cost -= amt; dividends += amt; taxWithheld += tax
        ev(t, { dividend: amt, tax })
        break
      }
      case 'CC_OPEN': case 'CC_ROLL': {
        if (t.type === 'CC_ROLL') takeOpen(t)
        openCall(t)
        const net = amt - fee
        cost -= net; ccNet += net; ev(t, { cc: net, fees: fee })
        break
      }
      case 'CC_CLOSE': {
        takeOpen(t)
        const paid = amt + fee
        cost += paid; ccNet -= paid; ev(t, { cc: -paid, fees: fee })
        break
      }
      case 'CC_EXPIRE':
        takeOpen(t); break
      case 'SELL': {
        if (t.ref_id != null) takeOpen(t)   // called away: the call ends with the shares
        const n = Number(t.shares)
        if (n > shares + EPS) throw new LedgerError(`${label(t)}: selling ${n} shares but only ${shares} held.`)
        const removed = (cost / shares) * n
        const gain = amt - fee - removed
        realized += gain
        // Schwab basis is not adjusted, so it leaves at its own average.
        schwabCost -= (schwabCost / shares) * n
        shares = r6(shares - n)
        if (shares === 0) { cost = 0; schwabCost = 0 } else cost -= removed
        ev(t, { realized: gain, fees: fee })
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
    schwabBasis: schwabCost,                     // BUY + DRIP cost, nothing deducted — what the broker shows
    cashInvested, dividends, ccNet, realized, fees, taxWithheld,
    openCalls: [...open.values()],
    contracts,                                   // floor(shares ÷ 100)
    freeContracts: contracts - openContracts(),  // what CC_OPEN may still sell
    toNextContract: r6((contracts + 1) * SHARES_PER_CONTRACT - shares),
    timeline, events,
  }
}

/** Events → [{ month: 'YYYY-MM', dividend, cc, total }] in month order. */
export function incomeByMonth(events) {
  const m = new Map()
  for (const r of events) {
    if (!r.dividend && !r.cc) continue
    const k = r.date.slice(0, 7)
    const e = m.get(k) ?? { month: k, dividend: 0, cc: 0, total: 0 }
    e.dividend += r.dividend; e.cc += r.cc; e.total += r.dividend + r.cc
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

/** Australian financial year a date falls in, named by the year it ends: 2026-07-01 → 2027 ("FY2026-27"). */
export const auFY = (date) => Number(date.slice(0, 4)) + (date.slice(5, 7) >= '07' ? 1 : 0)
export const fyLabel = (fy) => `FY${fy - 1}-${String(fy).slice(2)}`

/** Sum events falling in Australian FY `fy`. Gross dividend = net + US tax withheld. */
export function taxYear(events, fy) {
  const s = { grossDividends: 0, taxWithheld: 0, netDividends: 0, ccNet: 0, realized: 0, fees: 0 }
  for (const e of events) {
    if (auFY(e.date) !== fy) continue
    s.netDividends += e.dividend; s.taxWithheld += e.tax; s.grossDividends += e.dividend + e.tax
    s.ccNet += e.cc; s.realized += e.realized; s.fees += e.fees
  }
  return s
}

/** CASH_IN / CASH_OUT rows → totals. Amounts are stored positive; the type gives the direction. */
export function cashTotals(transactions) {
  let cashIn = 0, cashOut = 0
  for (const t of transactions) {
    if (t.type === 'CASH_IN') cashIn += Number(t.amount)
    if (t.type === 'CASH_OUT') cashOut += Number(t.amount)
  }
  return { cashIn, cashOut, net: cashIn - cashOut }
}

/** Whole calendar days from `from` (YYYY-MM-DD) to `expiry`. */
export const daysTo = (expiry, from = new Date().toISOString().slice(0, 10)) =>
  Math.round((Date.parse(expiry) - Date.parse(from)) / 86400000)
