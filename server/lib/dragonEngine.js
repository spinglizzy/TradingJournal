/**
 * Dragon (long-term dividend portfolio) — pure cost-basis engine.
 *
 * Average-cost method, one adjusted basis per holding, derived ONLY by replaying
 * the ledger. Nothing here is stored; every figure is recomputed on read.
 *
 *   total cost = BUY (+fees) + DRIP − DIVIDEND − ROC − net CC premium − cost removed by SELLs
 *   shares     = BUY + DRIP − SELL
 *   basis      = total cost ÷ shares   (may be ≤ 0: the position has paid for itself)
 *
 * Schwab basis is tracked separately as FIFO tax lots: every BUY and DRIP is a
 * lot, a SELL consumes lots oldest first (partial lots pro rata), and return of
 * capital lowers every lot in proportion to its shares, never below $0: the
 * excess is a capital gain (`rocGain`). Dividends and premium never touch the
 * lots — that's the broker's view, not the adjusted one.
 *
 * A dividend received with no shares held (ex-date before a full exit, paid
 * after it) is income for the tax report but doesn't touch any basis.
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
export const TYPES = ['BUY', 'DIVIDEND', 'DRIP', 'SELL', 'CC_OPEN', 'CC_CLOSE', 'CC_ROLL', 'CC_EXPIRE', 'ROC', 'RECLASS']
export const CASH_TYPES = ['CASH_IN', 'CASH_OUT']   // account cash, no holding, never touch basis
export const FEE_TYPES = ['BUY', 'SELL', 'CC_OPEN', 'CC_CLOSE', 'CC_ROLL']

/** Reconcile tolerances: a holding matches Schwab when both are within these. */
export const SHARE_TOL = 0.0001
export const BASIS_TOL = 0.01
export const reconcileMatch = (ledgerShares, schwabShares, ledgerBasis, schwabBasis) =>
  (schwabShares == null || Math.abs(schwabShares - ledgerShares) <= SHARE_TOL + 1e-12) &&
  (schwabBasis == null || Math.abs(schwabBasis - ledgerBasis) <= BASIS_TOL + 1e-9)

const r6 = (v) => Math.round(v * 1e6) / 1e6
const EPS = 1e-9

export class LedgerError extends Error {
  constructor(message) { super(message); this.status = 400 }
}

/**
 * Within one day, a fixed order so totals never depend on entry order (deleting
 * and re-adding a row gives it a new id): shares in, income, closes (freeing
 * cover), rolls, opens, shares out. A close/roll of a call opened that same day
 * goes after it. Ties go by amount then shares, so even two same-day buys
 * replay the same way whichever was entered first; id only splits identical rows.
 */
const DAY_RANK = { BUY: 0, DRIP: 0, DIVIDEND: 1, ROC: 2, RECLASS: 3, CC_CLOSE: 4, CC_EXPIRE: 4, CC_ROLL: 5, CC_OPEN: 6, SELL: 10 }
export const sortLedger = (txs) => {
  const byId = new Map(txs.map(t => [t.id, t])), memo = new Map()
  const rank = (t, depth = 0) => {
    if (memo.has(t)) return memo.get(t)
    let r = DAY_RANK[t.type] ?? 9
    const ref = t.type.startsWith('CC_') && byId.get(t.ref_id)
    if (ref && ref.date === t.date && depth < 50) r = Math.max(r, rank(ref, depth + 1) + 0.5)
    memo.set(t, r)
    return r
  }
  const n = (v) => Number(v) || 0
  return [...txs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1
      : rank(a) - rank(b) || n(a.amount) - n(b.amount) || n(a.shares) - n(b.shares) || (a.id ?? Infinity) - (b.id ?? Infinity))
}

const label = (t) => `${t.type} on ${t.date}`

/**
 * Replay one holding's ledger. Throws LedgerError on the first row that would
 * make it impossible (oversell, uncovered calls, closing a call that isn't open).
 */
export function replay(transactions) {
  let shares = 0, cost = 0
  let cashInvested = 0, dividends = 0, ccNet = 0, realized = 0, fees = 0, taxWithheld = 0, roc = 0, rocGain = 0
  const open = new Map()     // id → the row that opened the call (CC_OPEN or CC_ROLL)
  const divs = new Map()     // id → { row, reclassed, sharesAt, lots } for RECLASS to point at
  let lots = []              // FIFO tax lots: { id, date, shares, cost }
  const timeline = []
  const events = []          // dated money events, for the income chart and the tax-year report

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
  /** FIFO: oldest lot first; a partially sold lot keeps its cost pro rata. */
  const sellLots = (n) => {
    let left = n
    for (const lot of lots) {
      if (left <= EPS) break
      const take = Math.min(lot.shares, left)
      lot.cost -= lot.cost * (take / lot.shares)
      lot.shares = r6(lot.shares - take)
      left = r6(left - take)
    }
    lots = lots.filter(l => l.shares > EPS)
  }
  /**
   * Take `perShare` off each given lot (per share it holds), never below $0.
   * Returns the part that couldn't come off any lot — a capital gain.
   */
  const lowerLots = (which, perShare) => {
    let excess = 0
    for (const l of which) {
      const cut = perShare * l.shares
      if (cut > l.cost) { excess += cut - Math.max(l.cost, 0); l.cost = 0 } else l.cost -= cut
    }
    return excess
  }
  const ev = (t, e) => events.push({ date: t.date, id: t.id, type: t.type, dividend: 0, tax: 0, cc: 0, realized: 0, fees: 0, roc: 0, rocGain: 0, ...e })

  for (const t of sortLedger(transactions)) {
    const amt = Number(t.amount) || 0
    const fee = FEE_TYPES.includes(t.type) ? Number(t.fees) || 0 : 0
    fees += fee
    switch (t.type) {
      case 'BUY':
        shares = r6(shares + Number(t.shares)); cost += amt + fee; cashInvested += amt + fee
        lots.push({ id: t.id, date: t.date, shares: Number(t.shares), cost: amt + fee })
        if (fee) ev(t, { fees: fee })
        break
      case 'DRIP':
        shares = r6(shares + Number(t.shares)); cost += amt
        lots.push({ id: t.id, date: t.date, shares: Number(t.shares), cost: amt })
        break
      case 'DIVIDEND': {
        const tax = Number(t.tax_withheld) || 0
        if (shares > EPS) cost -= amt   // with no shares it's income only (see top)
        dividends += amt; taxWithheld += tax
        divs.set(t.id, { row: t, reclassed: 0, sharesAt: shares, lots: new Set(lots) })
        ev(t, { dividend: amt, tax })
        break
      }
      case 'ROC': {
        if (shares <= 0) throw new LedgerError(`${label(t)}: return of capital with no shares held.`)
        cost -= amt; roc += amt
        const gain = lowerLots(lots, amt / lots.reduce((s, l) => s + l.shares, 0))
        rocGain += gain
        ev(t, { roc: amt, rocGain: gain })
        break
      }
      case 'RECLASS': {
        // An earlier dividend turns out to have been return of capital. The cash was
        // already counted (net dividend), so the adjusted basis doesn't move; income
        // moves from dividend to ROC in the ORIGINAL dividend's tax year, and the
        // broker's lots come down.
        const d = divs.get(t.ref_id)
        if (!d) throw new LedgerError(`${label(t)}: pick the earlier dividend being reclassified.`)
        if (amt > Number(d.row.amount) - d.reclassed + 0.005) {
          throw new LedgerError(`${label(t)}: reclassifying $${amt.toFixed(2)} but that dividend only has $${(Number(d.row.amount) - d.reclassed).toFixed(2)} left.`)
        }
        d.reclassed += amt
        dividends -= amt; roc += amt
        // Only lots that were held on the dividend date were paid it, at amt ÷ shares then
        // per share. Whatever belonged to shares sold since was a gain on that sale.
        const entitled = lots.filter(l => d.lots.has(l))
        const kept = entitled.reduce((s, l) => s + l.shares, 0)
        const perShare = d.sharesAt > EPS ? amt / d.sharesAt : 0
        const gain = lowerLots(entitled, perShare) + (amt - perShare * kept)
        rocGain += gain
        events.push({ date: d.row.date, id: t.id, type: t.type, dividend: -amt, tax: 0, cc: 0, realized: 0, fees: 0, roc: amt, rocGain: gain })
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
        const n = Number(t.shares)
        if (t.ref_id != null) {   // called away: the call ends with exactly its shares
          const call = takeOpen(t)
          if (Math.abs(n - call.contracts * SHARES_PER_CONTRACT) > EPS) {
            throw new LedgerError(`${label(t)}: ${call.contracts} contract(s) called away delivers ${call.contracts * SHARES_PER_CONTRACT} shares, not ${n}.`)
          }
        }
        if (n > shares + EPS) throw new LedgerError(`${label(t)}: selling ${n} shares but only ${shares} held.`)
        const removed = (cost / shares) * n
        const gain = amt - fee - removed
        realized += gain
        sellLots(n)
        shares = r6(shares - n)
        if (shares === 0) { cost = 0; lots = [] } else cost -= removed
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
    schwabBasis: lots.reduce((s, l) => s + l.cost, 0),   // remaining FIFO lots — what the broker shows
    lots: lots.map(l => ({ ...l })),
    cashInvested, dividends, ccNet, realized, fees, taxWithheld, roc, rocGain,
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
  const s = { grossDividends: 0, taxWithheld: 0, netDividends: 0, roc: 0, rocGain: 0, ccNet: 0, realized: 0, fees: 0 }
  for (const e of events) {
    if (auFY(e.date) !== fy) continue
    s.netDividends += e.dividend; s.taxWithheld += e.tax; s.grossDividends += e.dividend + e.tax
    s.roc += e.roc; s.rocGain += e.rocGain ?? 0; s.ccNet += e.cc; s.realized += e.realized; s.fees += e.fees
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
