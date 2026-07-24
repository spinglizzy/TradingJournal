-- =============================================================================
-- Pulse Journal — Pre-Entry Gate, revision 3
--
-- Follow-up to gate_migration_02.sql. Additive and idempotent.
-- Apply via DATABASE_URL as one pool.query(wholeFile) — NOT the Supabase SQL
-- editor, which reports "Success" while executing only the leading comment block.
--
-- Two changes, both label/config only — no schema, no data model:
--   1. Title Case the instant-kill labels. Cosmetic: the kills are the row he
--      scans first and hardest, and mixed sentence case reads as prose rather
--      than a checklist. KEYS ARE UNTOUCHED, so every historical gate_checks.kills
--      entry keeps resolving.
--   2. Replace the contested tick-list default with his own eight factors.
--      The original seed pulled the top 12 values out of trades.pd_arrays, and
--      most of them were PD arrays and timeframes rather than reasons to stand
--      down — he had already pruned all 12 by hand and re-added two. This makes
--      the intended eight the default for every user, in his stated order.
-- =============================================================================

-- ── 1. Instant kill labels → Title Case ──────────────────────────────────────
-- Matched on `key`, so this also catches any per-user override row of the same
-- kind+key. Re-running is a no-op: the values are already what they will be set to.
UPDATE gate_factors SET label = 'Choppy Conditions'                  WHERE kind='kill' AND key='choppy';
UPDATE gate_factors SET label = 'HTF Key Level At Stop Loss'         WHERE kind='kill' AND key='htf_level_at_stop';
UPDATE gate_factors SET label = 'Equal Highs/Lows At Stop Loss'      WHERE kind='kill' AND key='eqh_eql_at_stop';
UPDATE gate_factors SET label = 'LRL At Stop Loss'                   WHERE kind='kill' AND key='lrl_at_stop';
UPDATE gate_factors SET label = 'Entry Not Aligned With Bias'        WHERE kind='kill' AND key='against_bias';
UPDATE gate_factors SET label = 'Breakeven Level Taken Before Entry' WHERE kind='kill' AND key='be_taken';

-- ── 2. Contested defaults ────────────────────────────────────────────────────
-- Seeded PER USER, not as system rows (user_id NULL), and that is deliberate:
-- DELETE /gate/factors/:id only removes user-owned rows, so a system default
-- could never be pruned with the hover-×. He asked to be able to chop and change
-- these, which means they have to be his.
--
-- Keys are the same slugify() the client and server use: lowercase, every run of
-- non-alphanumerics collapsed to '_', trimmed. '5m, ITH, ITL' → '5m_ith_itl'.
--
-- The eight are written inline in both statements rather than staged in a TEMP
-- table: this file is applied through the Supabase pooler, and an inline VALUES
-- list has no dependency on the two statements sharing a session.

-- Add the ones that aren't there yet. DO NOTHING means a factor he has already
-- created by hand keeps its own row (and its id, so nothing that references it
-- moves) — the UPDATE below then aligns its label and position.
INSERT INTO gate_factors (key, label, kind, required, level_based, sort_order, user_id)
SELECT d.key, d.label, 'contested', false, false, d.sort_order, u.id
FROM (VALUES
  ('5m_ith_itl',  '5m, ITH, ITL',  10),
  ('15m_ith_itl', '15m, ITH, ITL', 20),
  ('1hr_ith_itl', '1hr, ITH, ITL', 30),
  ('4hr_ith_itl', '4hr, ITH, ITL', 40),
  ('data_high',   'Data High',     50),
  ('data_low',    'Data Low',      60),
  ('pdh',         'PDH',           70),
  ('pdl',         'PDL',           80)
) AS d(key, label, sort_order)
CROSS JOIN auth.users u
ON CONFLICT DO NOTHING;

-- Put them in his stated order regardless of when each row was created. His two
-- hand-added rows landed at sort_order 100/110 via the API's MAX+10 rule; this
-- pulls them back to the front where he asked for them.
UPDATE gate_factors g
   SET label = d.label, sort_order = d.sort_order, active = true
  FROM (VALUES
    ('5m_ith_itl',  '5m, ITH, ITL',  10),
    ('15m_ith_itl', '15m, ITH, ITL', 20),
    ('1hr_ith_itl', '1hr, ITH, ITL', 30),
    ('4hr_ith_itl', '4hr, ITH, ITL', 40),
    ('data_high',   'Data High',     50),
    ('data_low',    'Data Low',      60),
    ('pdh',         'PDH',           70),
    ('pdl',         'PDL',           80)
  ) AS d(key, label, sort_order)
 WHERE g.kind = 'contested' AND g.key = d.key;

-- =============================================================================
-- VERIFY — read-only.
-- =============================================================================
-- SELECT key, label FROM gate_factors WHERE kind='kill' ORDER BY sort_order;
-- SELECT key, label, sort_order, count(*) FROM gate_factors
--   WHERE kind='contested' GROUP BY 1,2,3 ORDER BY sort_order;
