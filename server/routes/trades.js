import { Router } from 'express'
import db, { calcPnl } from '../db.js'

const router = Router()

// ── List trades ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const {
    start_date, end_date, ticker, direction, strategy_id,
    status, tag, search,
    sort_by = 'date', sort_dir = 'desc',
    page = 1, limit = 50,
  } = req.query

  let where = ['1=1']
  const params = []

  if (start_date)   { where.push('t.date >= ?'); params.push(start_date) }
  if (end_date)     { where.push('t.date <= ?'); params.push(end_date) }
  if (ticker)       { where.push('t.ticker LIKE ?'); params.push(`%${ticker}%`) }
  if (direction)    { where.push('t.direction = ?'); params.push(direction) }
  if (strategy_id)  { where.push('t.strategy_id = ?'); params.push(strategy_id) }
  if (status)       { where.push('t.status = ?'); params.push(status) }
  if (search)       { where.push('(t.ticker LIKE ? OR t.notes LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
  if (tag) {
    where.push('t.id IN (SELECT trade_id FROM trade_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tg.name = ?)')
    params.push(tag)
  }

  const allowedSort = ['date', 'ticker', 'direction', 'pnl', 'pnl_percent', 'r_multiple', 'position_size']
  const col = allowedSort.includes(sort_by) ? `t.${sort_by}` : 't.date'
  const dir = sort_dir === 'asc' ? 'ASC' : 'DESC'

  const offset = (Number(page) - 1) * Number(limit)

  const totalRow = db.prepare(
    `SELECT COUNT(*) as count FROM trades t WHERE ${where.join(' AND ')}`
  ).get(...params)

  const trades = db.prepare(`
    SELECT t.*,
           s.name as strategy_name,
           GROUP_CONCAT(tg.name) as tag_names,
           GROUP_CONCAT(tg.color) as tag_colors,
           GROUP_CONCAT(tg.id) as tag_ids
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    LEFT JOIN trade_tags tt ON t.id = tt.trade_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE ${where.join(' AND ')}
    GROUP BY t.id
    ORDER BY ${col} ${dir}
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset)

  const result = trades.map(formatTrade)
  res.json({ data: result, total: totalRow.count, page: Number(page), limit: Number(limit) })
})

// ── Get single trade ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const trade = db.prepare(`
    SELECT t.*,
           s.name as strategy_name,
           GROUP_CONCAT(tg.name) as tag_names,
           GROUP_CONCAT(tg.color) as tag_colors,
           GROUP_CONCAT(tg.id) as tag_ids
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    LEFT JOIN trade_tags tt ON t.id = tt.trade_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(req.params.id)

  if (!trade) return res.status(404).json({ error: 'Trade not found' })
  res.json(formatTrade(trade))
})

// ── Create trade ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { tags = [], ...fields } = req.body
  const { pnl, pnl_percent, r_multiple } = calcPnl(
    fields.direction, fields.entry_price, fields.exit_price,
    fields.position_size, fields.fees ?? 0, fields.stop_loss
  )

  const status = fields.exit_price != null ? 'closed' : 'open'

  const result = db.prepare(`
    INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss,
      position_size, fees, strategy_id, timeframe, notes, screenshot_path,
      status, pnl, pnl_percent, r_multiple)
    VALUES (@date, @ticker, @direction, @entry_price, @exit_price, @stop_loss,
      @position_size, @fees, @strategy_id, @timeframe, @notes, @screenshot_path,
      @status, @pnl, @pnl_percent, @r_multiple)
  `).run({ ...fields, status, pnl, pnl_percent, r_multiple })

  const tradeId = result.lastInsertRowid
  syncTags(tradeId, tags)

  res.status(201).json(getTradeById(tradeId))
})

// ── Update trade ─────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Trade not found' })

  const { tags = [], ...fields } = req.body
  const merged = { ...existing, ...fields }

  const { pnl, pnl_percent, r_multiple } = calcPnl(
    merged.direction, merged.entry_price, merged.exit_price,
    merged.position_size, merged.fees ?? 0, merged.stop_loss
  )
  const status = merged.exit_price != null ? 'closed' : 'open'

  db.prepare(`
    UPDATE trades SET
      date = @date, ticker = @ticker, direction = @direction,
      entry_price = @entry_price, exit_price = @exit_price, stop_loss = @stop_loss,
      position_size = @position_size, fees = @fees, strategy_id = @strategy_id,
      timeframe = @timeframe, notes = @notes, screenshot_path = @screenshot_path,
      status = @status, pnl = @pnl, pnl_percent = @pnl_percent, r_multiple = @r_multiple,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...merged, status, pnl, pnl_percent, r_multiple, id: req.params.id })

  syncTags(req.params.id, tags)
  res.json(getTradeById(req.params.id))
})

// ── Delete trade ─────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const trade = db.prepare('SELECT id FROM trades WHERE id = ?').get(req.params.id)
  if (!trade) return res.status(404).json({ error: 'Trade not found' })
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function syncTags(tradeId, tagIds) {
  db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').run(tradeId)
  for (const tagId of tagIds) {
    db.prepare('INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').run(tradeId, tagId)
  }
}

function getTradeById(id) {
  const trade = db.prepare(`
    SELECT t.*,
           s.name as strategy_name,
           GROUP_CONCAT(tg.name) as tag_names,
           GROUP_CONCAT(tg.color) as tag_colors,
           GROUP_CONCAT(tg.id) as tag_ids
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    LEFT JOIN trade_tags tt ON t.id = tt.trade_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(id)
  return formatTrade(trade)
}

function formatTrade(t) {
  if (!t) return null
  const tags = t.tag_ids
    ? t.tag_ids.split(',').map((id, i) => ({
        id: Number(id),
        name: t.tag_names.split(',')[i],
        color: t.tag_colors.split(',')[i],
      }))
    : []
  const { tag_ids, tag_names, tag_colors, ...rest } = t
  return { ...rest, tags }
}

export default router
