# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev           # Run both Express server (port 3001) + Vite client (port 5173) concurrently
npm run dev:server    # Backend only
npm run dev:client    # Frontend only
npm run build         # Production Vite build
npm run seed          # Load sample trade data into the database
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

### Database
- Schema lives in `supabase_migration.sql` — run this in the Supabase SQL editor to set up or reset tables
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
