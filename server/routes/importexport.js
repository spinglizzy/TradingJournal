import { Router } from 'express'
import db, { calcPnl } from '../db.js'

const router = Router()

// ── Simple CSV parser ─────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    const fields = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    rows.push(fields)
  }
  return rows
}

// ── Preview CSV ───────────────────────────────────────────────────────────────
router.post('/preview', (req, res) => {
  const { csv } = req.body
  if (!csv) return res.status(400).json({ error: 'No CSV data provided' })

  const rows = parseCSV(csv)
  if (rows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' })

  const headers = rows[0]
  const preview = rows.slice(1, 11).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })

  res.json({ headers, preview, total_rows: rows.length - 1 })
})

// ── Import trades ─────────────────────────────────────────────────────────────
router.post('/run', (req, res) => {
  const { csv, mappings, defaults = {}, account_id } = req.body
  // mappings = { date: 'csvColName', ticker: 'csvColName', ... }
  // defaults = { account_id, setup, tags, direction }

  if (!csv || !mappings) return res.status(400).json({ error: 'csv and mappings are required' })

  const rows = parseCSV(csv)
  if (rows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' })

  const headers = rows[0]
  const dataRows = rows.slice(1)

  // Journal fields that can be mapped
  const FIELDS = ['date', 'ticker', 'direction', 'entry_price', 'exit_price', 'stop_loss',
                  'position_size', 'fees', 'notes', 'setup', 'timeframe']

  let imported = 0
  let skipped = 0
  const duplicates = []
  const errors = []

  const insertTx = db.transaction(() => {
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowObj = {}
      headers.forEach((h, idx) => { rowObj[h] = row[idx] ?? '' })

      // Map fields
      const trade = { ...defaults }
      for (const field of FIELDS) {
        const col = mappings[field]
        if (col && rowObj[col] !== undefined && rowObj[col] !== '') {
          trade[field] = rowObj[col]
        }
      }

      // Validate required fields
      if (!trade.date || !trade.ticker || !trade.entry_price || !trade.position_size) {
        errors.push({ row: i + 2, reason: 'Missing required fields (date, ticker, entry_price, position_size)' })
        skipped++
        continue
      }

      // Normalize direction
      if (trade.direction) {
        const d = String(trade.direction).toLowerCase()
        if (d === 'buy' || d === 'long' || d === 'b') trade.direction = 'long'
        else if (d === 'sell' || d === 'short' || d === 's') trade.direction = 'short'
        else trade.direction = 'long'
      } else {
        trade.direction = 'long'
      }

      // Normalize ticker
      trade.ticker = String(trade.ticker).toUpperCase().trim()

      // Normalize numbers
      const toNum = v => { const n = parseFloat(String(v).replace(/[,$]/g, '')); return isNaN(n) ? null : n }
      trade.entry_price   = toNum(trade.entry_price)
      trade.exit_price    = toNum(trade.exit_price)
      trade.stop_loss     = toNum(trade.stop_loss)
      trade.position_size = toNum(trade.position_size)
      trade.fees          = toNum(trade.fees) ?? 0

      if (!trade.entry_price || !trade.position_size) {
        errors.push({ row: i + 2, reason: 'Invalid numeric values for entry_price or position_size' })
        skipped++
        continue
      }

      // Duplicate check: same ticker + date + entry_price
      const dup = db.prepare(`
        SELECT id FROM trades WHERE ticker = ? AND date = ? AND entry_price = ?
        ${account_id ? 'AND account_id = ?' : ''}
        LIMIT 1
      `).get(...(account_id ? [trade.ticker, trade.date, trade.entry_price, account_id]
                             : [trade.ticker, trade.date, trade.entry_price]))

      if (dup) {
        duplicates.push({ row: i + 2, ticker: trade.ticker, date: trade.date, existing_id: dup.id })
        skipped++
        continue
      }

      // Calculate PnL
      const { pnl, pnl_percent, r_multiple } = calcPnl(
        trade.direction, trade.entry_price, trade.exit_price,
        trade.position_size, trade.fees, trade.stop_loss
      )
      const status = trade.exit_price != null ? 'closed' : 'open'

      db.prepare(`
        INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss,
          position_size, fees, notes, setup, timeframe, account_id,
          status, pnl, pnl_percent, r_multiple)
        VALUES (@date, @ticker, @direction, @entry_price, @exit_price, @stop_loss,
          @position_size, @fees, @notes, @setup, @timeframe, @account_id,
          @status, @pnl, @pnl_percent, @r_multiple)
      `).run({
        date: trade.date,
        ticker: trade.ticker,
        direction: trade.direction,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price ?? null,
        stop_loss: trade.stop_loss ?? null,
        position_size: trade.position_size,
        fees: trade.fees,
        notes: trade.notes ?? null,
        setup: trade.setup ?? null,
        timeframe: trade.timeframe ?? null,
        account_id: account_id ?? null,
        status, pnl, pnl_percent, r_multiple,
      })

      imported++
    }
  })

  try {
    insertTx()
    res.json({ imported, skipped, duplicates, errors })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Export trades as CSV ──────────────────────────────────────────────────────
router.get('/csv', (req, res) => {
  const { account_id, from, to, status } = req.query

  let where = ['1=1']
  const params = []

  if (account_id) { where.push('t.account_id = ?'); params.push(account_id) }
  if (from)       { where.push('t.date >= ?'); params.push(from) }
  if (to)         { where.push('t.date <= ?'); params.push(to) }
  if (status)     { where.push('t.status = ?'); params.push(status) }

  const trades = db.prepare(`
    SELECT t.*, s.name as strategy_name, a.name as account_name,
           GROUP_CONCAT(tg.name) as tag_names
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN trade_tags tt ON t.id = tt.trade_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE ${where.join(' AND ')}
    GROUP BY t.id
    ORDER BY t.date DESC, t.id DESC
  `).all(...params)

  const HEADERS = [
    'id', 'date', 'ticker', 'direction', 'entry_price', 'exit_price', 'stop_loss',
    'position_size', 'fees', 'pnl', 'pnl_percent', 'r_multiple', 'status',
    'strategy_name', 'account_name', 'setup', 'timeframe', 'confidence',
    'emotions', 'mistakes', 'rules_followed', 'rules_broken',
    'mfe', 'mae', 'emotion_intensity', 'notes', 'tags',
  ]

  function escCsv(val) {
    if (val == null) return ''
    const s = String(val)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const csvRows = [
    HEADERS.join(','),
    ...trades.map(t => HEADERS.map(h => {
      if (h === 'tags') return escCsv(t.tag_names || '')
      return escCsv(t[h])
    }).join(',')),
  ]

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="trades-export.csv"')
  res.send(csvRows.join('\n'))
})

// ── Export full database backup as JSON ───────────────────────────────────────
router.get('/json', (_req, res) => {
  const data = {
    exported_at: new Date().toISOString(),
    version: 1,
    accounts: db.prepare('SELECT * FROM accounts').all(),
    trades: db.prepare(`
      SELECT t.*, GROUP_CONCAT(tt.tag_id) as tag_ids
      FROM trades t
      LEFT JOIN trade_tags tt ON t.id = tt.trade_id
      GROUP BY t.id
    `).all(),
    tags: db.prepare('SELECT * FROM tags').all(),
    strategies: db.prepare('SELECT * FROM strategies').all(),
    journal_entries: db.prepare('SELECT * FROM journal_entries').all(),
    goals: db.prepare('SELECT * FROM goals').all(),
    achievements: db.prepare('SELECT * FROM achievements WHERE earned_at IS NOT NULL').all(),
    account_transactions: db.prepare('SELECT * FROM account_transactions').all(),
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', 'attachment; filename="tradelog-backup.json"')
  res.send(JSON.stringify(data, null, 2))
})

// ── Restore from JSON backup ──────────────────────────────────────────────────
router.post('/restore', (req, res) => {
  const { data, mode = 'merge' } = req.body
  // mode: 'merge' keeps existing data and adds new; 'replace' clears first

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid backup data' })
  }
  if (data.version !== 1) {
    return res.status(400).json({ error: 'Unsupported backup version' })
  }

  try {
    const restore = db.transaction(() => {
      const stats = { accounts: 0, strategies: 0, tags: 0, trades: 0, journal: 0, goals: 0, achievements: 0 }

      if (mode === 'replace') {
        db.exec(`
          DELETE FROM journal_trade_links;
          DELETE FROM trade_tags;
          DELETE FROM executions;
          DELETE FROM account_transactions;
          DELETE FROM journal_entries;
          DELETE FROM trades;
          DELETE FROM strategies;
          DELETE FROM tags;
          DELETE FROM accounts;
          DELETE FROM goals;
          DELETE FROM achievements;
        `)
      }

      // Restore accounts (map old id → new id)
      const accountIdMap = {}
      for (const a of (data.accounts ?? [])) {
        const { id: oldId, created_at, ...fields } = a
        const existing = db.prepare('SELECT id FROM accounts WHERE name = ?').get(fields.name)
        if (existing) {
          accountIdMap[oldId] = existing.id
        } else {
          const r = db.prepare(`
            INSERT INTO accounts (name, broker_name, currency, starting_balance, commission_type, commission_value, pnl_method, is_default, created_at)
            VALUES (@name, @broker_name, @currency, @starting_balance, @commission_type, @commission_value, @pnl_method, @is_default, @created_at)
          `).run({ created_at, ...fields })
          accountIdMap[oldId] = r.lastInsertRowid
          stats.accounts++
        }
      }

      // Restore strategies
      const stratIdMap = {}
      for (const s of (data.strategies ?? [])) {
        const { id: oldId, created_at, ...fields } = s
        const existing = db.prepare('SELECT id FROM strategies WHERE name = ?').get(fields.name)
        if (existing) {
          stratIdMap[oldId] = existing.id
        } else {
          const r = db.prepare(`
            INSERT INTO strategies (name, description, rich_description, entry_rules, exit_rules, market_conditions, timeframe, checklist, default_fields, screenshot_path, created_at)
            VALUES (@name, @description, @rich_description, @entry_rules, @exit_rules, @market_conditions, @timeframe, @checklist, @default_fields, @screenshot_path, @created_at)
          `).run({ rich_description: '', entry_rules: '', exit_rules: '', market_conditions: '', timeframe: '', checklist: '[]', default_fields: '{}', screenshot_path: null, created_at, ...fields })
          stratIdMap[oldId] = r.lastInsertRowid
          stats.strategies++
        }
      }

      // Restore tags
      const tagIdMap = {}
      for (const t of (data.tags ?? [])) {
        const { id: oldId, ...fields } = t
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(fields.name)
        if (existing) {
          tagIdMap[oldId] = existing.id
        } else {
          const r = db.prepare('INSERT INTO tags (name, color) VALUES (@name, @color)').run(fields)
          tagIdMap[oldId] = r.lastInsertRowid
          stats.tags++
        }
      }

      // Restore trades
      const tradeIdMap = {}
      for (const t of (data.trades ?? [])) {
        const { id: oldId, tag_ids, strategy_name, account_name, ...fields } = t
        // Map foreign keys
        if (fields.account_id && accountIdMap[fields.account_id]) fields.account_id = accountIdMap[fields.account_id]
        if (fields.strategy_id && stratIdMap[fields.strategy_id]) fields.strategy_id = stratIdMap[fields.strategy_id]

        const dup = db.prepare('SELECT id FROM trades WHERE ticker = ? AND date = ? AND entry_price = ?').get(fields.ticker, fields.date, fields.entry_price)
        if (dup) { tradeIdMap[oldId] = dup.id; continue }

        const r = db.prepare(`
          INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
            strategy_id, timeframe, notes, screenshot_path, account_id, status, pnl, pnl_percent, r_multiple,
            confidence, emotions, mistakes, setup, emotion_intensity, rules_followed, rules_broken,
            exit_date, mfe, mae, created_at, updated_at)
          VALUES (@date, @ticker, @direction, @entry_price, @exit_price, @stop_loss, @position_size, @fees,
            @strategy_id, @timeframe, @notes, @screenshot_path, @account_id, @status, @pnl, @pnl_percent, @r_multiple,
            @confidence, @emotions, @mistakes, @setup, @emotion_intensity, @rules_followed, @rules_broken,
            @exit_date, @mfe, @mae, @created_at, @updated_at)
        `).run(fields)

        tradeIdMap[oldId] = r.lastInsertRowid
        stats.trades++

        // Restore tag associations
        const tIds = tag_ids ? String(tag_ids).split(',').filter(Boolean) : []
        for (const oldTagId of tIds) {
          const newTagId = tagIdMap[Number(oldTagId)]
          if (newTagId) {
            db.prepare('INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').run(r.lastInsertRowid, newTagId)
          }
        }
      }

      // Restore journal entries
      for (const je of (data.journal_entries ?? [])) {
        const { id: oldId, ...fields } = je
        const dup = db.prepare('SELECT id FROM journal_entries WHERE date = ? AND entry_type = ? AND title = ?').get(fields.date, fields.entry_type, fields.title)
        if (!dup) {
          db.prepare(`
            INSERT INTO journal_entries (date, entry_type, title, content, mood, tags, created_at, updated_at)
            VALUES (@date, @entry_type, @title, @content, @mood, @tags, @created_at, @updated_at)
          `).run(fields)
          stats.journal++
        }
      }

      // Restore account_transactions
      for (const tx of (data.account_transactions ?? [])) {
        const { id, created_at, ...fields } = tx
        if (fields.account_id && accountIdMap[fields.account_id]) fields.account_id = accountIdMap[fields.account_id]
        db.prepare('INSERT OR IGNORE INTO account_transactions (account_id, type, amount, date, notes, created_at) VALUES (@account_id, @type, @amount, @date, @notes, @created_at)').run({ created_at, ...fields })
      }

      // Restore goals
      for (const g of (data.goals ?? [])) {
        const { id, created_at, ...fields } = g
        db.prepare(`INSERT INTO goals (name, metric, target_value, timeframe, direction, active, created_at) VALUES (@name, @metric, @target_value, @timeframe, @direction, @active, @created_at)`).run({ created_at, ...fields })
        stats.goals++
      }

      return stats
    })

    const stats = restore()
    res.json({ success: true, stats })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
