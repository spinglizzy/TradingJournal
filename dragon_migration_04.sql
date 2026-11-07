-- =============================================================================
-- Pulse Journal — Dragon migration 04: security hardening. Idempotent.
-- Apply through DATABASE_URL as one pool.query(wholeFile).
-- =============================================================================

-- ── No direct Supabase REST access ───────────────────────────────────────────
-- The browser only talks to the Express API (service connection, bypasses RLS).
-- Supabase's default grants let any signed-in user write these tables directly,
-- where RLS checks a row's own user_id but not what its foreign keys point at.
REVOKE ALL ON dragon_holdings, dragon_transactions, dragon_reconciliations,
              dragon_reconciliation_rows, dragon_fx_rates FROM anon, authenticated;

-- ── Links must stay inside one user's ledger ─────────────────────────────────
-- Composite keys: a transaction's holding and the row it refers to (ref_id)
-- must belong to the same user as the transaction itself.
DO $$ BEGIN
  ALTER TABLE dragon_holdings ADD CONSTRAINT dragon_holdings_id_user_key UNIQUE (id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_id_user_key UNIQUE (id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

ALTER TABLE dragon_transactions DROP CONSTRAINT IF EXISTS dragon_transactions_holding_id_fkey;
ALTER TABLE dragon_transactions DROP CONSTRAINT IF EXISTS dragon_transactions_ref_id_fkey;
DO $$ BEGIN
  ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_holding_user_fkey
    FOREIGN KEY (holding_id, user_id) REFERENCES dragon_holdings (id, user_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_ref_user_fkey
    FOREIGN KEY (ref_id, user_id) REFERENCES dragon_transactions (id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Per-user FX overrides ────────────────────────────────────────────────────
-- dragon_fx_rates is now RBA-only (written by the server's RBA fetch, never by
-- a user). A typed rate lives here and only changes that user's tax report.
CREATE TABLE IF NOT EXISTS dragon_fx_overrides (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,                      -- YYYY-MM-DD
  aud_usd    DOUBLE PRECISION NOT NULL CHECK (aud_usd > 0 AND aud_usd <= 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);
ALTER TABLE dragon_fx_overrides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "dragon_fx_overrides_all" ON dragon_fx_overrides FOR ALL
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON dragon_fx_overrides FROM anon, authenticated;
-- No shared manual rows existed when this ran (verified); drop the option for good.
DELETE FROM dragon_fx_rates WHERE source = 'manual';
ALTER TABLE dragon_fx_rates DROP CONSTRAINT IF EXISTS dragon_fx_rates_source_check;
ALTER TABLE dragon_fx_rates ADD CONSTRAINT dragon_fx_rates_source_check CHECK (source = 'rba');
