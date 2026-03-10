import db, { calcPnl } from './db.js'

console.log('Seeding database...')

// Clear existing data
db.exec(`
  DELETE FROM journal_trade_links;
  DELETE FROM trade_tags;
  DELETE FROM journal_entries;
  DELETE FROM trades;
  DELETE FROM strategies;
  DELETE FROM tags;
`)

// ── Strategies ────────────────────────────────────────────────────────────────
const strategies = [
  { name: 'Breakout',    description: 'Break of key level with volume' },
  { name: 'Pullback',    description: 'Retracement to moving average or support' },
  { name: 'Reversal',    description: 'Counter-trend at major support/resistance' },
  { name: 'Gap Fill',    description: 'Fade the opening gap back to prior close' },
  { name: 'Momentum',   description: 'Follow strong directional move' },
]

const strategyIds = {}
for (const s of strategies) {
  const r = db.prepare('INSERT INTO strategies (name, description) VALUES (?, ?)').run(s.name, s.description)
  strategyIds[s.name] = r.lastInsertRowid
}

// ── Tags ──────────────────────────────────────────────────────────────────────
const tags = [
  { name: 'earnings',   color: '#f59e0b' },
  { name: 'high-vol',   color: '#ef4444' },
  { name: 'overnight',  color: '#8b5cf6' },
  { name: 'scalp',      color: '#06b6d4' },
  { name: 'swing',      color: '#10b981' },
  { name: 'revenge',    color: '#dc2626' },
  { name: 'FOMO',       color: '#f97316' },
  { name: 'A+ setup',   color: '#22c55e' },
]

const tagIds = {}
for (const t of tags) {
  const r = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(t.name, t.color)
  tagIds[t.name] = r.lastInsertRowid
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomBetween(min, max) {
  return Math.random() * (max - min) + min
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Trade templates ───────────────────────────────────────────────────────────
const tickers  = ['AAPL', 'TSLA', 'SPY', 'QQQ', 'AMD', 'NVDA', 'MSFT', 'META']
const timeframes = ['5m', '15m', '1h', '4h', 'daily']
const stratNames = Object.keys(strategyIds)

// Generate trades spread over last 6 months
const today = new Date()
const sixMonthsAgo = new Date(today)
sixMonthsAgo.setMonth(today.getMonth() - 6)

let currentDate = new Date(sixMonthsAgo)
const tradeDates = []

while (currentDate <= today) {
  const dow = currentDate.getDay()
  if (dow !== 0 && dow !== 6) { // skip weekends
    if (Math.random() < 0.65) { // ~65% of trading days have trades
      const numTrades = Math.random() < 0.4 ? 2 : 1
      for (let i = 0; i < numTrades; i++) {
        tradeDates.push(currentDate.toISOString().split('T')[0])
      }
    }
  }
  currentDate.setDate(currentDate.getDate() + 1)
}

// Aim for ~45 trades
const selectedDates = tradeDates.slice(0, 45)

const insertTrade = db.prepare(`
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss,
    position_size, fees, strategy_id, timeframe, notes, status,
    pnl, pnl_percent, r_multiple)
  VALUES (@date, @ticker, @direction, @entry_price, @exit_price, @stop_loss,
    @position_size, @fees, @strategy_id, @timeframe, @notes, @status,
    @pnl, @pnl_percent, @r_multiple)
`)

const tradeIds = []

for (const date of selectedDates) {
  const ticker    = randomChoice(tickers)
  const direction = Math.random() < 0.6 ? 'long' : 'short'
  const stratName = randomChoice(stratNames)
  const timeframe = randomChoice(timeframes)

  // Realistic price ranges per ticker
  const basePrice = {
    AAPL: 175, TSLA: 230, SPY: 470, QQQ: 390,
    AMD: 140, NVDA: 650, MSFT: 380, META: 480,
  }[ticker]

  const entry_price = parseFloat((basePrice + randomBetween(-basePrice * 0.05, basePrice * 0.05)).toFixed(2))
  const stopPct = randomBetween(0.005, 0.02) // 0.5% - 2% stop
  const stop_loss = direction === 'long'
    ? parseFloat((entry_price * (1 - stopPct)).toFixed(2))
    : parseFloat((entry_price * (1 + stopPct)).toFixed(2))

  const position_size = Math.floor(randomBetween(10, 200))
  const fees = parseFloat((randomBetween(0.5, 5)).toFixed(2))

  // ~55% win rate
  const isWinner = Math.random() < 0.55
  const rr = isWinner ? randomBetween(0.8, 4.0) : randomBetween(-1.5, -0.1)
  const risk = Math.abs(entry_price - stop_loss)
  const move = risk * rr
  const exit_price = direction === 'long'
    ? parseFloat((entry_price + move).toFixed(2))
    : parseFloat((entry_price - move).toFixed(2))

  const { pnl, pnl_percent, r_multiple } = calcPnl(direction, entry_price, exit_price, position_size, fees, stop_loss)

  const notes = isWinner
    ? randomChoice([
        'Clean entry, held the move well.',
        'Textbook setup, followed plan.',
        'Good patience waiting for confirmation.',
        'Risk was well defined, took profit at target.',
        null,
      ])
    : randomChoice([
        'Stopped out. Entered too early.',
        'Market reversed hard. Stop was appropriate.',
        'Should have waited for better entry.',
        'Emotional entry — need to review.',
        null,
      ])

  const result = insertTrade.run({
    date, ticker, direction, entry_price, exit_price, stop_loss,
    position_size, fees,
    strategy_id: strategyIds[stratName],
    timeframe,
    notes,
    status: 'closed',
    pnl, pnl_percent, r_multiple,
  })

  tradeIds.push(result.lastInsertRowid)

  // Assign 0-2 random tags
  const numTags = Math.floor(Math.random() * 3)
  const tagNames = Object.keys(tagIds)
  const shuffled = tagNames.sort(() => Math.random() - 0.5).slice(0, numTags)
  for (const tagName of shuffled) {
    db.prepare('INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').run(
      result.lastInsertRowid, tagIds[tagName]
    )
  }
}

// Add 2 open trades
for (const ticker of ['SPY', 'NVDA']) {
  const basePrice = ticker === 'SPY' ? 470 : 650
  const entry_price = parseFloat((basePrice + randomBetween(-5, 5)).toFixed(2))
  const stop_loss   = parseFloat((entry_price * 0.98).toFixed(2))
  insertTrade.run({
    date: today.toISOString().split('T')[0],
    ticker, direction: 'long', entry_price,
    exit_price: null, stop_loss,
    position_size: 50, fees: 1,
    strategy_id: strategyIds['Breakout'],
    timeframe: '1h',
    notes: 'Active trade — watching for breakout continuation.',
    status: 'open',
    pnl: null, pnl_percent: null, r_multiple: null,
  })
}

// ── Journal entries ───────────────────────────────────────────────────────────
const journalDates = [...new Set(selectedDates)].slice(0, 8)
const moods = ['great', 'good', 'neutral', 'bad', 'terrible']

const sampleEntries = [
  { title: 'Good discipline today', content: '## What went well\n\nStuck to my plan on all entries. Did not chase any setups that were not A+ quality.\n\n## What to improve\n\nPosition sizing could be more consistent. Review risk per trade rule.', mood: 'good' },
  { title: 'Revenge traded after stop-out', content: '## What happened\n\nGot stopped out on TSLA and immediately re-entered without waiting for a new setup. Lost more than I should have.\n\n## Lessons\n\n- Always wait for the next candle close before considering re-entry\n- Take a 15-minute break after a losing trade', mood: 'bad' },
  { title: 'Best trading day this month', content: '## Summary\n\nTwo clean setups, both worked perfectly. Held through minor pullbacks and hit targets.\n\n## Key takeaways\n\nPatience is everything. The market came to me today rather than chasing.', mood: 'great' },
  { title: 'Choppy session', content: '## Notes\n\nMarket was indecisive all day. Should have sat on my hands after the first failed setup.\n\nRule reminder: **No trades after 2 failed setups in a session.**', mood: 'neutral' },
  { title: 'Reviewing my process', content: '## Weekly review\n\n- Win rate: 58%\n- Avg R: 1.4\n- Biggest mistake: holding losers too long\n\n## Goal for next week\n\nCut losses at predefined stop, no exceptions.', mood: 'neutral' },
]

for (let i = 0; i < Math.min(journalDates.length, sampleEntries.length); i++) {
  const entry = sampleEntries[i]
  const result = db.prepare(`
    INSERT INTO journal_entries (date, title, content, mood)
    VALUES (?, ?, ?, ?)
  `).run(journalDates[i], entry.title, entry.content, entry.mood)

  // Link 1-2 trades to some entries
  if (tradeIds[i] && Math.random() > 0.4) {
    db.prepare('INSERT OR IGNORE INTO journal_trade_links (journal_id, trade_id) VALUES (?, ?)').run(
      result.lastInsertRowid, tradeIds[i]
    )
  }
}

console.log(`✓ Seeded ${selectedDates.length + 2} trades (${selectedDates.length} closed, 2 open)`)
console.log(`✓ Seeded ${strategies.length} strategies, ${tags.length} tags`)
console.log(`✓ Seeded ${Math.min(journalDates.length, sampleEntries.length)} journal entries`)
console.log('Done.')
