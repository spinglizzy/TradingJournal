# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev           # Run both Express server (port 3001) + Vite client (port 5173) concurrently
npm run dev:server    # Backend only
npm run dev:client    # Frontend only
npm run build         # Production Vite build
npm run seed          # Load sample trade data into the database
npm run test:wheel    # Wheel basis engine + strike calculator unit tests (no DB)
npm run test:gate     # Pre-Entry Gate verdict engine unit tests (no DB)
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
- Main dashboard P&L counts **option premium only**; the share gain/loss on assignment→call-away is booked to the cycle and reported in the Wheel history.
- A wheel leg is counted **once** in dashboard/analytics P&L, via its `trades.pnl`. The one double-count risk is `POST /wheel/cycles` ("Add assigned shares"), which back-fills a put that predates the tab and may already exist in the Trade Log — pass `already_logged: true` and the leg is stored with `pnl = NULL`. Every stats query either `SUM(pnl)` (skips NULL) or filters `pnl IS NOT NULL`, so it drops out of dashboard totals while `premium` still feeds the basis engine and the Wheel tab's own totals.
- Premium/cost fields in the wheel **entry** forms are labelled `$ / contract` and take the broker's quote (0.30 → $30 per contract). `StrikeCalculator` deliberately keeps `$ / share` — the same number, but every figure it computes (weekly-equivalent floor, value at expiry, the chart) is per-share.

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
- `gate_migration.sql` adds `gate_checks` + `gate_factors`; `gate_migration_02.sql` adds `took_trade` and renames a confluence label; `gate_migration_03.sql` Title Cases the kill labels and reseeds the contested defaults. All additive and idempotent. Apply them through `DATABASE_URL` as one `pool.query(wholeFile)`, **not** the Supabase SQL editor, which reports "Success" while executing only the leading comment block
- The backend connects via `pg` pool using `DATABASE_URL` from `.env`
- P&L calculation logic is centralised in `server/db.js` → `calcPnl(direction, entryPrice, exitPrice, positionSize, fees, stopLoss)` — returns `{ pnl, pnlPct, rMultiple }`
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
