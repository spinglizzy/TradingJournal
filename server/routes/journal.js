import { Router } from 'express'
import pool from '../db.js'

const router = Router()

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date, entry_type, tag, search } = req.query
    const p = [req.userId]
    const w = ['user_id = $1']

    if (start_date) w.push(`date >= $${p.push(start_date)}`)
    if (end_date)   w.push(`date <= $${p.push(end_date)}`)
    if (entry_type) w.push(`entry_type = $${p.push(entry_type)}`)
    if (tag)        w.push(`tags LIKE $${p.push('%"' + tag + '"%')}`)
    if (search) {
      const s = `%${search}%`
      w.push(`(title ILIKE $${p.push(s)} OR content ILIKE $${p.push(s)})`)
    }

    const r = await pool.query(`
      SELECT id,date,entry_type,title,mood,tags,
             SUBSTRING(content,1,400) AS preview,
             created_at,updated_at
      FROM journal_entries WHERE ${w.join(' AND ')}
      ORDER BY date DESC, created_at DESC
    `, p)

    res.json(r.rows.map(e => ({ ...e, tags: safeJson(e.tags) })))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Calendar data ─────────────────────────────────────────────────────────────
router.get('/calendar', async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    const p = [req.userId]
    const w = ['user_id = $1']
    if (start_date) w.push(`date >= $${p.push(start_date)}`)
    if (end_date)   w.push(`date <= $${p.push(end_date)}`)

    const r = await pool.query(`
      SELECT date, entry_type, COUNT(*) AS cnt
      FROM journal_entries WHERE ${w.join(' AND ')}
      GROUP BY date, entry_type ORDER BY date ASC
    `, p)

    const byDate = {}
    for (const row of r.rows) {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date, types: [] }
      byDate[row.date].types.push(row.entry_type)
    }
    res.json(Object.values(byDate))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Weekly review auto-stats ──────────────────────────────────────────────────
router.get('/weekly-stats', async (req, res) => {
  try {
    const { from, to } = req.query
    if (!from || !to) return res.status(400).json({ error: 'from and to required' })

    const [statsR, grossR, bestSetupR] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total_trades,
               COALESCE(SUM(CASE WHEN status='closed' THEN pnl END),0) AS total_pnl,
               COUNT(CASE WHEN pnl>0  AND status='closed' THEN 1 END) AS wins,
               COUNT(CASE WHEN pnl<=0 AND status='closed' THEN 1 END) AS losses,
               MAX(CASE WHEN status='closed' THEN pnl END) AS best_pnl,
               MIN(CASE WHEN status='closed' THEN pnl END) AS worst_pnl
        FROM trades WHERE date>=$1 AND date<=$2 AND user_id=$3
      `, [from, to, req.userId]),
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN pnl>0  THEN pnl END),0)      AS gross_profit,
               ABS(COALESCE(SUM(CASE WHEN pnl<=0 THEN pnl END),0)) AS gross_loss
        FROM trades WHERE status='closed' AND date>=$1 AND date<=$2 AND user_id=$3
      `, [from, to, req.userId]),
      pool.query(`
        SELECT setup, COUNT(*) AS cnt FROM trades
        WHERE setup IS NOT NULL AND date>=$1 AND date<=$2 AND user_id=$3
        GROUP BY setup ORDER BY cnt DESC LIMIT 1
      `, [from, to, req.userId]),
    ])

    const stats = statsR.rows[0]
    const closed = Number(stats.wins) + Number(stats.losses)
    const win_rate = closed > 0 ? (Number(stats.wins) / closed) * 100 : 0
    const gross = grossR.rows[0]
    const profit_factor = gross.gross_loss > 0 ? gross.gross_profit / gross.gross_loss : null

    const [bestR, worstR] = await Promise.all([
      stats.best_pnl  != null ? pool.query(`SELECT id,ticker,pnl,date FROM trades WHERE status='closed' AND pnl=$1 AND date>=$2 AND date<=$3 AND user_id=$4 LIMIT 1`, [stats.best_pnl,  from, to, req.userId]) : Promise.resolve({ rows: [] }),
      stats.worst_pnl != null ? pool.query(`SELECT id,ticker,pnl,date FROM trades WHERE status='closed' AND pnl=$1 AND date>=$2 AND date<=$3 AND user_id=$4 LIMIT 1`, [stats.worst_pnl, from, to, req.userId]) : Promise.resolve({ rows: [] }),
    ])

    res.json({
      ...stats,
      win_rate,
      profit_factor,
      best_trade:  bestR.rows[0]  ?? null,
      worst_trade: worstR.rows[0] ?? null,
      top_setup:   bestSetupR.rows[0]?.setup ?? null,
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── All tags used across entries ──────────────────────────────────────────────
router.get('/tags', async (req, res) => {
  try {
    const r = await pool.query(`SELECT tags FROM journal_entries WHERE tags != '[]' AND user_id=$1`, [req.userId])
    const tagSet = new Set()
    for (const row of r.rows) safeJson(row.tags).forEach(t => tagSet.add(t))
    res.json([...tagSet].sort())
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Single entry ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [entryR, linkedR] = await Promise.all([
      pool.query('SELECT * FROM journal_entries WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]),
      pool.query(`
        SELECT t.id,t.date,t.ticker,t.direction,t.pnl,t.status,t.entry_price,t.exit_price
        FROM journal_trade_links jl JOIN trades t ON jl.trade_id=t.id
        WHERE jl.journal_id=$1
      `, [req.params.id]),
    ])
    if (!entryR.rows[0]) return res.status(404).json({ error: 'Entry not found' })
    const entry = entryR.rows[0]
    res.json({ ...entry, tags: safeJson(entry.tags), linked_trades: linkedR.rows })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { date, entry_type='daily', title='', content='', mood=null, tags=[], trade_ids=[] } = req.body
    const result = await pool.query(`
      INSERT INTO journal_entries (date,entry_type,title,content,mood,tags,user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [date, entry_type, title, content, mood, JSON.stringify(tags), req.userId])

    const id = result.rows[0].id
    await syncLinks(id, trade_ids)

    const entry = await pool.query('SELECT * FROM journal_entries WHERE id=$1 AND user_id=$2', [id, req.userId])
    res.status(201).json({ ...entry.rows[0], tags: safeJson(entry.rows[0].tags) })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Update ────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM journal_entries WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!check.rows[0]) return res.status(404).json({ error: 'Entry not found' })

    const { date, entry_type='daily', title='', content='', mood=null, tags=[], trade_ids=[] } = req.body
    const NOW = `TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
    await pool.query(`
      UPDATE journal_entries
      SET date=$1,entry_type=$2,title=$3,content=$4,mood=$5,tags=$6,updated_at=${NOW}
      WHERE id=$7 AND user_id=$8
    `, [date, entry_type, title, content, mood, JSON.stringify(tags), req.params.id, req.userId])

    await syncLinks(req.params.id, trade_ids)

    const entry = await pool.query('SELECT * FROM journal_entries WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    res.json({ ...entry.rows[0], tags: safeJson(entry.rows[0].tags) })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM journal_entries WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!check.rows[0]) return res.status(404).json({ error: 'Entry not found' })
    await pool.query('DELETE FROM journal_entries WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function syncLinks(journalId, tradeIds) {
  await pool.query('DELETE FROM journal_trade_links WHERE journal_id=$1', [journalId])
  for (const tid of tradeIds) {
    await pool.query('INSERT INTO journal_trade_links (journal_id,trade_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [journalId, tid])
  }
}

function safeJson(v) {
  try { return JSON.parse(v || '[]') } catch { return [] }
}

export default router
