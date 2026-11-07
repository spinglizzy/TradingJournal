/**
 * Schwab transactions CSV → Dragon ledger rows.
 *
 *   parseSchwab(text)            → source lines, oldest first, each with an import_hash
 *   planImport(lines, mappings)  → { intents, review }   (pure: what each line means)
 *   runImport(plan, store)       → report                (skips duplicates, links calls,
 *                                                          replays the ledger before every insert)
 *
 * `store` is the only I/O. The route backs it with Postgres inside a transaction it
 * rolls back for a preview; the tests back it with memory. Same code path either way.
 *
 * Money: Schwab's Amount is the NET cash (Fees & Comm already taken off). Dragon
 * stores GROSS `amount` + `fees` and the engine applies the fee, so gross is
 * worked back from Amount here — the fee lands once, never twice.
 */
import { createHash } from 'node:crypto'
import { parseCSV } from './csv.js'
import { replay, LedgerError } from './dragonEngine.js'

export const MAP_CHOICES = ['BUY', 'SELL', 'DRIP', 'DIVIDEND', 'CASH_IN', 'CASH_OUT']
const COLS = ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Fees & Comm', 'Amount']

const bad = (msg) => Object.assign(new Error(msg), { status: 400 })
/** "$1,234.50" / "-$0.79" / "($0.79)" / "" → number | null */
const num = (s) => {
  if (s == null || String(s).trim() === '') return null
  const t = String(s).replace(/[$,\s]/g, '')
  const n = Number(t.replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : null
}
/** "10/21/2026 as of 10/20/2026" → "2026-10-21" (the first date). */
const isoDate = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s).trim())
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null
}
const usDate = (s) => {   // option expiry: MM/DD/YYYY or MM/DD/YY
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(s)
  return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1]}-${m[2]}` : null
}

/** "CVX 12/19/2026 230.00 C", else "CALL CHEVRON CORP $230 EXP 12/19/26". */
export function parseOption(symbol, description) {
  let m = /^(\S+)\s+(\d{2}\/\d{2}\/\d{2,4})\s+([\d.]+)\s+([CP])$/.exec(symbol.trim())
  if (m) return { underlying: m[1], expiry: usDate(m[2]), strike: Number(m[3]), right: m[4] }
  m = /^(CALL|PUT)\b.*\$([\d.]+)\s+EXP\s+(\d{2}\/\d{2}\/\d{2,4})/i.exec(description.trim())
  if (m) return { underlying: symbol.trim().split(/\s+/)[0] || null, expiry: usDate(m[3]), strike: Number(m[2]), right: m[1][0].toUpperCase() }
  return null
}

export function parseSchwab(text) {
  const rows = parseCSV(String(text).replace(new RegExp('^' + String.fromCharCode(0xFEFF)), ''))   // Excel-saved CSVs start with a BOM
  const hi = rows.findIndex(r => r.includes('Date') && r.includes('Action'))
  if (hi < 0) throw bad('Not a Schwab transactions CSV — no Date / Action header row.')
  const idx = Object.fromEntries(COLS.map(c => [c, rows[hi].indexOf(c)]))
  const missing = COLS.filter(c => idx[c] < 0)
  if (missing.length) throw bad(`CSV is missing column(s): ${missing.join(', ')}`)

  const lines = []
  rows.slice(hi + 1).forEach((r, fileIdx) => {
    const cell = (c) => r[idx[c]] ?? ''
    const date = isoDate(cell('Date'))
    if (!date) return   // footer rows such as "Transactions Total"
    lines.push({
      fileIdx, date, action: cell('Action').trim(), symbol: cell('Symbol').trim(), description: cell('Description').trim(),
      rawQty: cell('Quantity'), rawAmount: cell('Amount'),
      quantity: num(cell('Quantity')), price: num(cell('Price')), fees: num(cell('Fees & Comm')) ?? 0, amount: num(cell('Amount')),
    })
  })
  // The file is newest-first; replay oldest-first. Same-day rows keep reverse file order.
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.fileIdx - a.fileIdx))
  // Identical rows on one day are told apart by a running index.
  const seen = new Map()
  for (const l of lines) {
    const key = [l.date, l.action, l.symbol, l.rawQty, l.rawAmount].join('|')
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    l.hash = createHash('sha1').update(`${key}|${n}`).digest('hex')
  }
  return lines
}

/** Action text → what it means. null = unrecognised. */
function classify(action) {
  const a = action.toLowerCase()
  if (MAP_CHOICES.includes(action)) return action          // a user mapping from the review list
  if (a === 'buy') return 'BUY'
  if (a === 'sell') return 'SELL'
  if (a === 'reinvest shares') return 'DRIP'
  if (a === 'nra tax adj') return 'TAX'
  if (a === 'sell to open') return 'OPT_OPEN'
  if (a === 'buy to close') return 'OPT_CLOSE'
  if (a === 'expired') return 'OPT_EXPIRE'
  if (a === 'assigned') return 'OPT_ASSIGNED'
  if (a === 'moneylink transfer' || a === 'journal') return 'CASH'
  if (/\bdiv/.test(a) || a.includes('dividend')) return 'DIVIDEND'
  return null
}

/**
 * Turn lines into intents. Lines that can't be read with certainty go to
 * `review` — nothing is guessed. `mappings` = { [hash]: MAP_CHOICES | 'skip' }.
 */
export function planImport(lines, mappings = {}) {
  const intents = [], review = []
  const toReview = (l, reason, mappable = false) => review.push({
    hash: l.hash, date: l.date, action: l.action, symbol: l.symbol, description: l.description,
    quantity: l.quantity, price: l.price, amount: l.amount, reason, mappable, mapping: mappings[l.hash] ?? null,
  })
  const kinds = new Map()
  for (const l of lines) {
    const m = mappings[l.hash]
    kinds.set(l, m === 'skip' ? 'SKIP' : classify(m ?? l.action))
  }

  // Dividend + NRA tax lines on one date and symbol → ONE dividend.
  const divGroups = new Map()
  for (const l of lines) {
    const k = kinds.get(l)
    if (k !== 'DIVIDEND' && k !== 'TAX') continue
    const key = `${l.date}|${l.symbol}`
    if (!divGroups.has(key)) divGroups.set(key, [])
    divGroups.get(key).push(l)
  }
  // "Assigned" option line + the share "Sell" it caused → one called-away SELL.
  const assignedFor = new Map()   // sell line → option
  const consumed = new Set()
  for (const l of lines) {
    if (kinds.get(l) !== 'OPT_ASSIGNED') continue
    const opt = parseOption(l.symbol, l.description)
    const contracts = Math.abs(l.quantity ?? 0)
    const sell = opt && lines.find(s => kinds.get(s) === 'SELL' && !assignedFor.has(s) && s.date === l.date
      && s.symbol === opt.underlying && Math.abs(s.quantity ?? 0) === contracts * 100)
    if (!opt || opt.right !== 'C' || !sell) { consumed.add(l); toReview(l, 'Assignment with no matching share sale of the same size on that date'); continue }
    assignedFor.set(sell, { ...opt, contracts })
    consumed.add(l)
  }

  const dividendTickers = new Set()
  const add = (l, type, f, extra = {}) => intents.push({ hash: l.hash, date: l.date, symbol: f.symbol ?? l.symbol, name: l.description, type,
    tx: { type, date: l.date, shares: null, price: null, amount: 0, fees: 0, strike: null, expiry: null, contracts: null, premium: null, tax_withheld: null, ref_id: null, notes: null, ...f.tx },
    ...extra })

  for (const l of lines) {
    if (consumed.has(l)) continue
    const k = kinds.get(l)
    if (k === 'SKIP') continue
    if (k === null) { toReview(l, `Unrecognised action "${l.action}"`, true); continue }

    if (k === 'DIVIDEND' || k === 'TAX') {
      const group = divGroups.get(`${l.date}|${l.symbol}`)
      if (group[0] !== l) continue                       // emitted once, at its first line
      const divs = group.filter(g => kinds.get(g) === 'DIVIDEND')
      if (!divs.length) { group.forEach(g => toReview(g, 'NRA Tax Adj with no dividend on the same date and symbol', true)); continue }
      if (group.some(g => g.amount == null)) { group.forEach(g => toReview(g, 'Dividend line with no amount')); continue }
      const gross = divs.reduce((s, g) => s + g.amount, 0)
      const tax = -group.filter(g => kinds.get(g) === 'TAX').reduce((s, g) => s + g.amount, 0)
      const net = gross - tax
      if (!(net > 0)) { group.forEach(g => toReview(g, 'Dividend nets to zero or less')); continue }
      dividendTickers.add(l.symbol)
      add(divs[0], 'DIVIDEND', { symbol: l.symbol, tx: { amount: round2(net), tax_withheld: tax ? round2(tax) : null } })
      continue
    }

    if (k === 'CASH' || k === 'CASH_IN' || k === 'CASH_OUT') {
      if (!l.amount) { toReview(l, 'Cash line with no amount', true); continue }
      const type = k === 'CASH' ? (l.amount > 0 ? 'CASH_IN' : 'CASH_OUT') : k
      add(l, type, { symbol: null, tx: { amount: Math.abs(l.amount) } }, { cash: true })
      continue
    }

    if (k === 'BUY' || k === 'SELL' || k === 'DRIP') {
      const shares = Math.abs(l.quantity ?? 0)
      if (!l.symbol || !(shares > 0) || l.amount == null) { toReview(l, 'Share line needs a symbol, quantity and amount', true); continue }
      const net = Math.abs(l.amount)
      const fees = k === 'DRIP' ? 0 : l.fees
      const gross = k === 'SELL' ? net + fees : net - fees   // Amount is net of fees
      if (k === 'DRIP') dividendTickers.add(l.symbol)
      const called = assignedFor.get(l)
      add(l, k, { tx: { shares, price: l.price ?? gross / shares, amount: round2(gross), fees } },
        called ? { match: { strike: called.strike, expiry: called.expiry, contracts: called.contracts } } : {})
      continue
    }

    // Option lines (k === 'OPT_*')
    const opt = parseOption(l.symbol, l.description)
    if (!opt || !opt.expiry) { toReview(l, "Can't read strike / expiry from the option symbol"); continue }
    if (opt.right !== 'C') { toReview(l, 'Puts are not tracked in Dragon (covered calls only)'); continue }
    const contracts = Math.abs(l.quantity ?? 0)
    if (!Number.isInteger(contracts) || contracts < 1) { toReview(l, 'Option line has no whole contract quantity'); continue }
    const match = { strike: opt.strike, expiry: opt.expiry, contracts }
    if (k === 'OPT_OPEN') {
      if (l.amount == null) { toReview(l, 'Sell to Open with no amount'); continue }
      add(l, 'CC_OPEN', { symbol: opt.underlying, tx: { strike: opt.strike, expiry: opt.expiry, contracts,
        premium: l.price ?? (l.amount + l.fees) / (contracts * 100), amount: round2(l.amount + l.fees), fees: l.fees } })
    } else if (k === 'OPT_CLOSE') {
      if (l.amount == null) { toReview(l, 'Buy to Close with no amount'); continue }
      const gross = Math.abs(l.amount) - l.fees
      add(l, 'CC_CLOSE', { symbol: opt.underlying, tx: { premium: l.price ?? gross / (contracts * 100), amount: round2(gross), fees: l.fees } }, { match })
    } else if (k === 'OPT_EXPIRE') {
      add(l, 'CC_EXPIRE', { symbol: opt.underlying, tx: {} }, { match })
    }
  }
  return { intents, review, dividendTickers }
}

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100

/**
 * Apply a plan through `store`:
 *   hashes()                         → Set of import_hash already in the ledger
 *   holdings()                       → Map ticker → holding
 *   createHolding({ticker,name,pays_dividend}) → holding
 *   setPaysDividend(holding)         → mark a holding as a dividend payer
 *   ledger(holding)                  → that holding's rows (this function appends to it)
 *   insert(holding|null, tx, hash)   → the stored row (with id)
 */
export async function runImport(plan, store) {
  const hashes = await store.hashes()
  const holdings = await store.holdings()
  const ledgers = new Map()
  const report = { added: [], duplicates: 0, review: [...plan.review], createdHoldings: [] }
  const ledgerOf = async (h) => {
    if (!ledgers.has(h.id)) ledgers.set(h.id, [...await store.ledger(h)])
    return ledgers.get(h.id)
  }

  for (const it of plan.intents) {
    if (hashes.has(it.hash)) { report.duplicates++; continue }
    const tx = { ...it.tx }
    if (it.cash) {
      await store.insert(null, tx, it.hash)
      report.added.push({ date: it.date, type: it.type, symbol: null, amount: tx.amount, fees: 0 })
      continue
    }
    let h = holdings.get(it.symbol)
    if (!h) {
      h = await store.createHolding({ ticker: it.symbol, name: it.name || null, pays_dividend: plan.dividendTickers.has(it.symbol) })
      holdings.set(it.symbol, h)
      report.createdHoldings.push({ ticker: it.symbol, pays_dividend: h.pays_dividend })
    } else if (!h.pays_dividend && (it.type === 'DIVIDEND' || it.type === 'DRIP')) {
      h = await store.setPaysDividend(h)   // Schwab paid one, so it does pay
      holdings.set(it.symbol, h)
    }
    const ledger = await ledgerOf(h)
    const reject = (reason) => report.review.push({ hash: it.hash, date: it.date, action: it.type, symbol: it.symbol, amount: tx.amount, reason, mappable: false })

    if (it.match) {
      const asOf = ledger.filter(t => t.date <= it.date)
      const m = it.match
      const call = replay(asOf).openCalls
        .filter(c => Number(c.strike) === m.strike && c.expiry === m.expiry && c.contracts === m.contracts)
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
      if (!call) { reject(`No open ${m.contracts}× $${m.strike} call expiring ${m.expiry} to match`); continue }
      tx.ref_id = call.id
    }
    try {
      replay([...ledger, tx])
    } catch (e) {
      if (!(e instanceof LedgerError)) throw e
      reject(e.message); continue
    }
    const row = await store.insert(h, tx, it.hash)
    ledger.push(row)
    report.added.push({ date: it.date, type: it.type, symbol: it.symbol, shares: tx.shares, amount: tx.amount, fees: tx.fees, tax_withheld: tx.tax_withheld })
  }
  report.review.sort((a, b) => (a.date < b.date ? -1 : 1))
  return report
}
