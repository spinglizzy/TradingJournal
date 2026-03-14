import 'dotenv/config'
import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
})

const NOW_TEXT = `TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strategies (
      id                SERIAL PRIMARY KEY,
      name              TEXT NOT NULL UNIQUE,
      description       TEXT,
      rich_description  TEXT DEFAULT '',
      entry_rules       TEXT DEFAULT '',
      exit_rules        TEXT DEFAULT '',
      market_conditions TEXT DEFAULT '',
      timeframe         TEXT DEFAULT '',
      checklist         TEXT NOT NULL DEFAULT '[]',
      default_fields    TEXT NOT NULL DEFAULT '{}',
      screenshot_path   TEXT,
      created_at        TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id    SERIAL PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1'
    )
  `)

  await pool.query(`
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
      account_id        INTEGER,
      created_at        TEXT DEFAULT ${NOW_TEXT},
      updated_at        TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trade_tags (
      trade_id  INTEGER REFERENCES trades(id) ON DELETE CASCADE,
      tag_id    INTEGER REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (trade_id, tag_id)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id         SERIAL PRIMARY KEY,
      date       TEXT NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'daily',
      title      TEXT,
      content    TEXT NOT NULL DEFAULT '',
      mood       TEXT CHECK(mood IN ('great','good','neutral','bad','terrible')),
      tags       TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT ${NOW_TEXT},
      updated_at TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_trade_links (
      journal_id  INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
      trade_id    INTEGER REFERENCES trades(id)          ON DELETE CASCADE,
      PRIMARY KEY (journal_id, trade_id)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS executions (
      id          SERIAL PRIMARY KEY,
      trade_id    INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK(type IN ('entry','exit')),
      price       DOUBLE PRECISION NOT NULL,
      quantity    DOUBLE PRECISION NOT NULL,
      fees        DOUBLE PRECISION DEFAULT 0,
      executed_at TEXT NOT NULL,
      notes       TEXT
    )
  `)

  await pool.query(`
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
      created_at    TEXT DEFAULT ${NOW_TEXT},
      updated_at    TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
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
      created_at            TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
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
      created_at       TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_transactions (
      id         SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK(type IN ('deposit','withdrawal')),
      amount     DOUBLE PRECISION NOT NULL,
      date       TEXT NOT NULL,
      notes      TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  // Add trades.account_id FK after accounts table exists
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'trades_account_id_fkey' AND table_name = 'trades'
      ) THEN
        ALTER TABLE trades ADD CONSTRAINT trades_account_id_fkey
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
      END IF;
    END $$
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      metric       TEXT NOT NULL CHECK(metric IN ('pnl','win_rate','trade_count','discipline_score','journal_streak','max_daily_loss')),
      target_value DOUBLE PRECISION NOT NULL,
      timeframe    TEXT NOT NULL CHECK(timeframe IN ('daily','weekly','monthly','yearly')),
      direction    TEXT NOT NULL DEFAULT 'above' CHECK(direction IN ('above','below')),
      active       SMALLINT NOT NULL DEFAULT 1,
      created_at   TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS achievements (
      id          SERIAL PRIMARY KEY,
      key         TEXT UNIQUE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT '🏆',
      category    TEXT NOT NULL DEFAULT 'custom',
      earned_at   TEXT,
      custom      SMALLINT NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT ${NOW_TEXT}
    )
  `)

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_trades_date           ON trades(date)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_ticker         ON trades(ticker)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_status         ON trades(status)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_strategy       ON trades(strategy_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_account        ON trades(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_date_status    ON trades(date, status)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_account_date   ON trades(account_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_trades_account_status ON trades(account_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_executions_trade      ON executions(trade_id)`,
    `CREATE INDEX IF NOT EXISTS idx_journal_date          ON journal_entries(date)`,
    `CREATE INDEX IF NOT EXISTS idx_journal_type          ON journal_entries(entry_type)`,
    `CREATE INDEX IF NOT EXISTS idx_acct_tx_account       ON account_transactions(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_goals_active          ON goals(active)`,
    `CREATE INDEX IF NOT EXISTS idx_achievements_key      ON achievements(key)`,
  ]
  for (const idx of indexes) await pool.query(idx)

  console.log('Database schema ready')
}

export function calcPnl(direction, entryPrice, exitPrice, positionSize, fees, stopLoss) {
  if (exitPrice == null) return { pnl: null, pnl_percent: null, r_multiple: null }
  const mult = direction === 'long' ? 1 : -1
  const pnl = mult * (exitPrice - entryPrice) * positionSize - fees
  const pnl_percent = (pnl / (entryPrice * positionSize)) * 100
  let r_multiple = null
  if (stopLoss != null) {
    const riskPerUnit = Math.abs(entryPrice - stopLoss)
    const riskTotal = riskPerUnit * positionSize
    if (riskTotal > 0) r_multiple = pnl / riskTotal
  }
  return { pnl, pnl_percent, r_multiple }
}

export default pool
