import { Router } from 'express'
import pool from '../db.js'
import { evaluateGate } from '../lib/gateVerdict.js'

const router = Router()

/**
 * The NY trading date. gate_checks.session_date has to line up with trades.date
 * (TEXT 'YYYY-MM-DD') for the "same session" link picker to work, and trades
 * carry no entry time, so the date is the only join key available. Derived from
 * the server clock in America/New_York — never from the browser, which may be
 * on a different day when he checks a setup late in the session.
 */
function nySessionDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** Slugify a free-text contested factor into a stable key. Mirrors the migration. */
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const asArray = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim() !== '') : []

/**
 * Active factors for this user: system defaults plus the user's own rows, with a
 * user row of the same kind+key shadowing the system one so a label or hotkey can
 * be overridden without touching the shared defaults.
 */
async function loadFactors(userId) {
  const r = await pool.query(`
    SELECT DISTINCT ON (kind, key)
           id, key, label, kind, required, level_based, hotkey, sort_order, user_id
    FROM gate_factors
    WHERE active = true AND (user_id IS NULL OR user_id = $1)
    ORDER BY kind, key, user_id NULLS LAST
  `, [userId])
  return r.rows.sort((a, b) => (a.sort_order - b.sort_order) || a.key.localeCompare(b.key))
}

// ── Factors (the config-driven kill / contested / confluence lists) ──────────
router.get('/factors', async (req, res) => {
  try {
    res.json(await loadFactors(req.userId))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Add a contested factor to the tick-list ─────────────────────────────────
// Called when a free-text contested factor is used, so the list grows itself and
// the next check is a tick instead of typing.
router.post('/factors', async (req, res) => {
  try {
    const { label, kind = 'contested' } = req.body
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'label required' })
    if (!['contested', 'kill'].includes(kind)) {
      // Confluences are fixed at three by the scoring model — adding a fourth
      // would move the ceiling without moving the gate.
      return res.status(400).json({ error: 'Only contested and kill factors can be added' })
    }
    const key = slugify(label)
    if (!key) return res.status(400).json({ error: 'label must contain letters or digits' })

    const r = await pool.query(`
      INSERT INTO gate_factors (key, label, kind, sort_order, user_id)
      VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 10 FROM gate_factors WHERE kind = $3), 100), $4)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [key, String(label).trim(), kind, req.userId])

    // Already present (system default or previously added) — hand back the existing row.
    if (!r.rows[0]) {
      const existing = await pool.query(
        `SELECT * FROM gate_factors WHERE kind=$1 AND key=$2 AND (user_id IS NULL OR user_id=$3) LIMIT 1`,
        [kind, key, req.userId]
      )
      return res.json(existing.rows[0] ?? { key, label, kind })
    }
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Remove a factor from the tick-list ───────────────────────────────────────
// Only the user's own rows. System defaults (the kills and the three
// confluences) are deactivated per-user rather than deleted, so one user tidying
// their list can never remove a kill for everyone.
router.delete('/factors/:id', async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM gate_factors WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.userId]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Factor not found, or it is a system default' })
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Log a scenario ───────────────────────────────────────────────────────────
// Explicit, not auto-saved. Ticking boxes shows a live verdict but writes
// nothing; the row lands only when "Log scenario" is pressed. That keeps the
// day's log to the setups he actually assessed rather than every stray click.
//
// `took_trade` records what he did in the face of the verdict, and `note` is his
// reason in his own words — the two things the tick-list can't infer.
router.post('/checks', async (req, res) => {
  try {
    const factors = await loadFactors(req.userId)
    const confluences = asArray(req.body.confluences)
    const contested   = asArray(req.body.contested)
    const kills       = asArray(req.body.kills)
    const v = evaluateGate({ confluences, contested, kills }, factors)

    const r = await pool.query(`
      INSERT INTO gate_checks
        (user_id, instrument, session_date, confluences, contested, kills,
         net_score, grade, verdict, reason, note, took_trade)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      req.userId,
      (req.body.instrument || 'NQ').toUpperCase(),
      nySessionDate(),
      confluences, contested, kills,
      v.net_score, v.grade, v.verdict, v.reason,
      req.body.note || null,
      typeof req.body.took_trade === 'boolean' ? req.body.took_trade : null,
    ])
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Edit a logged scenario ───────────────────────────────────────────────────
// For fixing a mis-click after the fact. created_at is deliberately never
// updated — it is the replay timestamp.
router.put('/checks/:id', async (req, res) => {
  try {
    const own = await pool.query('SELECT id FROM gate_checks WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!own.rows[0]) return res.status(404).json({ error: 'Check not found' })

    const factors = await loadFactors(req.userId)
    const confluences = asArray(req.body.confluences)
    const contested   = asArray(req.body.contested)
    const kills       = asArray(req.body.kills)
    const v = evaluateGate({ confluences, contested, kills }, factors)

    const r = await pool.query(`
      UPDATE gate_checks
      SET instrument=$1, confluences=$2, contested=$3, kills=$4,
          net_score=$5, grade=$6, verdict=$7, reason=$8,
          note=$9, took_trade=$10, updated_at=NOW()
      WHERE id=$11 AND user_id=$12
      RETURNING *
    `, [
      (req.body.instrument || 'NQ').toUpperCase(),
      confluences, contested, kills,
      v.net_score, v.grade, v.verdict, v.reason,
      req.body.note || null,
      typeof req.body.took_trade === 'boolean' ? req.body.took_trade : null,
      req.params.id, req.userId,
    ])
    res.json(r.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Delete a check ───────────────────────────────────────────────────────────
router.delete('/checks/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM gate_checks WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.userId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Check not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── List checks ──────────────────────────────────────────────────────────────
// `session_date` scopes the link picker: checks from the same NY calendar day as
// the trade. `unlinked=true` hides checks already attached to another trade.
router.get('/checks', async (req, res) => {
  try {
    const { from, to, session_date, unlinked, limit = 200 } = req.query
    const p = [req.userId]
    const w = ['g.user_id = $1']
    if (session_date) w.push(`g.session_date = $${p.push(session_date)}`)
    if (from)         w.push(`g.session_date >= $${p.push(from)}`)
    if (to)           w.push(`g.session_date <= $${p.push(to)}`)
    if (unlinked === 'true') w.push('g.linked_trade_id IS NULL')

    const r = await pool.query(`
      SELECT g.*, t.ticker AS linked_ticker, t.pnl AS linked_pnl, t.r_multiple AS linked_r
      FROM gate_checks g
      LEFT JOIN trades t ON g.linked_trade_id = t.id
      WHERE ${w.join(' AND ')}
      ORDER BY g.created_at DESC
      LIMIT $${p.push(Math.min(Number(limit) || 200, 500))}
    `, p)
    res.json(r.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Link / unlink a check to a trade ─────────────────────────────────────────
// Linking a NO_TRADE check is what makes the trade a rulebreak. It is never
// blocked — an accurate record beats enforcement.
router.post('/checks/:id/link', async (req, res) => {
  try {
    const { trade_id } = req.body
    const own = await pool.query('SELECT id FROM gate_checks WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!own.rows[0]) return res.status(404).json({ error: 'Check not found' })

    if (trade_id == null) {
      const r = await pool.query(
        'UPDATE gate_checks SET linked_trade_id=NULL, updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',
        [req.params.id, req.userId]
      )
      return res.json(r.rows[0])
    }

    const trade = await pool.query('SELECT id FROM trades WHERE id=$1 AND user_id=$2', [trade_id, req.userId])
    if (!trade.rows[0]) return res.status(404).json({ error: 'Trade not found' })

    // One check per trade (enforced by a partial unique index). Clear any prior
    // link to this trade first so re-linking is idempotent rather than a 23505.
    await pool.query(
      'UPDATE gate_checks SET linked_trade_id=NULL, updated_at=NOW() WHERE linked_trade_id=$1 AND user_id=$2 AND id <> $3',
      [trade_id, req.userId, req.params.id]
    )
    const r = await pool.query(
      'UPDATE gate_checks SET linked_trade_id=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *',
      [trade_id, req.params.id, req.userId]
    )
    res.json(r.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Review ───────────────────────────────────────────────────────────────────
// The compact review view: verdict counts, trades taken against NO TRADE, the
// kill factors that show up most, and R outcomes split by rulebreak vs passed.
router.get('/review', async (req, res) => {
  try {
    const { from, to } = req.query
    const p = [req.userId]
    const w = ['g.user_id = $1']
    if (from) w.push(`g.session_date >= $${p.push(from)}`)
    if (to)   w.push(`g.session_date <= $${p.push(to)}`)
    const where = w.join(' AND ')

    const [verdictsR, killsR, outcomesR, unlinkedR] = await Promise.all([
      pool.query(`
        SELECT g.verdict, g.grade, COUNT(*)::int AS count,
               COUNT(g.linked_trade_id)::int                        AS linked,
               COUNT(*) FILTER (WHERE g.took_trade IS TRUE)::int     AS took
        FROM gate_checks g WHERE ${where}
        GROUP BY g.verdict, g.grade
      `, p),

      pool.query(`
        SELECT k AS kill_key, COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE g.took_trade IS TRUE)::int AS taken_anyway
        FROM gate_checks g
        CROSS JOIN LATERAL unnest(g.kills) AS k
        WHERE ${where}
        GROUP BY k ORDER BY count DESC
      `, p),

      // R outcomes split by whether the linked check said NO TRADE. Only closed
      // trades with an r_multiple — an open trade has no outcome to average.
      pool.query(`
        SELECT (g.verdict = 'NO_TRADE') AS is_rulebreak,
               COUNT(*)::int                                        AS trades,
               COUNT(t.r_multiple)::int                             AS with_r,
               AVG(t.r_multiple)                                    AS avg_r,
               SUM(t.r_multiple)                                    AS total_r,
               SUM(t.pnl)                                           AS total_pnl,
               COUNT(*) FILTER (WHERE t.pnl > 0)::int               AS wins,
               COUNT(*) FILTER (WHERE t.pnl <= 0)::int              AS losses
        FROM gate_checks g
        JOIN trades t ON t.id = g.linked_trade_id AND t.status = 'closed'
        WHERE ${where}
        GROUP BY 1
      `, p),

      // Trades in the window with no gate check at all — the gate was skipped.
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM trades t
        WHERE t.user_id = $1
          AND t.strategy_tag IS DISTINCT FROM 'wheel'
          ${from ? `AND t.date >= $2` : ''} ${to ? `AND t.date <= $${from ? 3 : 2}` : ''}
          AND NOT EXISTS (SELECT 1 FROM gate_checks g WHERE g.linked_trade_id = t.id)
      `, [req.userId, ...(from ? [from] : []), ...(to ? [to] : [])]),
    ])

    const factors  = await loadFactors(req.userId)
    const killName = (key) => factors.find(f => f.kind === 'kill' && f.key === key)?.label ?? key

    // `taken`/`rulebreaks` come from took_trade — what he said he did when he
    // logged it. `linked_*` come from an actual trade row being attached, which
    // is what the R outcomes below are grouped by. The two can differ: a taken
    // trade he never got round to linking counts in the first pair, not the second.
    const totals = {
      total: 0, enter: 0, no_trade: 0, a_plus: 0, a: 0,
      taken: 0, rulebreaks: 0, linked: 0, linked_rulebreaks: 0,
    }
    for (const row of verdictsR.rows) {
      totals.total  += row.count
      totals.taken  += row.took
      totals.linked += row.linked
      if (row.verdict === 'ENTER') {
        totals.enter += row.count
        if (row.grade === 'A+') totals.a_plus += row.count
        if (row.grade === 'A')  totals.a      += row.count
      } else {
        totals.no_trade          += row.count
        totals.rulebreaks        += row.took     // taken against a NO TRADE verdict
        totals.linked_rulebreaks += row.linked
      }
    }

    const group = (flag) => {
      const row = outcomesR.rows.find(r => r.is_rulebreak === flag)
      if (!row) return { trades: 0, with_r: 0, avg_r: null, total_r: null, total_pnl: null, wins: 0, losses: 0, win_rate: null }
      const closed = row.wins + row.losses
      return {
        ...row,
        avg_r:     row.avg_r     != null ? Number(row.avg_r)     : null,
        total_r:   row.total_r   != null ? Number(row.total_r)   : null,
        total_pnl: row.total_pnl != null ? Number(row.total_pnl) : null,
        win_rate:  closed > 0 ? (row.wins / closed) * 100 : null,
      }
    }

    res.json({
      from: from ?? null,
      to:   to   ?? null,
      totals,
      kills: killsR.rows.map(r => ({ ...r, label: killName(r.kill_key) })),
      outcomes: { rulebreak: group(true), passed: group(false) },
      ungated_trades: unlinkedR.rows[0]?.count ?? 0,
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
