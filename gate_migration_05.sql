-- =============================================================================
-- Pulse Journal — Pre-Entry Gate, revision 5
--
-- Follow-up to gate_migration_04.sql. Additive and idempotent.
-- Apply via DATABASE_URL as one pool.query(wholeFile) — NOT the Supabase SQL
-- editor, which reports "Success" while executing only the leading comment block.
--
-- One change: an eighth instant kill, "RR Less than 1".
-- The stop is wider than the distance to the objective, so even a setup that
-- works pays less than it risks. That is a reason to stand down regardless of
-- how clean the read is, which is what makes it a kill rather than a contested
-- factor — a contested tick can be outvoted by confluences, this cannot.
-- Sits last in the kill list at sort_order 80; the existing seven keep their
-- order, which matters because the verdict engine reports the FIRST kill in
-- sort order.
--
-- Seeded as a SYSTEM row (user_id NULL), like the other seven kills — the kill
-- list is not user-curated the way the contested list is, and
-- DELETE /gate/factors/:id only touches user rows, so it can't be pruned with
-- the hover-×.
-- =============================================================================

INSERT INTO gate_factors (key, label, kind, required, level_based, hotkey, sort_order, user_id) VALUES
  ('rr_below_1', 'RR Less than 1', 'kill', false, false, '8', 80, NULL)
ON CONFLICT DO NOTHING;

-- Re-running is a no-op; this also aligns the row if an earlier hand-added one
-- exists with the same key under a different label or position.
UPDATE gate_factors
   SET label = 'RR Less than 1', sort_order = 80, active = true
 WHERE kind = 'kill' AND key = 'rr_below_1';

-- =============================================================================
-- VERIFY — read-only. Expect 8 kill rows, rr_below_1 last.
-- =============================================================================
-- SELECT key, label, sort_order, active FROM gate_factors
--   WHERE kind='kill' ORDER BY sort_order;
