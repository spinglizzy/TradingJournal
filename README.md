# TradeLog — Personal Trading Journal

A full-featured, self-hosted trading journal and analytics platform built for active traders. Track every trade, analyze your performance across multiple dimensions, maintain a trading journal, and build disciplined habits — all stored locally with no cloud dependency.

---

## Features

### Core Trading
- **Trade Logging** — Log trades with entry/exit prices, stop loss, position size, fees, and screenshots
- **Multiple Accounts** — Manage multiple trading accounts with separate balances and commission settings
- **Open/Closed Trades** — Track open positions alongside closed trades
- **Execution Tracking** — Log individual entry/exit executions per trade
- **MFE/MAE Tracking** — Maximum favorable/adverse excursion for trade quality analysis
- **R-Multiple** — Automatic risk/reward calculation based on stop loss

### Psychology & Discipline
- **Emotion Tracking** — Log emotions, confidence level, and emotion intensity per trade
- **Mistake & Rules Tracking** — Track which rules were followed or broken
- **Setup Notes** — Document the specific setup rationale for each trade
- **Psychology Dashboard** — Dedicated psychology analytics page

### Dashboard
- **15 Configurable Widgets** — Summary cards, charts, and tables
- **Drag-and-Drop Layout** — Reorder and resize widgets freely
- **Layout Presets** — Save and switch between multiple dashboard configurations
- **Global Date Filter** — Quick presets: Last 7 days, Last 30, MTD, YTD, or custom range
- **Account Filter** — Filter all dashboard data by selected account

### Analytics
- **Overview** — P&L, win rate, profit factor, expectancy, equity curve, drawdown
- **By Time** — Daily, weekly, and monthly breakdowns
- **By Setup** — Performance comparison across strategies and setups
- **By Instrument** — Best and worst tickers with win rates
- **By Tags** — Tag-based performance analysis
- **Custom Reports** — Configurable dimension × metric cross-tabulations
- **Comparison Mode** — Compare performance across two date periods side by side

### Journal
- **Calendar + List Views** — Visual calendar with performance heatmap overlay
- **Entry Types** — Daily, Pre-Session, Post-Session, and Weekly Review
- **Rich Text Editor** — TipTap editor with headings, lists, and formatting
- **Templates** — Customizable per-type templates (pre/post session format)
- **Mood Tracking** — 5-level mood indicator per entry
- **Trade Links** — Link journal entries to specific trades
- **Auto Weekly Review** — Auto-generated weekly summary with key stats

### Playbook
- **Strategy Documentation** — Rich text entry/exit rules, market conditions
- **Checklists** — Per-strategy trade checklists
- **Planned Trades** — Log planned setups before they trigger
- **Missed Trades** — Track setups you missed and simulate their outcome

### Goals & Achievements
- **Goal Metrics** — P&L, win rate, trade count, discipline score, journal streak, max daily loss
- **Timeframes** — Daily, weekly, monthly, and yearly goals
- **Progress Calendar** — 90-day daily goal completion heatmap
- **Achievement Badges** — Built-in and custom milestone badges
- **Streak Tracking** — Win streak, loss streak, and journal consistency streaks

### Import / Export
- **CSV Import** — 4-step wizard with column mapping
- **8 Broker Templates** — Interactive Brokers, Trading 212, CommSec, MT4, MT5, TradingView, Webull, Generic
- **Duplicate Detection** — Skip duplicate trades automatically
- **CSV Export** — Export filtered trades to spreadsheet
- **JSON Backup** — Full database backup including journal, goals, and accounts
- **JSON Restore** — Merge or replace restore from backup

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7 |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Rich Text | TipTap |
| Drag & Drop | @dnd-kit |
| Icons | Lucide React |
| Backend | Express 5 |
| Database | SQLite (better-sqlite3) |
| Build Tool | Vite 7 |

---

## Installation

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd trading-journal

# Install dependencies
npm install
```

### Running

> **Important:** Run the backend and frontend in **two separate terminals**.

**Terminal 1 — Backend (Express API)**
```bash
npm run dev:server
```
Starts the API server at `http://localhost:3001`

**Terminal 2 — Frontend (Vite dev server)**
```bash
npm run dev:client
```
Opens the app at `http://localhost:5173`

### First Launch

On first launch with no trades in the database, you'll see a **welcome onboarding flow** that guides you through:
1. Setting your account name, broker, and currency
2. Choosing to enter a trade manually or import from CSV

---

## Seeding Sample Data

To populate the database with realistic sample trade data for testing/demo:

```bash
node server/seed.js
```

This creates:
- 5 trading strategies (Breakout, Pullback, Reversal, Gap Fill, Momentum)
- 8 trade tags (earnings, high-vol, scalp, swing, A+ setup, etc.)
- 6 months of realistic trades across multiple tickers
- Sample journal entries

> **Warning:** The seed script deletes all existing trade data before inserting sample data.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show keyboard shortcuts reference |
| `n` | New trade |
| `Ctrl + B` | Toggle sidebar |
| `g → h` | Go to Dashboard |
| `g → t` | Go to Trade Log |
| `g → a` | Go to Analytics |
| `g → j` | Go to Journal |
| `g → p` | Go to Playbook |
| `g → g` | Go to Goals |
| `Esc` | Close modal |

> Two-key shortcuts: press `g`, release, then press the second key within 1 second.

---

## Data Storage

All data is stored in a local SQLite database at `trading_journal.db` in the project root. There is no cloud sync, no user accounts, no external dependencies — your data stays on your machine.

---

## Backup & Restore

### Export JSON backup
Navigate to **Settings → Backup & Export** and click **Download .json**.

Or via API:
```
GET http://localhost:3001/api/export/json
```

### Export CSV
```
GET http://localhost:3001/api/export/csv?from=2024-01-01&to=2024-12-31&status=closed
```

### Restore from backup
Navigate to **Settings → Restore from Backup**, choose your `.json` file, select **Merge** (add to existing data) or **Replace** (wipe and restore), then click **Choose Backup File**.

---

## Project Structure

```
trading-journal/
├── server/
│   ├── index.js           # Express app entry point
│   ├── db.js              # SQLite schema, migrations, calcPnl()
│   ├── seed.js            # Sample data seeder
│   └── routes/            # REST API route handlers
├── src/
│   ├── App.jsx            # React Router routes
│   ├── api/               # fetch-based API clients
│   ├── components/
│   │   ├── layout/        # Layout, Sidebar, AccountSwitcher
│   │   ├── dashboard/     # Widget system (grid, picker, presets, registry)
│   │   ├── dashboard/widgets/  # 15 widget implementations
│   │   ├── charts/        # Standalone chart components (Recharts)
│   │   ├── analytics/     # 6 analytics tab components
│   │   ├── trades/        # TradeTable, TradeFilters
│   │   ├── journal/       # Calendar, Editor, List, TipTap
│   │   ├── onboarding/    # Welcome flow modal
│   │   └── ui/            # Shared components (Modal, Badge, ConfirmDialog, etc.)
│   ├── contexts/
│   │   ├── AccountContext.jsx   # Global account selection state
│   │   └── DashboardContext.jsx # Dashboard date range + merged apiParams
│   └── pages/             # Page-level components
└── public/uploads/        # Trade screenshot uploads
```

---

## API Overview

The REST API runs at `http://localhost:3001/api/`.

| Resource | Base Path |
|----------|-----------|
| Trades | `/api/trades` |
| Statistics | `/api/stats` |
| Analytics | `/api/analytics` |
| Journal | `/api/journal` |
| Accounts | `/api/accounts` |
| Strategies | `/api/strategies` |
| Goals | `/api/goals` |
| Import | `/api/import` |
| Export | `/api/export` |

---

## License

MIT
