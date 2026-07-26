-- =============================================================================
-- Pulse Journal — Pre-Entry Gate, revision 4
--
-- Follow-up to gate_migration_03.sql. Additive and idempotent.
-- Apply via DATABASE_URL as one pool.query(wholeFile) — NOT the Supabase SQL
-- editor, which reports "Success" while executing only the leading comment block.
--
-- One change: a seventh instant kill, "Objective Already Taken".
-- The draw on liquidity the setup is aiming at has already been run before the
-- entry — there is nothing left for price to go get, so the trade has no target.
-- Sits last in the kill list at sort_order 70; the existing six keep their order,
-- which matters because the verdict engine reports the FIRST kill in sort order.
--
-- Seeded as a SYSTEM row (user_id NULL), like the other six kills — the kill list
-- is not user-curated the way the contested list is, and DELETE /gate/factors/:id
-- only touches user rows, so it can't be pruned with the hover-×.
-- =============================================================================

INSERT INTO gate_factors (key, label, kind, required, level_based, hotkey, sort_order, user_id) VALUES
  ('objective_taken', 'Objective Already Taken', 'kill', false, false, '7', 70, NULL)
ON CONFLICT DO NOTHING;

-- Re-running is a no-op; this also aligns the row if an earlier hand-added one
-- exists with the same key under a different label or position.
UPDATE gate_factors
   SET label = 'Objective Already Taken', sort_order = 70, active = true
 WHERE kind = 'kill' AND key = 'objective_taken';

-- =============================================================================
-- VERIFY — read-only. Expect 7 kill rows, objective_taken last.
-- =============================================================================
-- SELECT key, label, sort_order, active FROM gate_factors
--   WHERE kind='kill' ORDER BY sort_order;
