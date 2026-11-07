/**
 * Server-side quotes for the Dragon tab (Finnhub free tier).
 *
 * The API key lives in process.env.FINNHUB_API_KEY and is only ever used in the
 * outbound request built here. Nothing returned from this module contains it,
 * so the browser only ever sees prices.
 *
 * refreshQuotes() is pure apart from the injected getQuote, so tests mock it.
 */

export const CACHE_MS = 15 * 60 * 1000
// Finnhub free tier: 60 calls/min. One refresh stays well under it; anything past
// this waits for the next refresh rather than risking a 429.
export const MAX_PER_REFRESH = 50

export class QuoteError extends Error {
  constructor(message, kind) { super(message); this.kind = kind }   // kind: rate_limited | bad_key | not_found | http
}

/** getQuote(symbol) → price, backed by Finnhub's /quote endpoint. */
export function finnhubQuote(apiKey, fetchImpl = fetch) {
  return async (symbol) => {
    let r
    try {
      r = await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`)
    } catch {
      throw new QuoteError('Price service unreachable', 'http')
    }
    if (r.status === 429) throw new QuoteError('Rate limited by Finnhub — try again in a minute', 'rate_limited')
    if (r.status === 401 || r.status === 403) throw new QuoteError('Finnhub rejected the API key', 'bad_key')
    if (!r.ok) throw new QuoteError(`Price service error (HTTP ${r.status})`, 'http')
    const q = await r.json().catch(() => null)
    // Finnhub answers an unknown symbol with 200 and c = 0 — never store that as a price.
    if (!(Number(q?.c) > 0)) throw new QuoteError('No quote for this ticker', 'not_found')
    return Number(q.c)
  }
}

/**
 * Decide and fetch. Any price set in the last 15 minutes (auto OR manual) is left
 * alone, so repeat visits cost nothing and a price you just typed survives until
 * the next refresh after that. A failed ticker keeps its last price; a bad key or
 * a 429 stops the run and marks the rest as not refreshed.
 *
 * → { updates: [{ id, price }], failures: [{ id, error }], skipped: [id] }
 */
export async function refreshQuotes(holdings, getQuote, { now = Date.now() } = {}) {
  const out = { updates: [], failures: [], skipped: [] }
  let stop = null, calls = 0
  for (const h of holdings) {
    const fresh = h.price_updated_at && now - new Date(h.price_updated_at).getTime() < CACHE_MS   // pg hands back a Date
    if (fresh) { out.skipped.push(h.id); continue }
    if (stop) { out.failures.push({ id: h.id, error: stop }); continue }
    if (calls >= MAX_PER_REFRESH) { out.skipped.push(h.id); continue }
    calls++
    try {
      out.updates.push({ id: h.id, price: await getQuote(h.ticker) })
    } catch (e) {
      const msg = e instanceof QuoteError ? e.message : 'Price fetch failed'
      out.failures.push({ id: h.id, error: msg })
      if (e.kind === 'rate_limited' || e.kind === 'bad_key') stop = msg
    }
  }
  return out
}

/**
 * Holdings after a refresh: new auto prices land, failures keep their price
 * (never blanked, never 0) and carry a warning. Returns only the rows that changed;
 * the route writes exactly these.
 */
export function applyQuotes(holdings, { updates, failures }, nowIso = new Date().toISOString()) {
  const byId = new Map(holdings.map(h => [h.id, h]))
  return [
    ...updates.map(u => ({ ...byId.get(u.id), current_price: u.price, price_updated_at: nowIso, price_source: 'auto', price_error: null })),
    ...failures.map(f => ({ ...byId.get(f.id), price_error: f.error })),
  ]
}
