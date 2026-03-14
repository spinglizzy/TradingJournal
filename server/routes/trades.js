import { Router } from 'express'
import pool, { calcPnl } from '../db.js'

const router = Router()

const TAG_AGG = `
  STRING_AGG(tg.name,  ',' ORDER BY tg.id) as tag_names,
  STRING_AGG(tg.color, ',' ORDER BY tg.id) as tag_colors,
  STRING_AGG(tg.id::text, ',' ORDER BY tg.id) as tag_ids`

// ── List trades ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      start_date, end_date, ticker, direction, strategy_id,
      status, tag, search, account_id,
      sort_by = 'date', sort_dir = 'desc',
      page = 1, limit = 50,
    } = req.query

    const p = []
    const w = ['1=1']

    if (account_id)  w.push(`t.account_id = $${p.push(account_id)}`)
    if (start_date)  w.push(`t.date >= $${p.push(start_date)}`)
    if (end_date)    w.push(`t.date <= $${p.push(end_date)}`)
    if (ticker)      w.push(`t.ticker ILIKE $${p.push('%' + ticker + '%')}`)
    if (direction)   w.push(`t.direction = $${p.push(direction)}`)
    if (strategy_id) w.push(`t.strategy_id = $${p.push(strategy_id)}`)
    if (status)      w.push(`t.status = $${p.push(status)}`)
    if (search) {
      const s = `%${search}%`
      w.push(`(t.ticker ILIKE $${p.push(s)} OR t.notes ILIKE $${p.push(s)})`)
    }
    if (tag) {
      w.push(`t.id IN (SELECT trade_id FROM trade_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tg.name = $${p.push(tag)})`)
    }

    const allowedSort = ['date', 'ticker', 'direction', 'pnl', 'pnl_percent', 'r_multiple', 'position_size']
    const col = allowedSort.includes(sort_by) ? `t.${sort_by}` : 't.date'
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC'
    const offset = (Number(page) - 1) * Number(limit)

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM trades t WHERE ${w.join(' AND ')}`,
      [...p]
    )
    const total = parseInt(countResult.rows[0].count)

    const limitN  = p.push(Number(limit))
    const offsetN = p.push(offset)

    const tradesResult = await pool.query(`
      SELECT t.*, s.name as strategy_name,
             ${TAG_AGG}
      FROM trades t
      LEFT JOIN strategies s ON t.strategy_id = s.id
      LEFT JOIN trade_tags tt ON t.id = tt.trade_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE ${w.join(' AND ')}
      GROUP BY t.id, s.name
      ORDER BY ${col} ${dir}
      LIMIT $${limitN} OFFSET $${offsetN}
    `, p)

    res.json({ data: tradesResult.rows.map(formatTrade), total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Get single trade ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const trade = await getTradeById(req.params.id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    res.json(trade)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Create trade ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { tags = [], ...fields } = req.body

    let pnl, pnl_percent, r_multiple, status
    if (fields.entry_mode === 'direct_pnl' && fields.direct_pnl != null) {
      pnl = fields.direct_pnl; pnl_percent = null; r_multiple = null; status = 'closed'
    } else {
      ;({ pnl, pnl_percent, r_multiple } = calcPnl(
        fields.direction, fields.entry_price, fields.exit_price,
        fields.position_size, fields.fees ?? 0, fields.stop_loss
      ))
      status = fields.exit_price != null ? 'closed' : 'open'
    }

    const f = {
      exit_price: null, stop_loss: null, strategy_id: null, timeframe: null,
      notes: null, screenshot_path: null, account_id: null, confidence: null,
      emotions: null, mistakes: null, setup: null, emotion_intensity: null,
      rules_followed: null, rules_broken: null, entry_mode: 'entry_exit', direct_pnl: null,
      ...fields, status, pnl, pnl_percent, r_multiple,
    }

    const result = await pool.query(`
      INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss,
        position_size, fees, strategy_id, timeframe, notes, screenshot_path, account_id,
        status, pnl, pnl_percent, r_multiple,
        confidence, emotions, mistakes, setup, emotion_intensity, rules_followed, rules_broken,
        entry_mode, direct_pnl)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING id
    `, [
      f.date, f.ticker, f.direction, f.entry_price, f.exit_price, f.stop_loss,
      f.position_size, f.fees, f.strategy_id, f.timeframe, f.notes, f.screenshot_path, f.account_id,
      f.status, f.pnl, f.pnl_percent, f.r_multiple,
      f.confidence, f.emotions, f.mistakes, f.setup, f.emotion_intensity, f.rules_followed, f.rules_broken,
      f.entry_mode, f.direct_pnl,
    ])

    const tradeId = result.rows[0].id
    await syncTags(tradeId, tags)
    res.status(201).json(await getTradeById(tradeId))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Update trade ─────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM trades WHERE id = $1', [req.params.id])
    if (!existingResult.rows[0]) return res.status(404).json({ error: 'Trade not found' })

    const { tags = [], ...fields } = req.body
    const merged = { ...existingResult.rows[0], ...fields }

    let pnl, pnl_percent, r_multiple, status
    if (merged.entry_mode === 'direct_pnl' && merged.direct_pnl != null) {
      pnl = merged.direct_pnl; pnl_percent = null; r_multiple = null; status = 'closed'
    } else {
      ;({ pnl, pnl_percent, r_multiple } = calcPnl(
        merged.direction, merged.entry_price, merged.exit_price,
        merged.position_size, merged.fees ?? 0, merged.stop_loss
      ))
      status = merged.exit_price != null ? 'closed' : 'open'
    }

    const NOW = `TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
    await pool.query(`
      UPDATE trades SET
        date=$1, ticker=$2, direction=$3, entry_price=$4, exit_price=$5, stop_loss=$6,
        position_size=$7, fees=$8, strategy_id=$9, timeframe=$10, notes=$11,
        screenshot_path=$12, account_id=$13, status=$14, pnl=$15, pnl_percent=$16,
        r_multiple=$17, confidence=$18, emotions=$19, mistakes=$20, setup=$21,
        emotion_intensity=$22, rules_followed=$23, rules_broken=$24,
        entry_mode=$25, direct_pnl=$26,
        updated_at=${NOW}
      WHERE id=$27
    `, [
      merged.date, merged.ticker, merged.direction, merged.entry_price, merged.exit_price, merged.stop_loss,
      merged.position_size, merged.fees, merged.strategy_id, merged.timeframe, merged.notes,
      merged.screenshot_path, merged.account_id, status, pnl, pnl_percent,
      r_multiple, merged.confidence, merged.emotions, merged.mistakes, merged.setup,
      merged.emotion_intensity, merged.rules_followed, merged.rules_broken,
      merged.entry_mode, merged.direct_pnl,
      req.params.id,
    ])

    await syncTags(req.params.id, tags)
    res.json(await getTradeById(req.params.id))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Get journal entries linked to a trade ────────────────────────────────────
router.get('/:id/journal', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT je.id, je.date, je.title, je.mood
      FROM journal_trade_links jtl
      JOIN journal_entries je ON jtl.journal_id = je.id
      WHERE jtl.trade_id = $1
      ORDER BY je.date DESC
    `, [req.params.id])
    res.json(result.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Get prev/next trade IDs ───────────────────────────────────────────────────
router.get('/:id/neighbors', async (req, res) => {
  try {
    const tResult = await pool.query('SELECT date, id FROM trades WHERE id = $1', [req.params.id])
    const trade = tResult.rows[0]
    if (!trade) return res.status(404).json({ error: 'Trade not found' })

    const [prevR, nextR] = await Promise.all([
      pool.query(`SELECT id FROM trades WHERE date < $1 OR (date = $1 AND id < $2) ORDER BY date DESC, id DESC LIMIT 1`, [trade.date, trade.id]),
      pool.query(`SELECT id FROM trades WHERE date > $1 OR (date = $1 AND id > $2) ORDER BY date ASC,  id ASC  LIMIT 1`, [trade.date, trade.id]),
    ])
    res.json({ prev: prevR.rows[0]?.id ?? null, next: nextR.rows[0]?.id ?? null })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Executions CRUD ───────────────────────────────────────────────────────────
router.get('/:id/executions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM executions WHERE trade_id = $1 ORDER BY executed_at ASC, id ASC', [req.params.id])
    res.json(result.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/:id/executions', async (req, res) => {
  try {
    const { type, price, quantity, fees = 0, executed_at, notes } = req.body
    const result = await pool.query(`
      INSERT INTO executions (trade_id, type, price, quantity, fees, executed_at, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [req.params.id, type, price, quantity, fees, executed_at, notes])
    const row = await pool.query('SELECT * FROM executions WHERE id = $1', [result.rows[0].id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/:id/executions/:execId', async (req, res) => {
  try {
    await pool.query('DELETE FROM executions WHERE id = $1 AND trade_id = $2', [req.params.execId, req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Delete trade ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT id FROM trades WHERE id = $1', [req.params.id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Trade not found' })
    await pool.query('DELETE FROM trades WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function syncTags(tradeId, tagIds) {
  await pool.query('DELETE FROM trade_tags WHERE trade_id = $1', [tradeId])
  for (const tagId of tagIds) {
    await pool.query('INSERT INTO trade_tags (trade_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [tradeId, tagId])
  }
}

async function getTradeById(id) {
  const result = await pool.query(`
    SELECT t.*, s.name as strategy_name,
           ${TAG_AGG}
    FROM trades t
    LEFT JOIN strategies s ON t.strategy_id = s.id
    LEFT JOIN trade_tags tt ON t.id = tt.trade_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.id = $1
    GROUP BY t.id, s.name
  `, [id])
  return formatTrade(result.rows[0])
}

function formatTrade(t) {
  if (!t) return null
  const tags = t.tag_ids
    ? t.tag_ids.split(',').map((id, i) => ({
        id: Number(id),
        name: t.tag_names?.split(',')[i],
        color: t.tag_colors?.split(',')[i],
      }))
    : []
  const { tag_ids, tag_names, tag_colors, ...rest } = t
  return { ...rest, tags }
}

export default router
