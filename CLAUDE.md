# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev           # Run both Express server (port 3001) + Vite client (port 5173) concurrently
npm run dev:server    # Backend only
npm run dev:client    # Frontend only
npm run build         # Production Vite build
npm run seed          # Load sample trade data into the database
npm test               # All four unit suites below (no DB)
npm run test:dragon    # Dragon cost-basis engine unit tests (no DB)
npm run test:wheel     # Wheel basis engine + strike calculator unit tests (no DB)
npm run test:lifecycle # Drives the real wheel router against an in-memory pg shim (no DB)
npm run test:gate      # Pre-Entry Gate verdict engine unit tests (no DB)
npm run test:stats     # Win/loss + win-rate definitions, and the anti-drift grep over server/routes (no DB)
```

The Vite dev server proxies `/api/*` and `/uploads/*` to `http://localhost:3001`.

## Architecture Overview

**Full-stack app:** React (Vite, port 5173) + Express (port 3001) + Supabase PostgreSQL.

### Auth Flow
1. Users sign up/in via Supabase Auth (browser-side `src/lib/supabase.js`)
2. Supabase stores the JWT session in `localStorage` — this is how sessions persist across page loads
3. Every API call in `src/api/client.js` fetches the current token via `supabase.auth.getSession()` and sends it as `Authorization: Bearer <token>`
4. The Express middleware `server/middleware/auth.js` validates the token using the Supabase **service role key** and attaches `req.userId` to every request
5. All DB queries filter by `req.userId` — there is no cross-user data access

### Wheel tracker (`/wheel`)
- Wheel option legs live in the **same `trades` table** as every other trade, tagged `strategy_tag = 'wheel'`. There is no separate leg table — the tag is the only boundary, so futures/ICT trades never appear in the Wheel tab.
- `wheel_cycles` holds one row per run on a ticker (first CSP while flat → flat again). `share_lots` records assignments.
- `server/lib/wheelEngine.js` is the pure basis engine: `B = avg_assigned_strike − net_premium / shares`. `src/lib/strikeCalc.js` is the pure strike-comparison math and **consumes** `B` — it never recomputes basis.
- Cycle fields (`shares`, `avg_assigned_strike`, `net_premium`) are **cached derived values**, recomputed by `recomputeCycle()` on every mutation from lots + legs + the `shares_exited` / `premium_attributed` accumulators.
- `premium` is the TOTAL dollars for a leg (credit positive); `close_cost` is the buy-to-close debit. A leg's realised premium is `premium − close_cost − fees`.
- Wheel legs are rejected by the generic `PUT`/`DELETE /api/trades/:id` handlers (409) — editing them there would recompute `pnl` with `calcPnl` and leave the basis wrong.
- **The two endings are not symmetric, and `isCycleFlat` is where that lives.** A put expiring (or being bought back) while flat ENDS the run and books it — "log the win and move on". A call expiring while shares are held does NOT: the basis just drops, and the trade isn't over until the shares go. `wheel-lifecycle-tests.mjs` drives both paths through the real router.
- **The wheel RUN is the trade, and it books once — when the cycle goes flat.** No leg ever carries `pnl`; a closed cycle gets ONE summary row in `trades` (told apart by `leg_status IS NULL`) holding every leg's premium net of commissions **plus** the share gain/loss, dated `closed_at`. `syncCycleSummary` writes, refreshes and deletes that row; `recomputeCycle` drives it on every event. That single figure is what the dashboard, the equity curve and the win rate see.
- **A separate ticker is a separate play; multiple legs on one ticker are one trade.** That is Sam's rule and it is what `wheel_cycles` is keyed on, so the CYCLE is the unit of counting as well as of P&L. Counting queries use `COUNTS_AS_TRADE` (which excludes every leg, open or closed) and add the still-running plays back with `activeCycleCount()` — both in `server/lib/tradeStats.js`. Counting open *rows* instead is wrong in both directions: it would count a run once per live contract, and count zero for a run holding assigned shares between covered calls, which has no open row at all.
- `BOOKED` (drops closed rows with no P&L) is still the right predicate for P&L **sums**; `COUNTS_AS_TRADE` is the one for **counts**.
- `already_logged` (`trades.premium_already_logged`, `wheel_migration_03.sql`) marks a put reconstructed from before the Wheel tab existed whose premium already sits on its own Trade Log row. `cycleJournalPnl` subtracts those legs so the credit is not booked twice; the basis engine still sees the premium.
- Premium/cost fields in the wheel **entry** forms are labelled `$ / contract` and take the broker's quote (0.30 → $30 per contract). `StrikeCalculator` deliberately keeps `$ / share` — the same number, but every figure it computes (weekly-equivalent floor, value at expiry, the chart) is per-share.

### Dragon (`/dragon`) — long-term dividend portfolio
- `dragon_holdings` + `dragon_transactions` (`dragon_migration.sql`). The ledger is the only truth: **no running totals are stored**. `server/lib/dragonEngine.js` `replay()` derives shares, average adjusted basis, realised P/L, dividends, net CC premium, open calls and the basis timeline; client and server both import it (same split as `gateVerdict.js`).
- Basis = BUY + DRIP − DIVIDEND − net CC premium − cost removed by SELLs, ÷ shares. A SELL removes shares at the current average basis. Basis may go ≤ 0 (paid off).
- `amount` is the cash figure, positive except CC_ROLL (signed net). The server derives it from shares × price / quote × 100 × contracts. `ref_id` names the call a CC_CLOSE / CC_ROLL / CC_EXPIRE / called-away SELL ends.
- Every write replays the holding's whole ledger with the change applied before committing, so edits and deletes can't leave an oversell, uncovered calls or a dangling close. `dragon-tests.mjs` holds the spec's worked example.
- **Fees (`dragon_migration_02.sql`):** `amount` is GROSS and `fees` sits beside it; the engine applies fees against you (added to BUY / CC_CLOSE, taken off SELL / CC_OPEN / CC_ROLL). Never fold a fee into `amount`. `tax_withheld` on a DIVIDEND is reporting-only — the basis uses the net `amount`.
- **Schwab import** (`server/lib/schwabImport.js`, `POST /api/dragon/import`): Schwab's Amount is NET of Fees & Comm, so gross is worked back from it (buy gross = |Amount| − fees) and the fee lands once. Dividend + NRA Tax Adj lines on one date+symbol become ONE dividend. Option closes link to their open call by strike+expiry+contracts or go to review — never guessed. `import_hash` (unique per user) makes re-importing full history a no-op. Preview and commit run the same `runImport` inside a transaction; preview rolls back. `CASH_IN`/`CASH_OUT` rows have no holding and never touch basis.
- `schwab-import-tests.mjs` reads Sam's real export from `test-fixtures/` (gitignored — personal account data) and skips that section if it's missing.

### Pre-Entry Gate (a widget in the premarket plan)
- A pre-trade check for NQ/ICT discretionary entries. It renders **only** as a section inside `PremarketPlanEditor` — the plan is what's open on screen through the session. There is no overlay and no keyboard shortcut; both existed and were removed as unnecessary. `GateContext` prefetches the factor config on app load so the gate never waits on I/O.
- `server/lib/gateVerdict.js` is the pure verdict engine and is imported by **both** the client and `server/routes/gate.js`. The client needs it for a same-frame verdict; the server re-derives on every write so a stale or tampered client can't persist a verdict the rules don't produce. Do not fork it into a second copy.
- Verdict rules are strictly ordered and the **first** failing one is reported: kill → missing required confluence → more than 2 contested → net score < 2 → A+ → A. `net_score = confluences − contested`. `gate-tests.mjs` asserts the ordering, not just the outcomes — a kill on an otherwise perfect setup must name the kill.
- **Ticking saves nothing.** A row is written only when "Log — took it" / "Log — passed" is pressed. Auto-save existed first and was removed: it filled the day's log with every stray click. `took_trade` records what he did, which is deliberately independent of the verdict.
- The kill and contested lists are **config-driven** in the `gate_factors` table, not hardcoded in components. `src/lib/gateFactors.js` holds a fallback mirror of the seed used only when `/gate/factors` fails — never a second source of truth.
- **Keys are slugs, labels are free text.** `gate_checks` stores keys, so renaming a label (as `gate_migration_02.sql` does for `key_level`) never orphans a historical check. Resolve keys for display with `labelFor()`.
- **The contested tick-list is his to curate, so every contested row is user-owned** (`gate_factors.user_id` set), never a system default — `DELETE /gate/factors/:id` only touches user rows, so a system contested row could never be pruned with the hover-×. `gate_migration_03.sql` seeds the eight defaults per user. The original seed took each user's top 12 `trades.pd_arrays` values and was mostly PD arrays and timeframes rather than reasons to stand down; it was pruned by hand and replaced.
- **Saving a contested factor does not tick it.** The input's Save button writes to `gate_factors` only — curating the list is a separate job from assessing a setup, and the old type-and-Enter behaviour meant adding six factors before the open dragged the score to −6. There is no auto-save on blur. This is the only write in the gate outside the two log buttons, and it touches config, not the day's log.
- **A rulebreak is derived, never stored:** `verdict = 'NO_TRADE'` plus either `took_trade` (self-reported in the gate) or `linked_trade_id` (an actual trade attached). The review view reports both, and they can legitimately differ. `gateInfoFor()` in `server/routes/trades.js` attaches `is_rulebreak` as a separate query rather than a join, so the trade queries stay unchanged and a database without `gate_migration.sql` degrades to "no gate info" instead of breaking the trade log.
- "Same session" for linking a trade to a check = the same **NY calendar day**. `gate_checks.session_date` is set server-side in `America/New_York` to line up with `trades.date`; trades carry no entry time, so the day is as fine-grained as the data allows.
- The gate is **advisory**. It never blocks a save and never demands override text.
- `gate_checks.zone_label` is dead — a Levels & Zones section fed it and was removed. Retained, not dropped.

### Database
- Schema lives in `supabase_migration.sql` — run this in the Supabase SQL editor to set up or reset tables
- `wheel_migration.sql` adds the wheel tracker tables and columns — additive and idempotent, run it in the same editor
- `gate_migration.sql` adds `gate_checks` + `gate_factors`; `gate_migration_02.sql` adds `took_trade` and renames a confluence label; `gate_migration_03.sql` Title Cases the kill labels and reseeds the contested defaults; `gate_migration_04.sql` adds the `objective_taken` kill; `gate_migration_05.sql` adds the `rr_below_1` kill. All additive and idempotent. Apply them through `DATABASE_URL` as one `pool.query(wholeFile)`, **not** the Supabase SQL editor, which reports "Success" while executing only the leading comment block
- The backend connects via `pg` pool using `DATABASE_URL` from `.env`
- P&L calculation logic is centralised in `server/db.js` → `calcPnl(direction, entryPrice, exitPrice, positionSize, fees, stopLoss)` — returns `{ pnl, pnlPct, rMultiple }`
- **What counts as a trade, and what counts as a win, is centralised in `server/lib/tradeStats.js`.** Every route that splits trades into wins and losses imports `BOOKED`, `IS_WIN`/`IS_LOSS`, `COUNT_WINS`/`COUNT_LOSSES`, `GROSS_PROFIT`/`GROSS_LOSS`, `winRate()`, `profitFactor()`. The rules: a scratch is a **breakeven, not a loss** (`< 0`, never `<= 0`); the verdict is taken on `pnl + fees` (before commissions) while the sums stay net; win rate divides by decisive trades, not `COUNT(*)`. `stats-tests.mjs` unit-tests these *and* greps `server/routes/` for inline re-spellings — it fails the build if a route starts classifying on its own. This is not stylistic: the Dashboard and the Playbook once reported 67.6% and 57.5% for the same 80 trades because they spelled "loss" differently.
- All tables have RLS policies enforcing `user_id = auth.uid()`

### Frontend State
- `AuthContext` — Supabase auth state; `useAuth()` provides `{ user, loading, login, register, logout }`
- `AccountContext` — currently selected trading account (used to filter all data)
- `DashboardContext` — date range filter merged into API query params
- `ThemeContext` — light/dark theme

### API Layer
All frontend→backend calls go through `src/api/client.js` (the `api` object). Each domain has its own module in `src/api/` (e.g. `trades.js`, `stats.js`) that calls `api.get/post/put/delete`. On a 401 the client auto-signs out and redirects to `/login`.

### Routing & Layout
- Public routes: `/`, `/login`, `/signup` — redirect to `/dashboard` if already logged in
- All app routes are children of `ProtectedRoute` → `Layout`
- `Layout.jsx` renders `TopNav`, handles keyboard shortcuts, and shows the `OnboardingModal` on first visit

### Deployment
- Hosted on Vercel; `vercel.json` rewrites `/api/*` to a serverless function at `api/index.js` and everything else to `index.html` for client-side routing
- Commit + push to `master` triggers an automatic Vercel deploy

## Environment Variables

```
VITE_SUPABASE_URL          # Supabase project URL (frontend)
VITE_SUPABASE_ANON_KEY     # Supabase anon/public key (frontend)
SUPABASE_SERVICE_ROLE_KEY  # Supabase service role key (backend only — never expose to client)
DATABASE_URL               # PostgreSQL connection string (Supabase pooler)
PORT                       # Express port, defaults to 3001
```

See `.env.example` for the full template.
