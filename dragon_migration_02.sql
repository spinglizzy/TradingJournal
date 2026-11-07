-- =============================================================================
-- Pulse Journal — Dragon migration 02: cash rows, fees, tax, Schwab import
-- Additive and idempotent. Apply through DATABASE_URL as one pool.query(wholeFile).
-- =============================================================================

-- Account cash (MoneyLink / Journal) belongs to no holding.
ALTER TABLE dragon_transactions ALTER COLUMN holding_id DROP NOT NULL;

ALTER TABLE dragon_transactions DROP CONSTRAINT IF EXISTS dragon_transactions_type_check;
ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_type_check CHECK (type IN
  ('BUY','DIVIDEND','DRIP','SELL','CC_OPEN','CC_CLOSE','CC_ROLL','CC_EXPIRE','CASH_IN','CASH_OUT'));

ALTER TABLE dragon_transactions DROP CONSTRAINT IF EXISTS dragon_transactions_holding_check;
ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_holding_check
  CHECK ((holding_id IS NULL) = (type IN ('CASH_IN','CASH_OUT')));

-- Commission on the row. `amount` stays GROSS; the engine applies fees against you.
ALTER TABLE dragon_transactions ADD COLUMN IF NOT EXISTS fees DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE dragon_transactions DROP CONSTRAINT IF EXISTS dragon_transactions_fees_check;
ALTER TABLE dragon_transactions ADD CONSTRAINT dragon_transactions_fees_check CHECK (fees >= 0);

-- US tax withheld on a DIVIDEND (positive dollars). Reporting only — never in the basis.
ALTER TABLE dragon_transactions ADD COLUMN IF NOT EXISTS tax_withheld DOUBLE PRECISION;

-- Schwab CSV de-duplication: re-importing the full history adds nothing twice.
ALTER TABLE dragon_transactions ADD COLUMN IF NOT EXISTS import_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS dragon_transactions_import_hash_idx
  ON dragon_transactions (user_id, import_hash) WHERE import_hash IS NOT NULL;
