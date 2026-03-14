import { Router } from 'express'
import pool, { calcPnl } from '../db.js'

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
        if (inQuote && line[i+1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = ''
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
  const preview = rows.slice(1,11).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
  res.json({ headers, preview, total_rows: rows.length - 1 })
})

// ── Import trades ─────────────────────────────────────────────────────────────
router.post('/run', async (req, res) => {
  const { csv, mappings, defaults={}, account_id } = req.body
  if (!csv || !mappings) return res.status(400).json({ error: 'csv and mappings are required' })

  const rows = parseCSV(csv)
  if (rows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' })

  const headers  = rows[0]
  const dataRows = rows.slice(1)
  const FIELDS   = ['date','ticker','direction','entry_price','exit_price','stop_loss','position_size','fees','notes','setup','timeframe']

  let imported=0, skipped=0
  const duplicates=[], errors=[]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (let i=0; i<dataRows.length; i++) {
      const row = dataRows[i]
      const rowObj = {}
      headers.forEach((h, idx) => { rowObj[h] = row[idx] ?? '' })

      const trade = { ...defaults }
      for (const field of FIELDS) {
        const col = mappings[field]
        if (col && rowObj[col] !== undefined && rowObj[col] !== '') trade[field] = rowObj[col]
      }

      if (!trade.date || !trade.ticker || !trade.entry_price || !trade.position_size) {
        errors.push({ row:i+2, reason:'Missing required fields (date, ticker, entry_price, position_size)' })
        skipped++; continue
      }

      if (trade.direction) {
        const d = String(trade.direction).toLowerCase()
        if (d==='buy'||d==='long'||d==='b')       trade.direction = 'long'
        else if (d==='sell'||d==='short'||d==='s') trade.direction = 'short'
        else                                       trade.direction = 'long'
      } else { trade.direction = 'long' }

      trade.ticker = String(trade.ticker).toUpperCase().trim()
      const toNum = v => { const n=parseFloat(String(v).replace(/[,$]/g,'')); return isNaN(n)?null:n }
      trade.entry_price   = toNum(trade.entry_price)
      trade.exit_price    = toNum(trade.exit_price)
      trade.stop_loss     = toNum(trade.stop_loss)
      trade.position_size = toNum(trade.position_size)
      trade.fees          = toNum(trade.fees) ?? 0

      if (!trade.entry_price || !trade.position_size) {
        errors.push({ row:i+2, reason:'Invalid numeric values for entry_price or position_size' })
        skipped++; continue
      }

      // Duplicate check
      const dupSql = account_id
        ? `SELECT id FROM trades WHERE ticker=$1 AND date=$2 AND entry_price=$3 AND account_id=$4 LIMIT 1`
        : `SELECT id FROM trades WHERE ticker=$1 AND date=$2 AND entry_price=$3 LIMIT 1`
      const dupParams = account_id
        ? [trade.ticker, trade.date, trade.entry_price, account_id]
        : [trade.ticker, trade.date, trade.entry_price]
      const dupR = await client.query(dupSql, dupParams)
      if (dupR.rows[0]) {
        duplicates.push({ row:i+2, ticker:trade.ticker, date:trade.date, existing_id:dupR.rows[0].id })
        skipped++; continue
      }

      const { pnl, pnl_percent, r_multiple } = calcPnl(
        trade.direction, trade.entry_price, trade.exit_price,
        trade.position_size, trade.fees, trade.stop_loss
      )
      const status = trade.exit_price != null ? 'closed' : 'open'

      await client.query(`
        INSERT INTO trades (date,ticker,direction,entry_price,exit_price,stop_loss,
          position_size,fees,notes,setup,timeframe,account_id,status,pnl,pnl_percent,r_multiple)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      `, [
        trade.date, trade.ticker, trade.direction, trade.entry_price,
        trade.exit_price??null, trade.stop_loss??null, trade.position_size, trade.fees,
        trade.notes??null, trade.setup??null, trade.timeframe??null,
        account_id??null, status, pnl, pnl_percent, r_multiple,
      ])
      imported++
    }

    await client.query('COMMIT')
    res.json({ imported, skipped, duplicates, errors })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ── Export trades as CSV ──────────────────────────────────────────────────────
router.get('/csv', async (req, res) => {
  try {
    const { account_id, from, to, status } = req.query
    const p = []
    const w = ['1=1']
    if (account_id) w.push(`t.account_id = $${p.push(account_id)}`)
    if (from)       w.push(`t.date >= $${p.push(from)}`)
    if (to)         w.push(`t.date <= $${p.push(to)}`)
    if (status)     w.push(`t.status = $${p.push(status)}`)

    const r = await pool.query(`
      SELECT t.*, s.name as strategy_name, a.name as account_name,
             STRING_AGG(tg.name, ',' ORDER BY tg.id) as tag_names
      FROM trades t
      LEFT JOIN strategies s ON t.strategy_id=s.id
      LEFT JOIN accounts a ON t.account_id=a.id
      LEFT JOIN trade_tags tt ON t.id=tt.trade_id
      LEFT JOIN tags tg ON tt.tag_id=tg.id
      WHERE ${w.join(' AND ')}
      GROUP BY t.id, s.name, a.name
      ORDER BY t.date DESC, t.id DESC
    `, p)

    const HEADERS = [
      'id','date','ticker','direction','entry_price','exit_price','stop_loss',
      'position_size','fees','pnl','pnl_percent','r_multiple','status',
      'strategy_name','account_name','setup','timeframe','confidence',
      'emotions','mistakes','rules_followed','rules_broken',
      'mfe','mae','emotion_intensity','notes','tags',
    ]

    function escCsv(val) {
      if (val == null) return ''
      const s = String(val)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`
      return s
    }

    const csvRows = [
      HEADERS.join(','),
      ...r.rows.map(t => HEADERS.map(h => {
        if (h === 'tags') return escCsv(t.tag_names || '')
        return escCsv(t[h])
      }).join(',')),
    ]

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="trades-export.csv"')
    res.send(csvRows.join('\n'))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Export full database backup as JSON ───────────────────────────────────────
router.get('/json', async (_req, res) => {
  try {
    const [accounts, trades, tags, strategies, journal, goals, achievements, transactions] = await Promise.all([
      pool.query('SELECT * FROM accounts'),
      pool.query(`SELECT t.*, STRING_AGG(tt.tag_id::text, ',' ORDER BY tt.tag_id) as tag_ids FROM trades t LEFT JOIN trade_tags tt ON t.id=tt.trade_id GROUP BY t.id`),
      pool.query('SELECT * FROM tags'),
      pool.query('SELECT * FROM strategies'),
      pool.query('SELECT * FROM journal_entries'),
      pool.query('SELECT * FROM goals'),
      pool.query('SELECT * FROM achievements WHERE earned_at IS NOT NULL'),
      pool.query('SELECT * FROM account_transactions'),
    ])

    const data = {
      exported_at: new Date().toISOString(),
      version: 1,
      accounts:             accounts.rows,
      trades:               trades.rows,
      tags:                 tags.rows,
      strategies:           strategies.rows,
      journal_entries:      journal.rows,
      goals:                goals.rows,
      achievements:         achievements.rows,
      account_transactions: transactions.rows,
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="tradelog-backup.json"')
    res.send(JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Restore from JSON backup ──────────────────────────────────────────────────
router.post('/restore', async (req, res) => {
  const { data, mode='merge' } = req.body
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid backup data' })
  if (data.version !== 1)                return res.status(400).json({ error: 'Unsupported backup version' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const stats = { accounts:0, strategies:0, tags:0, trades:0, journal:0, goals:0, achievements:0 }

    if (mode === 'replace') {
      for (const tbl of ['journal_trade_links','trade_tags','executions','account_transactions','journal_entries','trades','strategies','tags','accounts','goals','achievements']) {
        await client.query(`DELETE FROM ${tbl}`)
      }
    }

    // Accounts
    const accountIdMap = {}
    for (const a of (data.accounts ?? [])) {
      const { id:oldId, created_at, ...fields } = a
      const ex = await client.query('SELECT id FROM accounts WHERE name=$1', [fields.name])
      if (ex.rows[0]) {
        accountIdMap[oldId] = ex.rows[0].id
      } else {
        const r = await client.query(`
          INSERT INTO accounts (name,broker_name,currency,starting_balance,commission_type,commission_value,pnl_method,is_default,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
        `, [fields.name, fields.broker_name||'', fields.currency||'USD', fields.starting_balance||0,
            fields.commission_type||'fixed', fields.commission_value||0, fields.pnl_method||'basic',
            fields.is_default||0, created_at])
        accountIdMap[oldId] = r.rows[0].id
        stats.accounts++
      }
    }

    // Strategies
    const stratIdMap = {}
    for (const s of (data.strategies ?? [])) {
      const { id:oldId, created_at, ...fields } = s
      const ex = await client.query('SELECT id FROM strategies WHERE name=$1', [fields.name])
      if (ex.rows[0]) {
        stratIdMap[oldId] = ex.rows[0].id
      } else {
        const r = await client.query(`
          INSERT INTO strategies (name,description,rich_description,entry_rules,exit_rules,market_conditions,timeframe,checklist,default_fields,screenshot_path,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
        `, [fields.name, fields.description||'', fields.rich_description||'', fields.entry_rules||'',
            fields.exit_rules||'', fields.market_conditions||'', fields.timeframe||'',
            fields.checklist||'[]', fields.default_fields||'{}', fields.screenshot_path||null, created_at])
        stratIdMap[oldId] = r.rows[0].id
        stats.strategies++
      }
    }

    // Tags
    const tagIdMap = {}
    for (const t of (data.tags ?? [])) {
      const { id:oldId, ...fields } = t
      const ex = await client.query('SELECT id FROM tags WHERE name=$1', [fields.name])
      if (ex.rows[0]) {
        tagIdMap[oldId] = ex.rows[0].id
      } else {
        const r = await client.query('INSERT INTO tags (name,color) VALUES ($1,$2) RETURNING id', [fields.name, fields.color||'#6366f1'])
        tagIdMap[oldId] = r.rows[0].id
        stats.tags++
      }
    }

    // Trades
    const tradeIdMap = {}
    for (const t of (data.trades ?? [])) {
      const { id:oldId, tag_ids, strategy_name, account_name, ...fields } = t
      if (fields.account_id  && accountIdMap[fields.account_id])  fields.account_id  = accountIdMap[fields.account_id]
      if (fields.strategy_id && stratIdMap[fields.strategy_id])   fields.strategy_id = stratIdMap[fields.strategy_id]

      const dup = await client.query('SELECT id FROM trades WHERE ticker=$1 AND date=$2 AND entry_price=$3', [fields.ticker, fields.date, fields.entry_price])
      if (dup.rows[0]) { tradeIdMap[oldId]=dup.rows[0].id; continue }

      const r = await client.query(`
        INSERT INTO trades (date,ticker,direction,entry_price,exit_price,stop_loss,position_size,fees,
          strategy_id,timeframe,notes,screenshot_path,account_id,status,pnl,pnl_percent,r_multiple,
          confidence,emotions,mistakes,setup,emotion_intensity,rules_followed,rules_broken,
          exit_date,mfe,mae,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
        RETURNING id
      `, [
        fields.date, fields.ticker, fields.direction, fields.entry_price, fields.exit_price||null, fields.stop_loss||null,
        fields.position_size, fields.fees||0, fields.strategy_id||null, fields.timeframe||null, fields.notes||null,
        fields.screenshot_path||null, fields.account_id||null, fields.status||'open',
        fields.pnl||null, fields.pnl_percent||null, fields.r_multiple||null,
        fields.confidence||null, fields.emotions||null, fields.mistakes||null, fields.setup||null,
        fields.emotion_intensity||null, fields.rules_followed||null, fields.rules_broken||null,
        fields.exit_date||null, fields.mfe||null, fields.mae||null,
        fields.created_at||null, fields.updated_at||null,
      ])

      tradeIdMap[oldId] = r.rows[0].id
      stats.trades++

      const tIds = tag_ids ? String(tag_ids).split(',').filter(Boolean) : []
      for (const oldTagId of tIds) {
        const newTagId = tagIdMap[Number(oldTagId)]
        if (newTagId) {
          await client.query('INSERT INTO trade_tags (trade_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].id, newTagId])
        }
      }
    }

    // Journal entries
    for (const je of (data.journal_entries ?? [])) {
      const { id:oldId, ...fields } = je
      const dup = await client.query('SELECT id FROM journal_entries WHERE date=$1 AND entry_type=$2 AND title=$3', [fields.date, fields.entry_type, fields.title])
      if (!dup.rows[0]) {
        await client.query(`
          INSERT INTO journal_entries (date,entry_type,title,content,mood,tags,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [fields.date, fields.entry_type||'daily', fields.title||'', fields.content||'', fields.mood||null, fields.tags||'[]', fields.created_at||null, fields.updated_at||null])
        stats.journal++
      }
    }

    // Account transactions
    for (const tx of (data.account_transactions ?? [])) {
      const { id, created_at, ...fields } = tx
      if (fields.account_id && accountIdMap[fields.account_id]) fields.account_id = accountIdMap[fields.account_id]
      await client.query(
        'INSERT INTO account_transactions (account_id,type,amount,date,notes,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [fields.account_id, fields.type, fields.amount, fields.date, fields.notes||'', created_at]
      )
    }

    // Goals
    for (const g of (data.goals ?? [])) {
      const { id, created_at, ...fields } = g
      await client.query(`INSERT INTO goals (name,metric,target_value,timeframe,direction,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [fields.name, fields.metric, fields.target_value, fields.timeframe, fields.direction, fields.active, created_at])
      stats.goals++
    }

    await client.query('COMMIT')
    res.json({ success:true, stats })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

export default router
