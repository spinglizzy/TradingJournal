-- =============================================================================
-- Pulse Journal — Dragon migration 06: price fetch back-off. Additive, idempotent.
-- Apply through DATABASE_URL as one pool.query(wholeFile).
-- =============================================================================

-- When a refresh last TRIED this ticker (success or failure). price_updated_at
-- stays the time of the price itself; this one stops a failing ticker (unknown,
-- premium-only) costing a Finnhub call on every page load.
ALTER TABLE dragon_holdings ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ;
