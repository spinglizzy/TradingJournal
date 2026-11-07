/**
 * Schwab Positions export → per-symbol shares and cost basis, for Reconcile.
 * Shared by the client (parses the file in the browser) and the tests.
 *
 * Schwab puts a title line and blanks above the header, a "Cash & Cash
 * Investments" row and an "Account Total" row below the positions. The header
 * is found by its column names, not its position.
 */
import { parseCSV } from './csv.js'

const clean = (s) => {
  const t = String(s ?? '').replace(/[$,%\s]/g, '')
  if (!t || t === '--' || /^n\/?a$/i.test(t)) return null
  const n = Number(t.replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : null
}
const isSymbol   = (c) => /^symbol$/i.test(c.trim())
const isQty      = (c) => /^(qty|quantity)\b/i.test(c.trim()) || /\(quantity\)/i.test(c)
const isBasis    = (c) => /^cost basis\b/i.test(c.trim())
const NOT_A_POSITION = /cash|money market|account total|^total\b/i

export function parsePositions(text) {
  const rows = parseCSV(String(text).replace(new RegExp('^' + String.fromCharCode(0xFEFF)), ''))
  const hi = rows.findIndex(r => r.some(isSymbol) && r.some(isQty) && r.some(isBasis))
  if (hi < 0) throw Object.assign(new Error('Not a Schwab positions CSV — no Symbol / Quantity / Cost Basis header.'), { status: 400 })
  const h = rows[hi]
  const col = { symbol: h.findIndex(isSymbol), qty: h.findIndex(isQty), basis: h.findIndex(isBasis),
    desc: h.findIndex(c => /^description$/i.test(c.trim())), type: h.findIndex(c => /security type/i.test(c)) }
  const positions = []
  for (const r of rows.slice(hi + 1)) {
    const symbol = (r[col.symbol] ?? '').trim()
    if (!symbol) continue
    const extra = `${col.desc >= 0 ? r[col.desc] : ''} ${col.type >= 0 ? r[col.type] : ''}`
    if (NOT_A_POSITION.test(symbol) || /money market|cash and money/i.test(extra)) continue
    const shares = clean(r[col.qty])
    if (shares == null) continue
    positions.push({ symbol: symbol.toUpperCase(), shares, costBasis: clean(r[col.basis]) })
  }
  return positions
}

/**
 * Line the file up against the ledger.
 * holdings: [{ ticker, shares }] → { found: { TICKER: { shares, costBasis } }, notInLedger, missingFromFile }
 */
export function matchPositions(positions, holdings) {
  const tickers = new Set(holdings.map(h => h.ticker))
  const found = {}
  const notInLedger = []
  for (const p of positions) {
    if (tickers.has(p.symbol)) found[p.symbol] = { shares: p.shares, costBasis: p.costBasis }
    else notInLedger.push(p.symbol)
  }
  const missingFromFile = holdings.filter(h => h.shares > 0 && !found[h.ticker]).map(h => h.ticker)
  return { found, notInLedger, missingFromFile }
}
