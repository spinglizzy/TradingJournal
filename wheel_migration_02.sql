-- =============================================================================
-- Pulse Journal — Wheel Tracker migration 02: partial share sales that reduce
-- the effective cost basis.
-- Run the entire contents of this file in the Supabase SQL Editor.
-- Additive and idempotent: safe to run on an existing database, safe to re-run.
--
-- Why a column and not a derived value:
--   `net_premium` is a CACHED DERIVED field — recomputeCycle() rebuilds it from
--   the legs on every mutation as `sum(leg premium) - premium_attributed`. A
--   partial sale booked "basis reducing" adds the gain on the departed shares to
--   that running premium, and that gain is an EVENT, not derivable from the legs.
--   Without somewhere to record it, the next recompute would silently wipe the
--   basis reduction and the break-even line would jump back up.
--
--   Kept separate from `premium_attributed` (which only ever grows as premium
--   LEAVES the cycle) so the two accumulators stay individually auditable:
--
--     net_premium = sum(legNetPremium) - premium_attributed + retained_share_gain
-- =============================================================================

ALTER TABLE wheel_cycles
  ADD COLUMN IF NOT EXISTS retained_share_gain DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMENT ON COLUMN wheel_cycles.retained_share_gain IS
  'Accumulator: gain on partially-sold shares that was kept in the position to '
  'lower the effective basis of the remaining shares instead of booking to '
  'realized_pnl. Books in full when the cycle goes flat.';

-- ── Verification ─────────────────────────────────────────────────────────────
-- The SQL editor reporting "Success" is not evidence the column exists. Run this
-- and confirm it returns exactly one row before trusting the migration.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'wheel_cycles' AND column_name = 'retained_share_gain';
