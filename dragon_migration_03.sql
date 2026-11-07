-- =============================================================================
-- Pulse Journal — Dragon migration 03: auto prices, ROC/reclass, saved
-- reconciliations, RBA FX cache. Additive and idempotent. Apply through
-- DATABASE_URL as one pool.query(wholeFile).
-- =============================================================================

-- ── Auto prices ──────────────────────────────────────────────────────────────
ALTER TABLE dragon_holdings ADD COLUMN IF NOT EXISTS price_source TEXT;
ALTER TABLE dragon_holdings DROP CONSTRAINT IF EXISTS dragon_holdings_price_source_check;
ALTER TABLE dragon_holdings ADD CONSTRAINT dragon_holdings_price_source_check CHECK (price_source IN ('auto','manual'));
-- Last fetch failure for this ticker, shown as a warning; the price itself is kept.
ALTER TABLE dragon_holdings ADD COLUMN IF NOT EXISTS price_error TEXT;
UPDATE dragon_holdings SET price_source = 'manual' WHERE current_price IS NOT NULL AND price_source IS NULL;

-- ── Return of capital + reclassification ─────────────────────────────────────
ALTER TABLE dragon_transactions DROP CONSTRAINT IF EXISTS dragon_transactions_type_check;
ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_type_check CHECK (type IN
  ('BUY','DIVIDEND','DRIP','SELL','CC_OPEN','CC_CLOSE','CC_ROLL','CC_EXPIRE','ROC','RECLASS','CASH_IN','CASH_OUT'));

-- ── Saved reconciliation checks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dragon_reconciliations (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source     TEXT NOT NULL CHECK (source IN ('manual','positions_csv'))
);
CREATE TABLE IF NOT EXISTS dragon_reconciliation_rows (
  id                  SERIAL PRIMARY KEY,
  reconciliation_id   INTEGER NOT NULL REFERENCES dragon_reconciliations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker              TEXT NOT NULL,
  ledger_shares       DOUBLE PRECISION NOT NULL,
  schwab_shares       DOUBLE PRECISION,
  ledger_schwab_basis DOUBLE PRECISION NOT NULL,
  schwab_basis        DOUBLE PRECISION,
  match               BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS dragon_reconciliations_user_idx ON dragon_reconciliations (user_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS dragon_reconciliation_rows_rec_idx ON dragon_reconciliation_rows (reconciliation_id);

ALTER TABLE dragon_reconciliations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dragon_reconciliation_rows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "dragon_reconciliations_all" ON dragon_reconciliations FOR ALL
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "dragon_reconciliation_rows_all" ON dragon_reconciliation_rows FOR ALL
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RBA AUD/USD cache (F11.1 daily, A$1 = USD x) ─────────────────────────────
-- Public reference data, shared by every user. Read by any signed-in user;
-- written only by the server (service connection), so no write policy.
CREATE TABLE IF NOT EXISTS dragon_fx_rates (
  date       TEXT PRIMARY KEY,                      -- YYYY-MM-DD
  aud_usd    DOUBLE PRECISION NOT NULL CHECK (aud_usd > 0),
  source     TEXT NOT NULL CHECK (source IN ('rba','manual')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE dragon_fx_rates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "dragon_fx_rates_read" ON dragon_fx_rates FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
