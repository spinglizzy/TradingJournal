-- ─────────────────────────────────────────────────────────────────────────────
-- Wheel migration 03 — "this leg's premium is booked on another row"
--
-- A wheel cycle now books ONE P&L figure, on a summary row written when the run
-- goes flat (see cycleJournalPnl in server/lib/wheelEngine.js). That figure is
-- the cycle's realised P&L, which includes every leg's premium — including the
-- premium on a put reconstructed with `already_logged`, whose credit is already
-- sitting on its own row in the Trade Log from before the Wheel tab existed.
--
-- That flag used to be recorded implicitly, as `pnl IS NULL` on a closed leg.
-- It cannot be any more: every leg now carries a NULL P&L for its whole life,
-- so the implicit marker no longer distinguishes anything. It needs a column.
--
-- Apply with a single pool.query() over the whole file via DATABASE_URL, not by
-- pasting into the Supabase SQL editor — the editor reports "Success. No rows
-- returned" when it has executed nothing but the leading comment.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS premium_already_logged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN trades.premium_already_logged IS
  'Wheel leg only: the premium on this leg is journalled on a separate Trade Log row, so it must be subtracted from the cycle summary P&L to avoid double-counting.';
