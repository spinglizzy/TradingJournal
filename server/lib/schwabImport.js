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

export const MAP_CHOICES = ['BUY', 'SELL', 'DRIP', 'DIVIDEND', 'ROC', 'CASH_IN', 'CASH_OUT']
const COLS = ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Fees & Comm', 'Amount']

const bad = (msg) => Object.assign(new Error(msg), { status: 400 })
/** "$1,234.50" / "-$0.79" / "($0.79)" / "" → number | null */
const num = (s) => {
  if (s == null || String(s).trim() === '') return null
  const t = String(s).replace(/[$,\s]/g, '')
  const n = Number(t.replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : null
}
/** "3/2/2026" or "03/02/2026" → "2026-03-02" (Excel re-saves drop the leading zeros). */
const mdy = (m) => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
/**
 * "10/21/2026 as of 10/20/2026" → { post: "2026-10-21", date: "2026-10-20" }.
 * `date` is when it really happened (the ledger date, so the tax year is right);
 * `post` is the date Schwab posted it, which stays in the duplicate hash.
 */
const dates = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+as of\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/i.exec(String(s).trim())
  if (!m) return null
  const post = mdy(m)
  return { post, date: m[4] ? mdy([null, m[4], m[5], m[6]]) : post }
}
/** Stock symbols: trimmed, upper case, "BRK/B" → "BRK.B" (option symbols keep their slashes). */
const symbolOf = (s) => { const t = String(s).trim().toUpperCase(); return /\s/.test(t) ? t : t.replace('/', '.') }
const sha1 = (s) => createHash('sha1').update(s).digest('hex')
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
    if (r.every(c => !String(c).trim()) || /^transactions total/i.test(String(r[0]).trim())) return   // blank / footer
    const d = dates(cell('Date'))
    // Anything else without a readable date is refused loudly — never silently dropped.
    if (!d) throw bad(`Row ${hi + fileIdx + 2} has a date Dragon can't read ("${String(cell('Date')).slice(0, 40)}"). Nothing was imported.`)
    lines.push({
      fileIdx, date: d.date, post: d.post, action: cell('Action').trim(), symbol: symbolOf(cell('Symbol')), rawSymbol: cell('Symbol').trim(),
      description: cell('Description').trim(), rawQty: cell('Quantity'), rawAmount: cell('Amount'),
      quantity: num(cell('Quantity')), price: num(cell('Price')), fees: num(cell('Fees & Comm')) ?? 0, amount: num(cell('Amount')),
    })
  })
  // The file is newest-first; replay oldest-first. Same-day rows keep reverse file order.
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.fileIdx - a.fileIdx))
  // Identical rows on one day are told apart by a running index.
  //   hash   — from the PARSED numbers, so a re-saved / reformatted export still matches.
  //   hashV1 — the original raw-text hash, kept so rows imported before the change still
  //            count as duplicates (and to map old → new in the one-off re-hash).
  const seen = new Map(), seenV1 = new Map()
  const fix = (v, dp) => (v == null ? '' : v.toFixed(dp))
  for (const l of lines) {
    const key = [l.post, l.action, l.symbol, fix(l.quantity, 6), fix(l.amount, 2)].join('|')
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    l.hash = sha1(`v2|${key}|${n}`)
    const keyV1 = [l.post, l.action, l.rawSymbol, l.rawQty, l.rawAmount].join('|')
    const n1 = seenV1.get(keyV1) ?? 0
    seenV1.set(keyV1, n1 + 1)
    l.hashV1 = sha1(`${keyV1}|${n1}`)
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
  if (a === 'return of capital') return 'ROC'
  if (a === 'cash in lieu') return 'CIL'
  if ((a.includes('div') && a.includes('adj')) || a.includes('reclass')) return 'DIV_ADJ'   // before the dividend catch-all
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
    hash: l.hash, hashV1: l.hashV1, date: l.date, action: l.action, symbol: l.symbol, description: l.description,
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
    const key = `${l.post}|${l.symbol}`
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

  // A negative dividend adjustment + an equal Return Of Capital on the same day is
  // a reclassification: income moves to ROC, no cash changes hands.
  const reclassOf = new Map()   // ROC line → its adjustment line
  for (const l of lines) {
    if (kinds.get(l) !== 'DIV_ADJ') continue
    consumed.add(l)
    const roc = l.amount < 0 && lines.find(r => kinds.get(r) === 'ROC' && !reclassOf.has(r) && r.date === l.date
      && r.symbol === l.symbol && Math.abs((r.amount ?? 0) + l.amount) < 0.005)
    if (!roc) { toReview(l, 'Dividend adjustment without an equal Return Of Capital on the same day — enter it from the holding'); continue }
    reclassOf.set(roc, l)
  }

  const dividendTickers = new Set()
  const add = (l, type, f, extra = {}) => intents.push({ hash: l.hash, hashV1: l.hashV1, date: l.date, symbol: f.symbol ?? l.symbol, name: l.description, type,
    tx: { type, date: l.date, shares: null, price: null, amount: 0, fees: 0, strike: null, expiry: null, contracts: null, premium: null, tax_withheld: null, ref_id: null, notes: null, ...f.tx },
    ...extra })

  for (const l of lines) {
    if (consumed.has(l)) continue
    const k = kinds.get(l)
    if (k === 'SKIP') continue
    if (k === null) { toReview(l, `Unrecognised action "${l.action}"`, true); continue }

    if (k === 'DIVIDEND' || k === 'TAX') {
      const group = divGroups.get(`${l.post}|${l.symbol}`)
      if (group[0] !== l) continue                       // emitted once, at its first line
      if (!l.symbol) { group.forEach(g => toReview(g, 'Dividend line with no symbol — map it to cash, or skip it', true)); continue }
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

    if (k === 'ROC') {
      if (!l.symbol || !(l.amount > 0)) { toReview(l, 'Return Of Capital needs a symbol and a positive amount'); continue }
      const reclass = reclassOf.has(l)
      add(l, reclass ? 'RECLASS' : 'ROC', { tx: { amount: round2(l.amount) } }, reclass ? { reclass: true } : {})
      continue
    }

    if (k === 'CIL') {   // cash paid for a fractional share: a sale of that fraction
      const shares = Math.abs(l.quantity ?? 0)
      if (!l.symbol || !(shares > 0) || !(l.amount > 0)) { toReview(l, 'Cash In Lieu without a share quantity — enter it as a Sell by hand'); continue }
      add(l, 'SELL', { tx: { shares, price: (l.amount + l.fees) / shares, amount: round2(l.amount + l.fees), fees: l.fees } })
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
const near = (a, b, eps) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= eps + 1e-12   // 0.1660 − 0.1659 is 1.00000000000017e-4 in floats

/** Is ledger row `r` the hand-entered version of the incoming `tx`? */
function sameEntry(r, tx, it, ledger) {
  if (r.type !== tx.type || r.date !== tx.date) return false
  if (it.match) {   // close / expire / called away: compare the call it ends
    const call = ledger.find(x => x.id === r.ref_id)
    return !!call && near(call.strike, it.match.strike, 1e-6) && call.expiry === it.match.expiry && call.contracts === it.match.contracts
      && (tx.type !== 'SELL' || near(r.shares, tx.shares, 1e-4))
  }
  switch (tx.type) {
    case 'BUY': case 'SELL': case 'DRIP': return near(r.shares, tx.shares, 1e-4)
    case 'DIVIDEND': case 'ROC': case 'RECLASS': return near(r.amount, tx.amount, 0.01)
    case 'CC_OPEN': return near(r.strike, tx.strike, 1e-6) && r.expiry === tx.expiry && r.contracts === tx.contracts
    default: return false
  }
}

/**
 * Apply a plan through `store`:
 *   hashes()                         → Set of import_hash already in the ledger
 *   holdings()                       → Map ticker → holding
 *   createHolding({ticker,name,pays_dividend}) → holding
 *   setPaysDividend(holding)         → mark a holding as a dividend payer
 *   ledger(holding)                  → that holding's rows (this function appends to it)
 *   insert(holding|null, tx, hash)   → the stored row (with id)
 *   adopt(row, merged, hash)         → a hand-entered row updated to the broker's figures
 *   deletedHashes()  (optional)      → Set of import_hash values of rows the user deleted
 */
export async function runImport(plan, store) {
  const hashes = await store.hashes()
  const deleted = (await store.deletedHashes?.()) ?? new Set()
  const holdings = await store.holdings()
  const ledgers = new Map()
  const report = { added: [], adopted: [], duplicates: 0, review: [...plan.review], createdHoldings: [] }
  const adopted = new Set()
  const ledgerOf = async (h) => {
    if (!ledgers.has(h.id)) ledgers.set(h.id, [...await store.ledger(h)])
    return ledgers.get(h.id)
  }
  const stored = (it) => hashes.has(it.hash) || (it.hashV1 && hashes.has(it.hashV1))
  // Same-day fills of one order: shares of every new BUY/SELL/DRIP per date|type|symbol.
  const fills = new Map()
  for (const it of plan.intents) {
    if (stored(it) || !['BUY', 'SELL', 'DRIP'].includes(it.type)) continue
    const k = `${it.date}|${it.type}|${it.symbol}`
    fills.set(k, (fills.get(k) ?? 0) + it.tx.shares)
  }
  const prevDeleted = (it) => deleted.has(it.hash) || (it.hashV1 && deleted.has(it.hashV1)) ? { previouslyDeleted: true } : {}

  for (const it of plan.intents) {
    if (stored(it)) {
      // A dividend imported before its NRA tax line posted: Schwab now shows the tax,
      // so the stored row is brought up to date (shown in the preview as was → now).
      if (it.type === 'DIVIDEND' && holdings.has(it.symbol)) {
        const ledger = await ledgerOf(holdings.get(it.symbol))
        const row = ledger.find(r => r.import_hash === it.hash || (it.hashV1 && r.import_hash === it.hashV1))
        if (row && Math.abs((Number(row.tax_withheld) || 0) - (it.tx.tax_withheld || 0)) > 0.005) {
          const merged = { ...row, amount: it.tx.amount, tax_withheld: it.tx.tax_withheld }
          try { replay(ledger.map(r => (r === row ? merged : r))) } catch (e) {
            if (!(e instanceof LedgerError)) throw e
            report.review.push({ hash: it.hash, date: it.date, action: it.type, symbol: it.symbol, amount: it.tx.amount, reason: e.message, mappable: false })
            continue
          }
          const updated = await store.adopt(row, merged, row.import_hash)
          ledger[ledger.indexOf(row)] = updated
          report.adopted.push({ date: it.date, type: it.type, symbol: it.symbol, amount: merged.amount, was: Number(row.amount), note: `US tax now ${merged.tax_withheld ?? 0}` })
          continue
        }
      }
      report.duplicates++; continue
    }
    const tx = { ...it.tx }
    if (it.cash) {
      await store.insert(null, tx, it.hash)
      report.added.push({ date: it.date, type: it.type, symbol: null, amount: tx.amount, fees: 0, ...prevDeleted(it) })
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

    // The same entry typed in by hand (e.g. a Monthly DCA buy) is adopted, not doubled:
    // it takes the broker's exact figures and the import_hash.
    let twin = ledger.find(r => !r.import_hash && !adopted.has(r.id) && sameEntry(r, tx, it, ledger))
    // One hand-entered order Schwab filled in parts: the first fill takes over the
    // hand row, the rest are added — never the whole order twice.
    if (!twin && ['BUY', 'SELL', 'DRIP'].includes(tx.type)) {
      const total = fills.get(`${it.date}|${tx.type}|${it.symbol}`)
      twin = ledger.find(r => !r.import_hash && !adopted.has(r.id) && r.type === tx.type && r.date === tx.date
        && Number(r.shares) > tx.shares && near(r.shares, total, 1e-4))
    }
    if (twin) {
      const merged = { ...twin, shares: tx.shares ?? twin.shares, price: tx.price ?? twin.price, amount: tx.amount,
        fees: tx.fees ?? 0, premium: tx.premium ?? twin.premium, tax_withheld: tx.tax_withheld ?? twin.tax_withheld, import_hash: it.hash }
      try {
        replay(ledger.map(r => (r === twin ? merged : r)))
      } catch (e) {
        if (!(e instanceof LedgerError)) throw e
        reject(e.message); continue
      }
      const row = await store.adopt(twin, merged, it.hash)
      ledger[ledger.indexOf(twin)] = row
      adopted.add(row.id)
      report.adopted.push({ date: it.date, type: it.type, symbol: it.symbol, shares: merged.shares, amount: merged.amount, was: Number(twin.amount), wasShares: Number(twin.shares ?? 0) || null })
      continue
    }

    if (it.reclass) {
      const candidates = ledger.filter(t => t.type === 'DIVIDEND' && t.date < it.date && Math.abs(Number(t.amount) - tx.amount) <= 0.01)
      if (candidates.length !== 1) {
        reject(`Reclassification of $${tx.amount.toFixed(2)}: ${candidates.length ? `${candidates.length} dividends` : 'no dividend'} of that size — use Reclassify on the holding to pick it`)
        continue
      }
      tx.ref_id = candidates[0].id
    }
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
    report.added.push({ date: it.date, type: it.type, symbol: it.symbol, shares: tx.shares, amount: tx.amount, fees: tx.fees, tax_withheld: tx.tax_withheld, ...prevDeleted(it) })
  }
  report.review.sort((a, b) => (a.date < b.date ? -1 : 1))
  return report
}
