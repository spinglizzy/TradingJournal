-- =============================================================================
-- Pulse Journal — Dragon (long-term dividend portfolio) migration
-- Additive and idempotent. Apply through DATABASE_URL as one pool.query(wholeFile),
-- not the Supabase SQL editor (see CLAUDE.md).
--
-- The ledger is the only source of truth: no running totals are stored.
-- server/lib/dragonEngine.js derives shares, basis, P/L and income from it.
-- Dates are TEXT 'YYYY-MM-DD', same as the wheel tables.
-- =============================================================================

CREATE TABLE IF NOT EXISTS dragon_holdings (
  id               SERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           TEXT NOT NULL,
  name             TEXT,
  pays_dividend    BOOLEAN NOT NULL DEFAULT true,
  drip             BOOLEAN NOT NULL DEFAULT true,
  current_price    DOUBLE PRECISION,           -- entered by hand, no quote API
  price_updated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ticker)
);

CREATE TABLE IF NOT EXISTS dragon_transactions (
  id         SERIAL PRIMARY KEY,
  holding_id INTEGER NOT NULL REFERENCES dragon_holdings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('BUY','DIVIDEND','DRIP','SELL','CC_OPEN','CC_CLOSE','CC_ROLL','CC_EXPIRE')),
  shares     DOUBLE PRECISION,                 -- BUY / DRIP / SELL, up to 6 dp
  price      DOUBLE PRECISION,                 -- per share
  -- Cash figure. Positive for every type except CC_ROLL, which is the signed net
  -- (credit positive, debit negative). CC_EXPIRE is 0.
  amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes      TEXT,
  strike     DOUBLE PRECISION,                 -- CC_OPEN / CC_ROLL (new call)
  expiry     TEXT,                             -- CC_OPEN / CC_ROLL (new call)
  contracts  INTEGER,                          -- CC_OPEN / CC_ROLL (new call)
  premium    DOUBLE PRECISION,                 -- broker quote $/share; amount = premium × 100 × contracts
  -- The call this row ends: CC_CLOSE / CC_ROLL / CC_EXPIRE, or a called-away SELL.
  -- Default NO ACTION (checked at statement end) so a holding's cascade delete works.
  ref_id     INTEGER REFERENCES dragon_transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dragon_transactions_holding_idx ON dragon_transactions (holding_id, date, id);
CREATE INDEX IF NOT EXISTS dragon_transactions_user_idx    ON dragon_transactions (user_id);

ALTER TABLE dragon_holdings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dragon_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dragon_holdings_all" ON dragon_holdings FOR ALL
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "dragon_transactions_all" ON dragon_transactions FOR ALL
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
