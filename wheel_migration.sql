-- =============================================================================
-- Pulse Journal — Wheel Tracker migration
-- Run the entire contents of this file in the Supabase SQL Editor.
-- Additive and idempotent: safe to run on an existing database, safe to re-run.
--
-- Reconciliation note vs. the build spec:
--   * The spec's "trade log table" is `trades`.
--   * `trades` already has `strategy_id` (FK -> strategies). To avoid colliding
--     with that, the wheel tag column is named `strategy_tag` (text, 'wheel').
--   * Dates in this codebase are stored as TEXT 'YYYY-MM-DD', not DATE. `expiry`
--     and `assigned_at` follow that convention so pg never hands back a JS Date
--     that shifts across timezones.
--   * The spec models a roll as "a negative close + a positive open". Rather than
--     inserting a synthetic negative-premium row, the buy-to-close debit is stored
--     on the leg being closed as `close_cost` (a positive dollar cost). A leg's
--     realised premium is therefore `premium - close_cost`, and a cycle's
--     net_premium is the sum of that across its legs. Same arithmetic, but the
--     original credit stays visible for audit instead of being netted away.
-- =============================================================================

-- ── wheel_cycles ─────────────────────────────────────────────────────────────
-- One row per wheel cycle: a run on a ticker from the first CSP-while-flat
-- until flat again (0 shares, no open legs).
CREATE TABLE IF NOT EXISTS wheel_cycles (
  id                  SERIAL PRIMARY KEY,
  ticker              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_at           TEXT NOT NULL,
  closed_at           TEXT,
  -- shares / avg_assigned_strike / net_premium are CACHED DERIVED values. They are
  -- recomputed from share_lots + legs + the two accumulators below on every
  -- mutation, so editing or deleting a leg can never leave them drifting.
  shares              INTEGER NOT NULL DEFAULT 0,
  avg_assigned_strike DOUBLE PRECISION,
  -- Running premium for the cycle: credits minus debits, minus any premium
  -- already attributed to shares that have left. See server/lib/wheelEngine.js.
  net_premium         DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Accumulators (not derivable — they record events, not state).
  shares_exited       INTEGER NOT NULL DEFAULT 0,
  premium_attributed  DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Accumulator: P&L booked as shares leave. Final value = the cycle's lifetime P&L.
  realized_pnl        DOUBLE PRECISION NOT NULL DEFAULT 0,
  close_reason        TEXT CHECK (close_reason IN ('called_away','sold')),
  exit_price          DOUBLE PRECISION,
  notes               TEXT,
  account_id          INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── share_lots ───────────────────────────────────────────────────────────────
-- Explicit assignment lots so multiple assignments average correctly and
-- partial call-aways stay auditable.
CREATE TABLE IF NOT EXISTS share_lots (
  id              SERIAL PRIMARY KEY,
  wheel_cycle_id  INTEGER NOT NULL REFERENCES wheel_cycles(id) ON DELETE CASCADE,
  ticker          TEXT NOT NULL,
  shares          INTEGER NOT NULL,
  assigned_strike DOUBLE PRECISION NOT NULL,
  assigned_at     TEXT NOT NULL,
  trade_id        INTEGER REFERENCES trades(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Upgrade path for a wheel_cycles table created before the accumulators existed.
ALTER TABLE wheel_cycles ADD COLUMN IF NOT EXISTS shares_exited      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wheel_cycles ADD COLUMN IF NOT EXISTS premium_attributed DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ── trades: option + wheel columns ───────────────────────────────────────────
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_tag    TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS instrument_type TEXT NOT NULL DEFAULT 'stock';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS option_type     TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strike          DOUBLE PRECISION;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS expiry          TEXT;
-- premium: TOTAL cash for the leg in dollars. Credit (sell to open) = positive.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS premium         DOUBLE PRECISION;
-- close_cost: TOTAL dollars paid to buy the leg back (roll or plain close). Positive.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS close_cost      DOUBLE PRECISION;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS contracts       INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS leg_status      TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS wheel_cycle_id  INTEGER REFERENCES wheel_cycles(id) ON DELETE SET NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rolled_from_id  INTEGER REFERENCES trades(id) ON DELETE SET NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS needs_roll      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strike_selection_snapshot JSONB;

-- Constraints added separately so re-running the file doesn't error on duplicates.
DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT trades_instrument_type_chk
    CHECK (instrument_type IN ('stock','option'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT trades_option_type_chk
    CHECK (option_type IS NULL OR option_type IN ('put','call'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT trades_leg_status_chk
    CHECK (leg_status IS NULL OR leg_status IN ('open','expired','assigned','called_away','rolled','closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_strategy_tag ON trades(strategy_tag);
CREATE INDEX IF NOT EXISTS idx_trades_wheel_cycle  ON trades(wheel_cycle_id);
CREATE INDEX IF NOT EXISTS idx_trades_expiry       ON trades(expiry) WHERE expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wheel_cycles_user   ON wheel_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_wheel_cycles_status ON wheel_cycles(status);
CREATE INDEX IF NOT EXISTS idx_share_lots_cycle    ON share_lots(wheel_cycle_id);

-- Cycle boundary integrity: at most one ACTIVE cycle per ticker per user.
-- This is what stops a new run from folding an old run's realised premium into
-- its basis (spec §13, "Cycle boundaries").
CREATE UNIQUE INDEX IF NOT EXISTS idx_wheel_cycles_one_active
  ON wheel_cycles(user_id, ticker) WHERE status = 'active';

-- ── Row level security ───────────────────────────────────────────────────────
ALTER TABLE wheel_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_lots   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "wheel_cycles_select" ON wheel_cycles FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "wheel_cycles_insert" ON wheel_cycles FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "wheel_cycles_update" ON wheel_cycles FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "wheel_cycles_delete" ON wheel_cycles FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "share_lots_select" ON share_lots FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "share_lots_insert" ON share_lots FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "share_lots_delete" ON share_lots FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
