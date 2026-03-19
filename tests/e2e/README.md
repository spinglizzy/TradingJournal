# E2E Test Setup Guide

The tests use real Supabase auth — no mocks. You need one dedicated test
account in your Supabase project. This guide walks you through creating it
and running the suite for the first time.

---

## Prerequisites

- The app's `.env` file must exist and contain all four variables:
  ```
  VITE_SUPABASE_URL=...
  VITE_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  DATABASE_URL=...
  ```
- The dev server must be able to start (`npm run dev` should work).

---

## Step 1 — Create the test user (one time only)

Run the setup script. It uses your Service Role key to create a confirmed
user directly via the Supabase admin API, so no email confirmation flow is
needed:

```bash
node tests/e2e/setup-test-user.mjs
```

Expected output:
```
🔧  Setting up E2E test user: test@pulsejournal.com
✅  Test user created successfully.
    User ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
✅  Sign-in verified — credentials work.
```

If you see `✅  Test user already exists` that's fine — it just synced the
password and re-confirmed the email.

### Using a custom email / password

```bash
E2E_EMAIL="mytest@example.com" E2E_PASSWORD="mypassword99" \
  node tests/e2e/setup-test-user.mjs
```

---

## Step 2 — Verify email confirmation is not blocking sign-in

In some Supabase projects, email confirmation is enforced even when a user
is created via the admin API. To check:

1. Open **Supabase Dashboard → Authentication → Users**
2. Find `test@pulsejournal.com` — the **Confirmed** column should show a
   green tick.
3. If it shows a red X, click the user → **Send confirmation email** → or
   just toggle **Email Confirmations** off in
   **Authentication → Providers → Email** for your test project.

> For a test-only Supabase project it's simplest to turn email
> confirmation off entirely. For production projects, the admin API's
> `email_confirm: true` flag handles it automatically — the script already
> sets this.

---

## Step 3 — Run the tests

```bash
# Headless (CI-style)
npm run test:e2e

# Watch the browser
npm run test:e2e:headed

# Interactive UI mode (best for debugging failures)
npm run test:e2e:ui
```

The first run will auto-start `npm run dev` if the server isn't already
running and wait up to 60 seconds for it to be ready.

### Passing custom credentials at runtime

```bash
E2E_EMAIL="mytest@example.com" E2E_PASSWORD="mypassword99" npm run test:e2e
```

---

## Troubleshooting

### "Invalid login credentials" on the auth tests

The most common cause is the test user's email not being confirmed.
Re-run the setup script — it always sets `email_confirm: true`:

```bash
node tests/e2e/setup-test-user.mjs
```

### "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

The setup script reads your `.env` file automatically. Make sure both keys
exist in `.env` (not just in Vercel env vars):

```bash
grep -E "SUPABASE_URL|SERVICE_ROLE" .env
```

### Tests pass locally but fail on re-run (stale test data)

The `trades.spec.ts` and `tradelog.spec.ts` suites create trades with the
ticker `E2ETEST` / `E2ELOG` and delete them in `afterEach`. If a previous
run crashed mid-test and left orphaned trades, clean them up manually:

1. Open the app at `http://localhost:5173`
2. Log in as `test@pulsejournal.com`
3. Go to Trade Log → filter by ticker `E2ETEST` or `E2ELOG` → delete them

Or wipe all test account data from the Supabase SQL editor:

```sql
-- Replace 'xxxxxxxx-...' with the test user's UUID from the Users table
DELETE FROM trades WHERE user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
DELETE FROM journal_entries WHERE user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

### The webServer never becomes ready

The `playwright.config.ts` uses `reuseExistingServer: true`. If you already
have the dev server running this is fine. If not, Playwright starts it —
but `npm run dev` runs two processes concurrently (Express + Vite). If
Express hangs (e.g. bad `DATABASE_URL`), Vite still starts on 5173 but API
calls will fail.

Check both processes start cleanly:
```bash
npm run dev
```
Both `[SERVER]` and `[CLIENT]` lines should appear without errors before
running tests.

---

## Test account hygiene

- Never use a real trading account as the test user — the test suite
  creates and deletes real trades.
- The test user's data is isolated by Supabase RLS (`user_id = auth.uid()`)
  so it cannot touch any other user's data.
- It's safe to delete and re-create the test user at any time by re-running
  the setup script.
