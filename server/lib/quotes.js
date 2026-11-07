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
// One slow request must never hang the refresh, and the whole run must finish well
// inside a serverless function's time limit; tickers past the budget wait for the next refresh.
export const QUOTE_TIMEOUT_MS = 4000
export const REFRESH_BUDGET_MS = 8000

export class QuoteError extends Error {
  constructor(message, kind) { super(message); this.kind = kind }   // kind: rate_limited | bad_key | no_access | not_found | http
}

/** getQuote(symbol) → price, backed by Finnhub's /quote endpoint. */
export function finnhubQuote(apiKey, fetchImpl = fetch) {
  return async (symbol) => {
    let r
    try {
      r = await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) })
    } catch (e) {
      throw new QuoteError(e?.name === 'TimeoutError' ? 'Price service timed out' : 'Price service unreachable', 'http')
    }
    if (r.status === 429) throw new QuoteError('Rate limited by Finnhub — try again in a minute', 'rate_limited')
    if (r.status === 401) throw new QuoteError('Finnhub rejected the API key', 'bad_key')
    // The free tier answers 403 for premium-only symbols (e.g. non-US listings): this ticker only.
    if (r.status === 403) throw new QuoteError('Finnhub’s free tier has no quote for this ticker — enter the price by hand', 'no_access')
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
 * the next refresh after that. A ticker that was tried in the last 15 minutes
 * (price_checked_at) isn't retried either, so a failing one costs one call per
 * window, not one per page load. A failed ticker keeps its last price; a bad key
 * or a 429 stops the run and marks the rest as not refreshed.
 *
 * → { updates: [{ id, price }], failures: [{ id, error }], skipped: [id] }
 */
export async function refreshQuotes(holdings, getQuote, { now = Date.now(), clock = Date.now } = {}) {
  const out = { updates: [], failures: [], skipped: [] }
  let stop = null, calls = 0
  const started = clock()
  const recent = (t) => t && now - new Date(t).getTime() < CACHE_MS   // pg hands back a Date
  for (const h of holdings) {
    if (recent(h.price_updated_at) || recent(h.price_checked_at)) { out.skipped.push(h.id); continue }
    if (stop) { out.failures.push({ id: h.id, error: stop }); continue }
    if (calls >= MAX_PER_REFRESH || clock() - started > REFRESH_BUDGET_MS) { out.skipped.push(h.id); continue }
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
 * The writes a refresh makes. A new auto price carries every price column; a
 * failure carries ONLY its warning (the price is never blanked, never 0, and never
 * rewritten from the snapshot). Each write also carries `seen`, the
 * price_updated_at it was decided from: the route only applies it if that hasn't
 * changed, so a price typed while the refresh was in flight always wins.
 */
export function applyQuotes(holdings, { updates, failures }, nowIso = new Date().toISOString()) {
  const byId = new Map(holdings.map(h => [h.id, h]))
  const seen = (id) => byId.get(id).seen ?? byId.get(id).price_updated_at ?? null
  return [
    ...updates.map(u => ({ id: u.id, seen: seen(u.id), current_price: u.price, price_updated_at: nowIso, price_source: 'auto', price_error: null })),
    ...failures.map(f => ({ id: f.id, seen: seen(f.id), price_error: f.error })),
  ]
}
