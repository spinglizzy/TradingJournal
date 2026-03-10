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
    date       TEXT NOT NULL UNIQUE,
    title      TEXT,
    content    TEXT NOT NULL,
    mood       TEXT CHECK(mood IN ('great','good','neutral','bad','terrible')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journal_trade_links (
    journal_id  INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
    trade_id    INTEGER REFERENCES trades(id)          ON DELETE CASCADE,
    PRIMARY KEY (journal_id, trade_id)
  );

  CREATE INDEX IF NOT EXISTS idx_trades_date      ON trades(date);
  CREATE INDEX IF NOT EXISTS idx_trades_ticker    ON trades(ticker);
  CREATE INDEX IF NOT EXISTS idx_trades_status    ON trades(status);
  CREATE INDEX IF NOT EXISTS idx_trades_strategy  ON trades(strategy_id);
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
