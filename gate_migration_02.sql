-- =============================================================================
-- Pulse Journal — Pre-Entry Gate, revision 2
--
-- Follow-up to gate_migration.sql after first use. Additive and idempotent.
-- Apply via DATABASE_URL as one pool.query(wholeFile) — NOT the Supabase SQL
-- editor, which reports "Success" while executing only the leading comments.
--
-- Three changes:
--   1. took_trade — the gate no longer auto-saves. A scenario is written only
--      when "Log scenario" is pressed, and the button records whether the trade
--      was taken. NULL means logged without saying either way.
--   2. Rename the second confluence's label. The KEY stays `key_level`, so every
--      historical check that references it keeps resolving — that separation is
--      exactly why keys are slugs and labels are free text.
--   3. Retire the zone columns. The Levels & Zones section was removed, so
--      nothing writes them any more. They are left in place rather than dropped:
--      dropping is irreversible and they cost nothing empty.
-- =============================================================================

-- ── 1. Did he take it? ───────────────────────────────────────────────────────
ALTER TABLE gate_checks ADD COLUMN IF NOT EXISTS took_trade BOOLEAN;

COMMENT ON COLUMN gate_checks.took_trade IS
  'true = logged as taken, false = logged as passed, NULL = not stated. Independent of verdict; taking a NO_TRADE is the rulebreak signal.';

-- ── 2. Confluence label change ───────────────────────────────────────────────
-- Applies to the system default and to any per-user override of the same key.
UPDATE gate_factors
   SET label = 'Key PD Array Manipulated'
 WHERE kind = 'confluence' AND key = 'key_level';

-- ── 3. Zone columns are dead but retained ────────────────────────────────────
COMMENT ON COLUMN gate_checks.zone_label IS
  'DEAD as of gate_migration_02 — the Levels & Zones section was removed. Retained, not dropped, in case zones come back.';

-- =============================================================================
-- VERIFY — read-only.
-- =============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='gate_checks' AND column_name='took_trade';
-- SELECT key, label FROM gate_factors WHERE kind='confluence' ORDER BY sort_order;
