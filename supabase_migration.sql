-- =============================================================================
-- TradeJournal — Supabase Migration Script
-- Run the entire contents of this file in the Supabase SQL Editor.
-- Your Supabase project must be created first; this creates all tables,
-- indexes, RLS policies, and the screenshots storage bucket.
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PROFILES — stores extra user data (name) beyond what auth.users holds
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, new.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- STRATEGIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS strategies (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  rich_description  TEXT DEFAULT '',
  entry_rules       TEXT DEFAULT '',
  exit_rules        TEXT DEFAULT '',
  market_conditions TEXT DEFAULT '',
  timeframe         TEXT DEFAULT '',
  checklist         TEXT NOT NULL DEFAULT '[]',
  default_fields    TEXT NOT NULL DEFAULT '{}',
  screenshot_path   TEXT,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TAGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS tags (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  color   TEXT DEFAULT '#6366f1',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- =============================================================================
-- ACCOUNTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  broker_name      TEXT NOT NULL DEFAULT '',
  currency         TEXT NOT NULL DEFAULT 'USD',
  starting_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_type  TEXT NOT NULL DEFAULT 'fixed' CHECK(commission_type IN ('fixed','per_share','percent')),
  commission_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  pnl_method       TEXT NOT NULL DEFAULT 'basic' CHECK(pnl_method IN ('basic','fifo')),
  is_default       SMALLINT NOT NULL DEFAULT 0,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TRADES
-- =============================================================================
CREATE TABLE IF NOT EXISTS trades (
  id                SERIAL PRIMARY KEY,
  date              TEXT NOT NULL,
  ticker            TEXT NOT NULL,
  direction         TEXT NOT NULL CHECK(direction IN ('long','short')),
  entry_price       DOUBLE PRECISION NOT NULL,
  exit_price        DOUBLE PRECISION,
  stop_loss         DOUBLE PRECISION,
  position_size     DOUBLE PRECISION NOT NULL,
  fees              DOUBLE PRECISION DEFAULT 0,
  strategy_id       INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  timeframe         TEXT,
  notes             TEXT,
  screenshot_path   TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  pnl               DOUBLE PRECISION,
  pnl_percent       DOUBLE PRECISION,
  r_multiple        DOUBLE PRECISION,
  exit_date         TEXT,
  confidence        INTEGER,
  emotions          TEXT,
  mistakes          TEXT,
  mfe               DOUBLE PRECISION,
  mae               DOUBLE PRECISION,
  setup             TEXT,
  emotion_intensity INTEGER,
  rules_followed    TEXT,
  rules_broken      TEXT,
  entry_mode        TEXT NOT NULL DEFAULT 'entry_exit',
  direct_pnl        DOUBLE PRECISION,
  account_id        INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TRADE TAGS (junction)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trade_tags (
  trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
  tag_id   INTEGER REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

-- =============================================================================
-- JOURNAL ENTRIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id         SERIAL PRIMARY KEY,
  date       TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'daily',
  title      TEXT,
  content    TEXT NOT NULL DEFAULT '',
  mood       TEXT CHECK(mood IN ('great','good','neutral','bad','terrible')),
  tags       TEXT NOT NULL DEFAULT '[]',
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- JOURNAL TRADE LINKS (junction)
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_trade_links (
  journal_id INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
  trade_id   INTEGER REFERENCES trades(id)           ON DELETE CASCADE,
  PRIMARY KEY (journal_id, trade_id)
);

-- =============================================================================
-- EXECUTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS executions (
  id          SERIAL PRIMARY KEY,
  trade_id    INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('entry','exit')),
  price       DOUBLE PRECISION NOT NULL,
  quantity    DOUBLE PRECISION NOT NULL,
  fees        DOUBLE PRECISION DEFAULT 0,
  executed_at TEXT NOT NULL,
  notes       TEXT
);

-- =============================================================================
-- PLANNED TRADES
-- =============================================================================
CREATE TABLE IF NOT EXISTS planned_trades (
  id            SERIAL PRIMARY KEY,
  ticker        TEXT NOT NULL,
  strategy_id   INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  direction     TEXT NOT NULL DEFAULT 'long',
  planned_entry DOUBLE PRECISION,
  stop_loss     DOUBLE PRECISION,
  target_price  DOUBLE PRECISION,
  notes         TEXT DEFAULT '',
  confidence    INTEGER,
  status        TEXT NOT NULL DEFAULT 'active',
  trade_id      INTEGER REFERENCES trades(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- MISSED TRADES
-- =============================================================================
CREATE TABLE IF NOT EXISTS missed_trades (
  id                    SERIAL PRIMARY KEY,
  date                  TEXT NOT NULL,
  ticker                TEXT NOT NULL,
  strategy_id           INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  direction             TEXT NOT NULL DEFAULT 'long',
  entry_would_have_been DOUBLE PRECISION,
  exit_would_have_been  DOUBLE PRECISION,
  position_size         DOUBLE PRECISION DEFAULT 100,
  simulated_pnl         DOUBLE PRECISION,
  reason_missed         TEXT DEFAULT '',
  notes                 TEXT DEFAULT '',
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- GOALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS goals (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  metric       TEXT NOT NULL CHECK(metric IN ('pnl','win_rate','trade_count','discipline_score','journal_streak','max_daily_loss')),
  target_value DOUBLE PRECISION NOT NULL,
  timeframe    TEXT NOT NULL CHECK(timeframe IN ('daily','weekly','monthly','yearly')),
  direction    TEXT NOT NULL DEFAULT 'above' CHECK(direction IN ('above','below')),
  active       SMALLINT NOT NULL DEFAULT 1,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ACHIEVEMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS achievements (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '🏆',
  category    TEXT NOT NULL DEFAULT 'custom',
  earned_at   TEXT,
  custom      SMALLINT NOT NULL DEFAULT 0,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ACCOUNT TRANSACTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS account_transactions (
  id         SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK(type IN ('deposit','withdrawal')),
  amount     DOUBLE PRECISION NOT NULL,
  date       TEXT NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_trades_user          ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_date          ON trades(date);
CREATE INDEX IF NOT EXISTS idx_trades_ticker        ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_trades_status        ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_strategy      ON trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_account       ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_date_status   ON trades(date, status);
CREATE INDEX IF NOT EXISTS idx_trades_account_date  ON trades(account_id, date);
CREATE INDEX IF NOT EXISTS idx_trades_account_status ON trades(account_id, status);
CREATE INDEX IF NOT EXISTS idx_executions_trade     ON executions(trade_id);
CREATE INDEX IF NOT EXISTS idx_journal_user         ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_date         ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_type         ON journal_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_acct_tx_account      ON account_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_goals_active         ON goals(active);
CREATE INDEX IF NOT EXISTS idx_achievements_key     ON achievements(key);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades               ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trade_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_trades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_trades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- strategies
CREATE POLICY "strategies_select" ON strategies FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "strategies_insert" ON strategies FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "strategies_update" ON strategies FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "strategies_delete" ON strategies FOR DELETE USING (user_id = auth.uid());

-- tags
CREATE POLICY "tags_select" ON tags FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tags_insert" ON tags FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tags_delete" ON tags FOR DELETE USING (user_id = auth.uid());

-- accounts
CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (user_id = auth.uid());

-- trades
CREATE POLICY "trades_select" ON trades FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "trades_insert" ON trades FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "trades_update" ON trades FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "trades_delete" ON trades FOR DELETE USING (user_id = auth.uid());

-- trade_tags: scoped via parent trade ownership
CREATE POLICY "trade_tags_select" ON trade_tags
  FOR SELECT USING (trade_id IN (SELECT id FROM trades WHERE user_id = auth.uid()));
CREATE POLICY "trade_tags_insert" ON trade_tags
  FOR INSERT WITH CHECK (trade_id IN (SELECT id FROM trades WHERE user_id = auth.uid()));
CREATE POLICY "trade_tags_delete" ON trade_tags
  FOR DELETE USING (trade_id IN (SELECT id FROM trades WHERE user_id = auth.uid()));

-- journal_entries
CREATE POLICY "journal_select" ON journal_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "journal_insert" ON journal_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "journal_update" ON journal_entries FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "journal_delete" ON journal_entries FOR DELETE USING (user_id = auth.uid());

-- journal_trade_links: scoped via parent journal entry
CREATE POLICY "jtl_select" ON journal_trade_links
  FOR SELECT USING (journal_id IN (SELECT id FROM journal_entries WHERE user_id = auth.uid()));
CREATE POLICY "jtl_insert" ON journal_trade_links
  FOR INSERT WITH CHECK (journal_id IN (SELECT id FROM journal_entries WHERE user_id = auth.uid()));
CREATE POLICY "jtl_delete" ON journal_trade_links
  FOR DELETE USING (journal_id IN (SELECT id FROM journal_entries WHERE user_id = auth.uid()));

-- executions: scoped via parent trade
CREATE POLICY "executions_select" ON executions
  FOR SELECT USING (trade_id IN (SELECT id FROM trades WHERE user_id = auth.uid()));
CREATE POLICY "executions_insert" ON executions
  FOR INSERT WITH CHECK (trade_id IN (SELECT id FROM trades WHERE user_id = auth.uid()));
CREATE POLICY "executions_delete" ON executions
  FOR DELETE USING (trade_id IN (SELECT id FROM trades WHERE user_id = auth.uid()));

-- planned_trades
CREATE POLICY "planned_select" ON planned_trades FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "planned_insert" ON planned_trades FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "planned_update" ON planned_trades FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "planned_delete" ON planned_trades FOR DELETE USING (user_id = auth.uid());

-- missed_trades
CREATE POLICY "missed_select" ON missed_trades FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "missed_insert" ON missed_trades FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "missed_update" ON missed_trades FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "missed_delete" ON missed_trades FOR DELETE USING (user_id = auth.uid());

-- goals
CREATE POLICY "goals_select" ON goals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "goals_insert" ON goals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "goals_update" ON goals FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "goals_delete" ON goals FOR DELETE USING (user_id = auth.uid());

-- achievements
CREATE POLICY "achievements_select" ON achievements FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "achievements_insert" ON achievements FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "achievements_update" ON achievements FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "achievements_delete" ON achievements FOR DELETE USING (user_id = auth.uid());

-- account_transactions
CREATE POLICY "acct_tx_select" ON account_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "acct_tx_insert" ON account_transactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "acct_tx_delete" ON account_transactions FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- STORAGE — screenshots bucket
-- =============================================================================

-- Create the public bucket (public = URLs are accessible without auth token)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'screenshots',
  'screenshots',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/gif','image/webp','image/bmp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: files stored as {user_id}/{filename}
-- Only the owner can upload or delete; anyone can read (bucket is public)
CREATE POLICY "screenshots_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "screenshots_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "screenshots_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "screenshots_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'screenshots');

-- =============================================================================
-- SAMPLE SEED DATA
-- Replace 'YOUR-USER-UUID-HERE' with your actual user UUID after signing up.
-- You can find your UUID in: Supabase Dashboard → Authentication → Users
-- =============================================================================

-- Uncomment and run after signing up:
--
-- DO $$
-- DECLARE
--   uid UUID := 'YOUR-USER-UUID-HERE';
-- BEGIN
--
--   INSERT INTO strategies (name, description, user_id) VALUES
--     ('Breakout', 'Trade breakouts above key resistance levels', uid),
--     ('Reversal', 'Fade extended moves at key support/resistance', uid),
--     ('Trend Follow', 'Enter pullbacks in the direction of the trend', uid);
--
--   INSERT INTO accounts (name, broker_name, currency, starting_balance, is_default, user_id) VALUES
--     ('Main Account', 'TD Ameritrade', 'USD', 25000, 1, uid);
--
--   INSERT INTO tags (name, color, user_id) VALUES
--     ('A+ Setup', '#9aea62', uid),
--     ('FOMO', '#f87171', uid),
--     ('Revenge Trade', '#fb923c', uid),
--     ('High Conviction', '#60a5fa', uid);
--
-- END $$;
