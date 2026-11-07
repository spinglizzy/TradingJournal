/**
 * AUD conversion for the Australian tax-year report.
 *
 * Rates are the RBA's F11.1 daily AUD/USD (A$1 = USD x), cached server-side in
 * dragon_fx_rates. AUD = USD ÷ rate. A weekend or holiday uses the most recent
 * prior business day; a date after the RBA's last published day has no rate yet
 * (enter one manually), and so does a gap of more than a week.
 * Pure — shared by the client and the tests.
 */
import { parseCSV } from './csv.js'
import { auFY } from './dragonEngine.js'

export const RBA_F11_URL = 'https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv'
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
const MAX_FALLBACK_DAYS = 7

/** RBA F11.1 CSV → [{ date, aud_usd }]. Finds the USD column by its series id, FXRUSD. */
export function parseRbaF11(text) {
  const rows = parseCSV(String(text).replace(new RegExp('^' + String.fromCharCode(0xFEFF)), ''))
  const ids = rows.find(r => r[0] === 'Series ID')
  const col = ids ? ids.indexOf('FXRUSD') : -1
  if (col < 0) throw new Error('RBA F11.1 file has no FXRUSD column')
  const out = []
  for (const r of rows) {
    const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(r[0] ?? '')
    const v = Number(r[col])
    if (m && MON[m[2]] && v > 0) out.push({ date: `${m[3]}-${MON[m[2]]}-${m[1]}`, aud_usd: v })
  }
  return out
}

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000

/**
 * The rate for `date`. rates: [{ date, aud_usd, source }] (any order).
 * → { date: rateDate, aud_usd, source, fallback } | null
 */
export function rateFor(date, rates) {
  let best = null, lastRba = null
  for (const r of rates) {
    if (r.source === 'rba' && (!lastRba || r.date > lastRba)) lastRba = r.date
    if (r.date <= date && (!best || r.date > best.date || (r.date === best.date && r.source === 'manual'))) best = r
  }
  if (!best) return null
  if (best.date !== date) {
    if (!lastRba || date > lastRba) return null              // RBA hasn't published this day yet
    if (days(best.date, date) > MAX_FALLBACK_DAYS) return null // a hole in the data, not a weekend
  }
  return { date: best.date, aud_usd: best.aud_usd, source: best.source, fallback: best.date !== date }
}

export const toAud = (usd, audUsd) => usd / audUsd

export const CATEGORIES = [
  ['dividend', 'Net dividend'],
  ['tax',      'US tax withheld'],
  ['roc',      'Return of capital'],
  ['cc',       'Net CC premium'],
  ['realized', 'Realised P/L'],
  ['fees',     'Fees'],
]

/**
 * One report line per non-zero amount in FY `fy`, converted to AUD.
 * holdings: [{ ticker, events }] → { lines, totals: { usd, aud }, missing }
 * totals carry grossDividends = net dividend + US tax withheld, line by line.
 */
export function taxLines(holdings, fy, rates) {
  const lines = []
  for (const { ticker, events } of holdings) {
    for (const e of events) {
      if (auFY(e.date) !== fy) continue
      for (const [key, label] of CATEGORIES) {
        const usd = e[key]
        if (!usd || Math.abs(usd) < 1e-9) continue
        const rate = rateFor(e.date, rates)
        lines.push({ date: e.date, ticker, key, type: label, usd, rate: rate?.aud_usd ?? null, rateDate: rate?.date ?? null,
          manual: rate?.source === 'manual', missing: !rate, aud: rate ? toAud(usd, rate.aud_usd) : null })
      }
    }
  }
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ticker < b.ticker ? -1 : 1))
  const zero = () => Object.fromEntries([...CATEGORIES.map(([k]) => [k, 0]), ['grossDividends', 0]])
  const totals = { usd: zero(), aud: zero() }
  for (const l of lines) {
    totals.usd[l.key] += l.usd
    if (l.aud != null) totals.aud[l.key] += l.aud
  }
  for (const c of ['usd', 'aud']) totals[c].grossDividends = totals[c].dividend + totals[c].tax
  const missing = [...new Set(lines.filter(l => l.missing).map(l => l.date))]
  return { lines, totals, missing }
}
