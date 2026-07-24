-- =============================================================================
-- Pulse Journal — Pre-Entry Gate migration
--
-- Additive and idempotent: safe to run on an existing database, safe to re-run.
--
-- APPLY IT VIA DATABASE_URL, NOT THE SQL EDITOR. The wheel migration was
-- reported as "Success" by the Supabase SQL editor while creating zero objects
-- (a partial selection executes only the leading comment block). Run the whole
-- file as one query through the pg pool instead — that also keeps the DO $$ … $$
-- blocks intact and makes the file atomic.
--
-- Reconciliation notes vs. the build spec:
--   * The spec's gate_checks columns are all here. Three additions:
--       - session_date  — 'YYYY-MM-DD' in America/New_York. trades.date is TEXT
--                         in the same shape and trades carry no entry time, so
--                         this is the only thing that can scope "same session"
--                         when linking a trade back to a check.
--       - zone_label    — which premarket zone the setup was at, so the review
--                         view can show where the bad entries cluster.
--       - note          — non-scoring free text. Free-text CONTESTED factors are
--                         NOT stored here; they go straight into contested[] so
--                         they subtract 1 like any other contested factor.
--   * There is no `is_rulebreak` column on trades. A rulebreak is derived —
--     gate_checks.linked_trade_id IS NOT NULL AND verdict = 'NO_TRADE' — and
--     surfaced by a LEFT JOIN LATERAL in the trades list query. A denormalised
--     boolean would be a second source of truth that could drift from the link.
--   * Premarket levels/zones need no migration: they live in the existing
--     journal_entries.plan_data JSONB under a new `zones` key.
-- =============================================================================

-- ── gate_factors ─────────────────────────────────────────────────────────────
-- The kill list, the contested list and the confluence set. Config-driven so
-- both lists can grow without a deploy: INSERT a row and it appears in the gate.
--
-- user_id IS NULL  → system default, visible to every user.
-- user_id IS set   → that user's own factor (or an override — see the resolver
--                    in server/routes/gate.js, which lets a user row shadow a
--                    system row of the same kind+key).
CREATE TABLE IF NOT EXISTS gate_factors (
  id          SERIAL PRIMARY KEY,
  -- Stable slug. This is what gets stored in gate_checks.confluences/contested/kills,
  -- so renaming a label never orphans historical checks.
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('confluence','contested','kill')),
  -- Confluences only: a missing required confluence is verdict rule 2.
  required    BOOLEAN NOT NULL DEFAULT false,
  -- Kills only: knowable during premarket from the level alone, so selecting a
  -- premarket zone can pre-tick it. The three level kills are seeded true.
  level_based BOOLEAN NOT NULL DEFAULT false,
  -- Suggested keyboard key. NULL = the client auto-assigns from its pool.
  hotkey      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One row per kind+key, scoped: system rows unique on their own, user rows
-- unique per user. Two partial indexes because NULL never equals NULL in a
-- plain unique index, which would let system duplicates through.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_factors_system_key
  ON gate_factors(kind, key) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_factors_user_key
  ON gate_factors(user_id, kind, key) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gate_factors_user ON gate_factors(user_id);

-- ── gate_checks ──────────────────────────────────────────────────────────────
-- One row per gate run. Every check is saved, taken or not.
CREATE TABLE IF NOT EXISTS gate_checks (
  id              SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Precise to the second — this is what finds the bar in replay after the session.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  instrument      TEXT NOT NULL DEFAULT 'NQ',
  -- NY trading date. Set server-side from created_at, never from the browser clock.
  session_date    TEXT NOT NULL,
  confluences     TEXT[] NOT NULL DEFAULT '{}',
  contested       TEXT[] NOT NULL DEFAULT '{}',
  kills           TEXT[] NOT NULL DEFAULT '{}',
  net_score       INTEGER NOT NULL DEFAULT 0,
  grade           TEXT CHECK (grade IS NULL OR grade IN ('A+','A')),
  verdict         TEXT NOT NULL CHECK (verdict IN ('ENTER','NO_TRADE')),
  reason          TEXT NOT NULL DEFAULT '',
  -- Premarket zone the setup was at, if one was picked. Label not FK: zones live
  -- in journal_entries.plan_data JSONB and get edited freely.
  zone_label      TEXT,
  note            TEXT,
  linked_trade_id INTEGER REFERENCES trades(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gate_checks_user         ON gate_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_gate_checks_session_date ON gate_checks(session_date);
CREATE INDEX IF NOT EXISTS idx_gate_checks_created      ON gate_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_checks_verdict      ON gate_checks(verdict);
CREATE INDEX IF NOT EXISTS idx_gate_checks_kills        ON gate_checks USING GIN(kills);
-- Makes the LEFT JOIN LATERAL on the trades list an index lookup.
CREATE INDEX IF NOT EXISTS idx_gate_checks_linked_trade ON gate_checks(linked_trade_id);

-- A trade links to at most one gate check. Without this a re-link could leave
-- two checks pointing at the same trade and the rulebreak flag would be a
-- coin toss between them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_checks_one_per_trade
  ON gate_checks(linked_trade_id) WHERE linked_trade_id IS NOT NULL;

-- ── Row level security ───────────────────────────────────────────────────────
ALTER TABLE gate_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_checks  ENABLE ROW LEVEL SECURITY;

-- Factors: everyone reads the system defaults; you only write your own.
DO $$ BEGIN
  CREATE POLICY "gate_factors_select" ON gate_factors FOR SELECT
    USING (user_id IS NULL OR user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "gate_factors_insert" ON gate_factors FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "gate_factors_update" ON gate_factors FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "gate_factors_delete" ON gate_factors FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "gate_checks_select" ON gate_checks FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "gate_checks_insert" ON gate_checks FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "gate_checks_update" ON gate_checks FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "gate_checks_delete" ON gate_checks FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- SEED — system default factors
-- ON CONFLICT DO NOTHING so re-running never clobbers an edited label.
-- =============================================================================

-- The three confluences. Ceiling is +3; CISD and the 1hr key level tap are required.
INSERT INTO gate_factors (key, label, kind, required, level_based, hotkey, sort_order, user_id) VALUES
  ('cisd',      'CISD',                 'confluence', true,  false, 'q', 10, NULL),
  ('key_level', 'Key level tap (1hr)',  'confluence', true,  false, 'w', 20, NULL),
  ('resweep',   'Resweep',              'confluence', false, false, 'e', 30, NULL)
ON CONFLICT DO NOTHING;

-- The instant kills. Any one of these vetoes the setup regardless of score.
-- level_based = true means a premarket zone can pre-tick it.
INSERT INTO gate_factors (key, label, kind, required, level_based, hotkey, sort_order, user_id) VALUES
  ('choppy',            'Choppy conditions',                'kill', false, false, '1', 10, NULL),
  ('htf_level_at_stop', 'HTF key level at stop loss',       'kill', false, true,  '2', 20, NULL),
  ('eqh_eql_at_stop',   'Equal highs/lows at stop loss',    'kill', false, true,  '3', 30, NULL),
  ('lrl_at_stop',       'LRL at stop loss',                 'kill', false, true,  '4', 40, NULL),
  ('against_bias',      'Entry not aligned with bias',      'kill', false, false, '5', 50, NULL),
  ('be_taken',          'Breakeven level taken before entry','kill', false, false, '6', 60, NULL)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SEED — contested factors, per user, from that user's own history
--
-- The trade form's "Contested Factors" field writes to trades.pd_arrays. Rather
-- than inventing a parallel vocabulary, seed each user's tick-list from the
-- contested factors they have actually logged. Top 12 by frequency — a longer
-- list is slower to scan than the free-text escape hatch it would replace.
--
-- Users with no history get an empty tick-list and grow it from free text; the
-- gate adds any new free-text contested factor to this table automatically.
-- =============================================================================
INSERT INTO gate_factors (key, label, kind, required, level_based, sort_order, user_id)
SELECT
  ranked.key,
  ranked.label,
  'contested',
  false,
  false,
  ranked.rn * 10,
  ranked.user_id
FROM (
  SELECT
    t.user_id,
    -- Slug: lowercase, non-alphanumerics collapsed to underscores.
    trim(both '_' from regexp_replace(lower(f.factor), '[^a-z0-9]+', '_', 'g')) AS key,
    f.factor AS label,
    ROW_NUMBER() OVER (PARTITION BY t.user_id ORDER BY COUNT(*) DESC, f.factor ASC) AS rn
  FROM trades t
  CROSS JOIN LATERAL unnest(t.pd_arrays) AS f(factor)
  WHERE t.pd_arrays IS NOT NULL
    AND t.user_id IS NOT NULL
    AND trim(f.factor) <> ''
  GROUP BY t.user_id, f.factor
) ranked
WHERE ranked.rn <= 12
  AND ranked.key <> ''
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFY — read-only. Run this after applying and check the counts.
-- Expect: gate_checks + gate_factors present, 3 confluences, 6 kills,
-- and 1 row per distinct historical contested factor per user (up to 12).
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN ('gate_checks','gate_factors');
-- SELECT kind, user_id IS NULL AS system_default, COUNT(*)
--   FROM gate_factors GROUP BY 1,2 ORDER BY 1,2;
