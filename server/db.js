import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'trading_journal.db')

const db = new Database(DB_PATH)

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS strategies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1'
  );

  CREATE TABLE IF NOT EXISTS trades (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT NOT NULL,
    ticker           TEXT NOT NULL,
    direction        TEXT NOT NULL CHECK(direction IN ('long','short')),
    entry_price      REAL NOT NULL,
    exit_price       REAL,
    stop_loss        REAL,
    position_size    REAL NOT NULL,
    fees             REAL DEFAULT 0,
    strategy_id      INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
    timeframe        TEXT,
    notes            TEXT,
    screenshot_path  TEXT,
    status           TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    pnl              REAL,
    pnl_percent      REAL,
    r_multiple       REAL,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trade_tags (
    trade_id  INTEGER REFERENCES trades(id) ON DELETE CASCADE,
    tag_id    INTEGER REFERENCES tags(id)   ON DELETE CASCADE,
    PRIMARY KEY (trade_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    entry_type TEXT NOT NULL DEFAULT 'daily',
    title      TEXT,
    content    TEXT NOT NULL DEFAULT '',
    mood       TEXT CHECK(mood IN ('great','good','neutral','bad','terrible')),
    tags       TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journal_trade_links (
    journal_id  INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
    trade_id    INTEGER REFERENCES trades(id)          ON DELETE CASCADE,
    PRIMARY KEY (journal_id, trade_id)
  );

  CREATE TABLE IF NOT EXISTS executions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id     INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    type         TEXT NOT NULL CHECK(type IN ('entry','exit')),
    price        REAL NOT NULL,
    quantity     REAL NOT NULL,
    fees         REAL DEFAULT 0,
    executed_at  TEXT NOT NULL,
    notes        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trades_date      ON trades(date);
  CREATE INDEX IF NOT EXISTS idx_trades_ticker    ON trades(ticker);
  CREATE INDEX IF NOT EXISTS idx_trades_status    ON trades(status);
  CREATE INDEX IF NOT EXISTS idx_trades_strategy  ON trades(strategy_id);
  CREATE INDEX IF NOT EXISTS idx_executions_trade ON executions(trade_id);
`)

// Additional composite indexes for common query patterns
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trades_date_status     ON trades(date, status);
    CREATE INDEX IF NOT EXISTS idx_trades_account_date    ON trades(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_trades_account_status  ON trades(account_id, status);
    CREATE INDEX IF NOT EXISTS idx_trades_created         ON trades(created_at);
  `)
} catch { /* ignore if already exist */ }

// ── Journal migrations ───────────────────────────────────────────────────────

// Migrate journal_entries: remove UNIQUE constraint on date, add entry_type + tags
const journalSchema = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'"
).get()
if (journalSchema && journalSchema.sql.includes('UNIQUE')) {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    DROP TABLE IF EXISTS journal_entries_new;
    CREATE TABLE journal_entries_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'daily',
      title      TEXT,
      content    TEXT NOT NULL DEFAULT '',
      mood       TEXT CHECK(mood IN ('great','good','neutral','bad','terrible')),
      tags       TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO journal_entries_new (id, date, title, content, mood, created_at, updated_at)
      SELECT id, date, COALESCE(title,''), COALESCE(content,''), mood, created_at, updated_at
      FROM journal_entries;
    DROP TABLE journal_entries;
    ALTER TABLE journal_entries_new RENAME TO journal_entries;
  `)
  db.pragma('foreign_keys = ON')
  // Create indexes after migration
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_type ON journal_entries(entry_type)`)
  } catch {}
} else {
  // Add new columns to existing migrated table
  const addJournalCol = (col, def) => {
    try { db.exec(`ALTER TABLE journal_entries ADD COLUMN ${col} ${def}`) } catch { /* exists */ }
  }
  addJournalCol('entry_type', "TEXT NOT NULL DEFAULT 'daily'")
  addJournalCol('tags',       "TEXT NOT NULL DEFAULT '[]'")
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_type ON journal_entries(entry_type)`)
  } catch {}
}

// ── Planned / Missed trades tables ───────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS planned_trades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    strategy_id   INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
    direction     TEXT NOT NULL DEFAULT 'long',
    planned_entry REAL,
    stop_loss     REAL,
    target_price  REAL,
    notes         TEXT DEFAULT '',
    confidence    INTEGER,
    status        TEXT NOT NULL DEFAULT 'active',
    trade_id      INTEGER REFERENCES trades(id) ON DELETE SET NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS missed_trades (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    date                  TEXT NOT NULL,
    ticker                TEXT NOT NULL,
    strategy_id           INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
    direction             TEXT NOT NULL DEFAULT 'long',
    entry_would_have_been REAL,
    exit_would_have_been  REAL,
    position_size         REAL DEFAULT 100,
    simulated_pnl         REAL,
    reason_missed         TEXT DEFAULT '',
    notes                 TEXT DEFAULT '',
    created_at            TEXT DEFAULT (datetime('now'))
  );
`)

// ── Strategies table: add rich playbook columns ───────────────────────────────
const addStratCol = (col, def) => {
  try { db.exec(`ALTER TABLE strategies ADD COLUMN ${col} ${def}`) } catch { /* exists */ }
}
addStratCol('rich_description', "TEXT DEFAULT ''")
addStratCol('entry_rules',      "TEXT DEFAULT ''")
addStratCol('exit_rules',       "TEXT DEFAULT ''")
addStratCol('market_conditions',"TEXT DEFAULT ''")
addStratCol('timeframe',        "TEXT DEFAULT ''")
addStratCol('checklist',        "TEXT NOT NULL DEFAULT '[]'")
addStratCol('default_fields',   "TEXT NOT NULL DEFAULT '{}'")
addStratCol('screenshot_path',  'TEXT')

// Add new columns to existing trades table (migrations)
const addCol = (col, type) => {
  try { db.exec(`ALTER TABLE trades ADD COLUMN ${col} ${type}`) } catch { /* already exists */ }
}
addCol('exit_date',         'TEXT')
addCol('confidence',        'INTEGER')
addCol('emotions',          'TEXT')
addCol('mistakes',          'TEXT')
addCol('mfe',               'REAL')
addCol('mae',               'REAL')
addCol('setup',             'TEXT')
addCol('emotion_intensity', 'INTEGER')
addCol('rules_followed',    'TEXT')
addCol('rules_broken',      'TEXT')

// ── Accounts & Transactions ───────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    broker_name       TEXT NOT NULL DEFAULT '',
    currency          TEXT NOT NULL DEFAULT 'USD',
    starting_balance  REAL NOT NULL DEFAULT 0,
    commission_type   TEXT NOT NULL DEFAULT 'fixed' CHECK(commission_type IN ('fixed','per_share','percent')),
    commission_value  REAL NOT NULL DEFAULT 0,
    pnl_method        TEXT NOT NULL DEFAULT 'basic' CHECK(pnl_method IN ('basic','fifo')),
    is_default        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS account_transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN ('deposit','withdrawal')),
    amount      REAL NOT NULL,
    date        TEXT NOT NULL,
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_acct_tx_account ON account_transactions(account_id);
`)

// Add account_id to trades (migration)
const addCol2 = (col, type) => {
  try { db.exec(`ALTER TABLE trades ADD COLUMN ${col} ${type}`) } catch { /* already exists */ }
}
addCol2('account_id', 'INTEGER REFERENCES accounts(id) ON DELETE SET NULL')
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id)`) } catch {}

// ── Goals & Achievements ──────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    metric       TEXT NOT NULL CHECK(metric IN ('pnl','win_rate','trade_count','discipline_score','journal_streak','max_daily_loss')),
    target_value REAL NOT NULL,
    timeframe    TEXT NOT NULL CHECK(timeframe IN ('daily','weekly','monthly','yearly')),
    direction    TEXT NOT NULL DEFAULT 'above' CHECK(direction IN ('above','below')),
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT '🏆',
    category    TEXT NOT NULL DEFAULT 'custom',
    earned_at   TEXT,
    custom      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_goals_active       ON goals(active);
  CREATE INDEX IF NOT EXISTS idx_achievements_key   ON achievements(key);
`)

// ── P&L Calculator ──────────────────────────────────────────────────────────

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

export default db
