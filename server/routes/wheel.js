import { Router } from 'express'
import pool from '../db.js'
import {
  SHARES_PER_CONTRACT, sharesFor, legNetPremium, sumLegPremium,
  rollupLots, bookShareExit, isCycleFlat, describeCycle, dte,
} from '../lib/wheelEngine.js'

const router = Router()

const today = () => new Date().toISOString().slice(0, 10)
const LEG_COLS = `id, date, ticker, option_type, strike, expiry, premium, close_cost,
  contracts, leg_status, wheel_cycle_id, rolled_from_id, needs_roll, notes, fees,
  status, pnl, account_id, strike_selection_snapshot`

/** The playbook entry every wheel leg is filed under. */
const WHEEL_STRATEGY = 'Wheel Play'

/**
 * Resolve — creating if absent — the user's "Wheel Play" playbook strategy, and
 * return its id so every leg this router writes is filed under it.
 *
 * Legs carry two independent markers: `strategy_tag = 'wheel'`, which is what
 * the Wheel tab filters on, and `strategy_id`, which is what the Playbook and
 * the per-strategy stats filter on. Setting only the first is what made the
 * Playbook's "Wheel Play" totals drift away from the Wheel tab's — legs entered
 * through the Wheel form were invisible to the Playbook. Keep both in sync.
 */
async function wheelStrategyId(client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM strategies WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [userId, WHEEL_STRATEGY]
  )
  if (rows[0]) return rows[0].id

  const { rows: [made] } = await client.query(
    `INSERT INTO strategies (name, description, user_id) VALUES ($1, $2, $3) RETURNING id`,
    [WHEEL_STRATEGY, 'Cash-secured puts → assignment → covered calls. Managed from the Wheel tab.', userId]
  )
  return made.id
}

// ─────────────────────────────────────────────────────────────────────────────
// Core state machinery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recompute a cycle's cached fields from its legs, lots and accumulators, then
 * auto-close it if it has gone flat.
 *
 * Closing correctly matters more than it looks: a cycle that fails to close
 * drags the previous run's realised premium into the next run's basis, which
 * makes the break-even line read artificially low and the safety flag lie.
 */
async function recomputeCycle(client, cycleId, { eventDate, closeReason, exitPrice } = {}) {
  const { rows: [cycle] } = await client.query('SELECT * FROM wheel_cycles WHERE id = $1', [cycleId])
  if (!cycle) return null

  const { rows: legs } = await client.query(
    'SELECT * FROM trades WHERE wheel_cycle_id = $1 ORDER BY id', [cycleId]
  )
  const { rows: lots } = await client.query(
    'SELECT * FROM share_lots WHERE wheel_cycle_id = $1 ORDER BY id', [cycleId]
  )

  const { shares: assigned, avgAssignedStrike } = rollupLots(lots)
  const shares     = assigned - cycle.shares_exited
  let netPremium   = sumLegPremium(legs) - cycle.premium_attributed
  let realized     = Number(cycle.realized_pnl)
  let attributed   = Number(cycle.premium_attributed)
  let status       = cycle.status
  let closedAt     = cycle.closed_at
  let reason       = closeReason ?? cycle.close_reason
  let exit         = exitPrice ?? cycle.exit_price

  // Flat and nothing outstanding → the run is over. Any premium not already
  // attributed to departed shares (expired CSPs, leftover credits) books now.
  if (status === 'active' && legs.length > 0 && isCycleFlat({ shares, legs })) {
    realized   += netPremium
    attributed += netPremium
    netPremium  = 0
    status      = 'closed'
    closedAt    = eventDate || today()
  }

  await client.query(`
    UPDATE wheel_cycles SET
      shares = $1, avg_assigned_strike = $2, net_premium = $3,
      premium_attributed = $4, realized_pnl = $5, status = $6,
      closed_at = $7, close_reason = $8, exit_price = $9, updated_at = NOW()
    WHERE id = $10
  `, [shares, assigned > 0 ? avgAssignedStrike : null,
      netPremium, attributed, realized, status, closedAt, reason, exit, cycleId])

  const { rows: [updated] } = await client.query('SELECT * FROM wheel_cycles WHERE id = $1', [cycleId])
  return updated
}

/** Find the active cycle for a ticker, creating one if the user is flat. */
async function ensureActiveCycle(client, { userId, ticker, date, accountId }) {
  const { rows } = await client.query(
    `SELECT * FROM wheel_cycles WHERE user_id = $1 AND ticker = $2 AND status = 'active'`,
    [userId, ticker]
  )
  if (rows[0]) return rows[0]

  const { rows: [created] } = await client.query(`
    INSERT INTO wheel_cycles (ticker, status, opened_at, account_id, user_id)
    VALUES ($1, 'active', $2, $3, $4) RETURNING *
  `, [ticker, date, accountId ?? null, userId])
  return created
}

/** Load a leg the user owns, or throw a 404-shaped error. */
async function getOwnedLeg(client, legId, userId) {
  const { rows } = await client.query(
    `SELECT * FROM trades WHERE id = $1 AND user_id = $2 AND strategy_tag = 'wheel'`,
    [legId, userId]
  )
  if (!rows[0]) { const e = new Error('Wheel leg not found'); e.status = 404; throw e }
  return rows[0]
}

/** Mark a leg resolved and book its realised premium as the row's P&L. */
async function resolveLeg(client, leg, legStatus, { closeCost = null } = {}) {
  const cost = closeCost == null ? leg.close_cost : closeCost
  // Same figure the cycle's net_premium uses, so the row's P&L and the basis
  // line can never tell two different stories about the same leg.
  const pnl  = legNetPremium({ premium: leg.premium, close_cost: cost, fees: leg.fees })
  await client.query(`
    UPDATE trades SET leg_status = $1, close_cost = $2, status = 'closed',
                      pnl = $3, needs_roll = false, updated_at = NOW()
    WHERE id = $4
  `, [legStatus, cost, pnl, leg.id])
}

/** Run a handler inside a transaction. */
async function tx(res, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return res.json(out)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  } finally {
    client.release()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/** Cycles with their legs, basis line and derived display fields. */
router.get('/cycles', async (req, res) => {
  try {
    const { status = 'all', account_id } = req.query
    const p = [req.userId]
    let where = 'c.user_id = $1'
    if (status === 'active' || status === 'closed') where += ` AND c.status = $${p.push(status)}`
    if (account_id) where += ` AND c.account_id = $${p.push(account_id)}`

    const { rows: cycles } = await pool.query(
      `SELECT * FROM wheel_cycles c WHERE ${where} ORDER BY c.status ASC, c.opened_at DESC, c.id DESC`, p
    )
    if (!cycles.length) return res.json([])

    const ids = cycles.map(c => c.id)
    const { rows: legs } = await pool.query(
      `SELECT ${LEG_COLS} FROM trades WHERE wheel_cycle_id = ANY($1::int[]) ORDER BY expiry ASC, id ASC`, [ids]
    )
    const { rows: lots } = await pool.query(
      `SELECT * FROM share_lots WHERE wheel_cycle_id = ANY($1::int[]) ORDER BY id`, [ids]
    )

    const t = today()
    res.json(cycles.map(c => ({
      ...describeCycle(c, legs.filter(l => l.wheel_cycle_id === c.id), t),
      legs: legs.filter(l => l.wheel_cycle_id === c.id),
      lots: lots.filter(l => l.wheel_cycle_id === c.id),
    })))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

/**
 * Daily dashboard: what is expiring soon, what is manually flagged, and the
 * open-position snapshot.
 *
 * v1 has no quote feed, so "needs attention" is expiry proximity plus the manual
 * flag — automatic ITM detection is the main v2 upgrade.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const days = Math.max(0, Number(req.query.days ?? 14))
    const t = today()

    const { rows: cycles } = await pool.query(
      `SELECT * FROM wheel_cycles WHERE user_id = $1 AND status = 'active' ORDER BY ticker`, [req.userId]
    )
    const { rows: legs } = await pool.query(
      `SELECT ${LEG_COLS} FROM trades
       WHERE user_id = $1 AND strategy_tag = 'wheel' AND leg_status = 'open'
       ORDER BY expiry ASC, id ASC`, [req.userId]
    )

    const byCycle = (id) => cycles.find(c => c.id === id) || null
    const positions = cycles.map(c => ({
      ...describeCycle(c, legs.filter(l => l.wheel_cycle_id === c.id), t),
      legs: legs.filter(l => l.wheel_cycle_id === c.id),
    }))

    const needsAttention = legs
      .map(l => {
        const d = l.expiry ? dte(l.expiry, t) : null
        const cycle = byCycle(l.wheel_cycle_id)
        const reasons = []
        if (d != null && d < 0) reasons.push('past expiry — mark the outcome')
        else if (d != null && d <= days) reasons.push(`expires in ${d} day${d === 1 ? '' : 's'}`)
        if (l.needs_roll) reasons.push('flagged for roll')
        return { ...l, dte: d, reasons, ticker: l.ticker,
                 basis: cycle ? describeCycle(cycle, [], t).basis : null }
      })
      .filter(l => l.reasons.length)
      .sort((a, b) => (a.dte ?? 9e9) - (b.dte ?? 9e9))

    res.json({ needs_attention: needsAttention, positions, window_days: days, today: t })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

/** Every leg with an expiry in the range — drives the calendar. */
router.get('/calendar', async (req, res) => {
  try {
    const { start, end } = req.query
    const p = [req.userId]
    let where = `t.user_id = $1 AND t.strategy_tag = 'wheel' AND t.expiry IS NOT NULL`
    if (start) where += ` AND t.expiry >= $${p.push(start)}`
    if (end)   where += ` AND t.expiry <= $${p.push(end)}`

    const { rows } = await pool.query(
      `SELECT ${LEG_COLS.split(',').map(c => `t.${c.trim()}`).join(', ')}, c.status AS cycle_status
       FROM trades t LEFT JOIN wheel_cycles c ON t.wheel_cycle_id = c.id
       WHERE ${where} ORDER BY t.expiry ASC, t.ticker ASC, t.strike ASC`, p
    )
    res.json(rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

/** Closed cycles, per-ticker lifetime totals, grand total. */
router.get('/history', async (req, res) => {
  try {
    const { rows: cycles } = await pool.query(
      `SELECT * FROM wheel_cycles WHERE user_id = $1 AND status = 'closed'
       ORDER BY closed_at DESC NULLS LAST, id DESC`, [req.userId]
    )

    let legs = []
    if (cycles.length) {
      const { rows } = await pool.query(
        `SELECT ${LEG_COLS} FROM trades WHERE wheel_cycle_id = ANY($1::int[]) ORDER BY id`,
        [cycles.map(c => c.id)]
      )
      legs = rows
    }

    const enriched = cycles.map(c => {
      const own = legs.filter(l => l.wheel_cycle_id === c.id)
      return {
        ...c,
        legs: own,
        leg_count: own.length,
        gross_premium: sumLegPremium(own),
        // The two components the broker never shows side by side.
        share_pnl: Number(c.realized_pnl) - sumLegPremium(own),
        snapshots: own.filter(l => l.strike_selection_snapshot).map(l => ({
          leg_id: l.id, strike: l.strike, expiry: l.expiry,
          snapshot: l.strike_selection_snapshot,
        })),
      }
    })

    const byTicker = {}
    for (const c of enriched) {
      const b = byTicker[c.ticker] ||= { ticker: c.ticker, cycles: 0, realized_pnl: 0, gross_premium: 0, share_pnl: 0, banked_premium: 0 }
      b.cycles        += 1
      b.realized_pnl  += Number(c.realized_pnl)
      b.gross_premium += c.gross_premium
      b.share_pnl     += c.share_pnl
    }

    /*
     * Premium already banked inside cycles that are still running.
     *
     * A long roll chain can settle a dozen legs and collect real money years
     * before the cycle itself goes flat. Counting only closed cycles hides all
     * of it: HL had $569.30 of settled premium sitting invisible because the
     * shares were still held. That is what made this tab disagree with the
     * Playbook's "Wheel Play" total, and the Playbook was the one telling the
     * truth.
     *
     * Only legs whose outcome is settled (`status = 'closed'`) count. An open
     * leg's premium is not yours yet — it can still be bought back at a loss —
     * and excluding it is also what keeps this total equal to the Playbook's,
     * which counts closed trades only.
     */
    const { rows: openCycles } = await pool.query(
      `SELECT * FROM wheel_cycles WHERE user_id = $1 AND status = 'active' ORDER BY ticker`, [req.userId]
    )
    let bankedTotal = 0
    if (openCycles.length) {
      const { rows: openLegs } = await pool.query(
        `SELECT ${LEG_COLS} FROM trades
          WHERE wheel_cycle_id = ANY($1::int[]) AND status = 'closed' ORDER BY id`,
        [openCycles.map(c => c.id)]
      )
      for (const c of openCycles) {
        const banked = sumLegPremium(openLegs.filter(l => l.wheel_cycle_id === c.id))
        if (!banked) continue
        bankedTotal += banked
        const b = byTicker[c.ticker] ||= { ticker: c.ticker, cycles: 0, realized_pnl: 0, gross_premium: 0, share_pnl: 0, banked_premium: 0 }
        b.banked_premium += banked
      }
    }

    const closedTotal = enriched.reduce((s, c) => s + Number(c.realized_pnl), 0)

    /*
     * Premium this tab counts that the journal deliberately does not.
     *
     * A leg opened with `already_logged` carries its premium (the basis needs it)
     * but stores `pnl = NULL`, because the same credit is already booked against
     * the original trade in the Trade Log. That makes this tab's lifetime figure
     * exceed the Playbook's "Wheel Play" total by exactly this amount — an
     * intentional gap, but one the user has to be told about or the two screens
     * look like they disagree. `status = 'closed' AND pnl IS NULL` is unique to
     * these legs: `resolveLeg` always writes a pnl, and open legs are not closed.
     */
    const { rows: excludedLegs } = await pool.query(
      `SELECT ${LEG_COLS} FROM trades
        WHERE user_id = $1 AND strategy_tag = 'wheel'
          AND status = 'closed' AND pnl IS NULL`, [req.userId]
    )
    const excludedPremium = sumLegPremium(excludedLegs)

    res.json({
      cycles: enriched,
      by_ticker: Object.values(byTicker)
        .sort((a, b) => (b.realized_pnl + b.banked_premium) - (a.realized_pnl + a.banked_premium)),
      total: closedTotal,
      banked_premium: bankedTotal,
      // Matches the Playbook's "Wheel Play" P&L — every settled wheel leg —
      // less `excluded_premium`, which the journal is counting on another row.
      lifetime_total: closedTotal + bankedTotal,
      excluded_premium: excludedPremium,
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Leg CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a wheel leg. Writes to `trades` — the same table as every other trade,
 * tagged `strategy_tag = 'wheel'`, so there is exactly one place the data lives.
 * `premium` is TOTAL dollars for the leg, positive for a sell-to-open credit.
 */
router.post('/legs', async (req, res) => tx(res, async (client) => {
  const {
    ticker, option_type, strike, expiry, premium, contracts,
    date = today(), fees = 0, notes = null, account_id = null,
    rolled_from_id = null, strike_selection_snapshot = null,
  } = req.body

  if (!ticker)                                  throw badRequest('Ticker is required')
  if (!['put', 'call'].includes(option_type))   throw badRequest('option_type must be put or call')
  if (!(Number(strike) > 0))                    throw badRequest('Strike must be greater than zero')
  if (!expiry)                                  throw badRequest('Expiry is required')
  if (!(Number(contracts) >= 1))                throw badRequest('Contracts must be at least 1')
  if (premium == null || Number.isNaN(Number(premium))) throw badRequest('Premium is required')

  const sym   = String(ticker).trim().toUpperCase()
  const qty   = sharesFor(contracts)
  const total = Number(premium)
  const cycle = await ensureActiveCycle(client, { userId: req.userId, ticker: sym, date, accountId: account_id })

  // A covered call against no shares is almost always a data-entry slip, and it
  // would corrupt the basis line. Refuse it rather than absorb it.
  if (option_type === 'call' && cycle.shares <= 0) {
    throw badRequest(`No assigned ${sym} shares on the active cycle — a covered call needs shares behind it. Record the put assignment first.`)
  }
  if (option_type === 'call' && qty > cycle.shares) {
    throw badRequest(`${contracts} contract(s) covers ${qty} shares but only ${cycle.shares} are held.`)
  }

  const strategyId = await wheelStrategyId(client, req.userId)

  const { rows: [row] } = await client.query(`
    INSERT INTO trades (
      date, ticker, direction, entry_price, position_size, fees, notes, account_id,
      status, entry_mode, instrument_type, strategy_tag, option_type, strike, expiry,
      premium, contracts, leg_status, wheel_cycle_id, rolled_from_id,
      strike_selection_snapshot, strategy_id, user_id
    ) VALUES ($1,$2,'short',$3,$4,$5,$6,$7,'open','wheel_option','option','wheel',
              $8,$9,$10,$11,$12,'open',$13,$14,$15,$16,$17)
    RETURNING *
  `, [
    date, sym, total / qty, qty, fees, notes, account_id ?? cycle.account_id,
    option_type, Number(strike), expiry, total, Math.round(Number(contracts)),
    cycle.id, rolled_from_id, strike_selection_snapshot, strategyId, req.userId,
  ])

  const updated = await recomputeCycle(client, cycle.id, { eventDate: date })
  return { leg: row, cycle: updated }
}))

/**
 * Seed a cycle from shares you were ALREADY assigned — before you started using
 * this tab, or on a run whose put was never logged here.
 *
 * Rather than special-casing a share-only cycle, this reconstructs the put that
 * must have existed: a leg at the assignment strike, already marked `assigned`,
 * carrying whatever premium you collected on it. That is exactly the row the
 * tab would hold had you used it from the start, so every downstream
 * calculation — basis, rollups, call-away, history — works unchanged.
 *
 * Without this there is no way to write a covered call against pre-existing
 * shares: the covered-call guard correctly refuses a call with no shares behind
 * it, which leaves an honest position permanently unrecordable.
 *
 * `already_logged` guards the one place this feature can double-count P&L. The
 * put being reconstructed predates the Wheel tab, so it is very likely already
 * in the Trade Log as an ordinary trade carrying its own `pnl`. Writing a second
 * row with the same premium would add that credit to the dashboard total twice.
 * When the flag is set the leg is stored with `pnl = NULL`: every stats query
 * either sums `pnl` (NULL is skipped) or filters on `pnl IS NOT NULL`, so the
 * premium disappears from the dashboard while `premium` — which is what the
 * basis engine reads — stays intact and the Wheel tab's own totals are unchanged.
 */
router.post('/cycles', async (req, res) => tx(res, async (client) => {
  const {
    ticker, shares, assigned_strike, assigned_at = today(),
    premium_collected = 0, fees = 0, notes = null, account_id = null,
    already_logged = false,
  } = req.body

  if (!ticker)                        throw badRequest('Ticker is required')
  if (!(Number(assigned_strike) > 0)) throw badRequest('Assignment strike is required')
  const qty = Math.round(Number(shares))
  if (!(qty > 0))                     throw badRequest('Share count is required')
  if (qty % SHARES_PER_CONTRACT !== 0) {
    throw badRequest(`Assignment comes in round lots — ${qty} is not a multiple of ${SHARES_PER_CONTRACT}.`)
  }

  const sym = String(ticker).trim().toUpperCase()
  const { rows: [clash] } = await client.query(
    `SELECT id FROM wheel_cycles WHERE user_id = $1 AND ticker = $2 AND status = 'active'`,
    [req.userId, sym]
  )
  if (clash) {
    throw badRequest(`There is already an active ${sym} cycle (#${clash.id}). Record the assignment against that cycle instead of starting a second one.`)
  }

  const { rows: [cycle] } = await client.query(`
    INSERT INTO wheel_cycles (ticker, status, opened_at, account_id, user_id, notes)
    VALUES ($1, 'active', $2, $3, $4, $5) RETURNING *
  `, [sym, assigned_at, account_id, req.userId,
      notes ?? 'Opened from an existing assigned position.'])

  const contracts = qty / SHARES_PER_CONTRACT
  const total     = Number(premium_collected) || 0
  const dupe      = Boolean(already_logged)

  const { rows: [leg] } = await client.query(`
    INSERT INTO trades (
      date, ticker, direction, entry_price, position_size, fees, notes, account_id,
      status, entry_mode, instrument_type, strategy_tag, option_type, strike, expiry,
      premium, contracts, leg_status, wheel_cycle_id, pnl, strategy_id, user_id
    ) VALUES ($1,$2,'short',$3,$4,$5,$6,$7,'closed','wheel_option','option','wheel',
              'put',$8,$1,$9,$10,'assigned',$11,$12,$13,$14)
    RETURNING *
  `, [assigned_at, sym, total / qty, qty, fees,
      dupe
        ? 'Assignment recorded retrospectively — this put predates the Wheel tab and is already logged in the Trade Log, so its premium is excluded from dashboard P&L to avoid double-counting.'
        : 'Assignment recorded retrospectively — this put predates the Wheel tab.',
      account_id, Number(assigned_strike), total, contracts, cycle.id,
      dupe ? null : total - Number(fees || 0),
      await wheelStrategyId(client, req.userId), req.userId])

  await client.query(`
    INSERT INTO share_lots (wheel_cycle_id, ticker, shares, assigned_strike, assigned_at, trade_id, user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [cycle.id, sym, qty, Number(assigned_strike), assigned_at, leg.id, req.userId])

  const updated = await recomputeCycle(client, cycle.id, { eventDate: assigned_at })
  return { cycle: updated, leg }
}))

/** Edit an unresolved leg's details. */
router.put('/legs/:id', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  if (leg.leg_status !== 'open') {
    throw badRequest(`This leg is already marked "${leg.leg_status}". Reopen it by deleting and re-entering.`)
  }

  const f = {
    strike:    req.body.strike    ?? leg.strike,
    expiry:    req.body.expiry    ?? leg.expiry,
    premium:   req.body.premium   ?? leg.premium,
    contracts: req.body.contracts ?? leg.contracts,
    date:      req.body.date      ?? leg.date,
    fees:      req.body.fees      ?? leg.fees,
    notes:     req.body.notes     ?? leg.notes,
  }
  const qty = sharesFor(f.contracts)

  await client.query(`
    UPDATE trades SET strike=$1, expiry=$2, premium=$3, contracts=$4, date=$5,
      fees=$6, notes=$7, position_size=$8, entry_price=$9, updated_at=NOW()
    WHERE id=$10
  `, [f.strike, f.expiry, f.premium, Math.round(Number(f.contracts)), f.date,
      f.fees, f.notes, qty, Number(f.premium) / qty, leg.id])

  const cycle = await recomputeCycle(client, leg.wheel_cycle_id)
  const { rows: [row] } = await client.query('SELECT * FROM trades WHERE id = $1', [leg.id])
  return { leg: row, cycle }
}))

/**
 * Delete a leg. Assignment lots created by this leg go with it, and the cycle is
 * recomputed — so a mis-entered leg can be removed without leaving the basis line
 * quietly wrong.
 */
router.delete('/legs/:id', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  const cycleId = leg.wheel_cycle_id

  if (leg.leg_status === 'assigned' || leg.leg_status === 'called_away') {
    const { rows: [cycle] } = await client.query('SELECT * FROM wheel_cycles WHERE id = $1', [cycleId])
    if (cycle && cycle.status === 'closed') {
      throw badRequest('That cycle is already closed. Deleting a leg from it would rewrite booked P&L — delete the cycle instead if it was entered in error.')
    }
  }

  await client.query('DELETE FROM share_lots WHERE trade_id = $1', [leg.id])
  await client.query('DELETE FROM trades WHERE id = $1 AND user_id = $2', [leg.id, req.userId])

  if (!cycleId) return { deleted: true, cycle: null }

  // Removing the only leg leaves an empty shell that would otherwise sit in
  // Holdings forever and block a fresh cycle on the same ticker (the partial
  // unique index allows just one active cycle per ticker).
  const { rows: [remaining] } = await client.query(
    'SELECT COUNT(*)::int AS legs FROM trades WHERE wheel_cycle_id = $1', [cycleId]
  )
  const { rows: [lots] } = await client.query(
    'SELECT COUNT(*)::int AS lots FROM share_lots WHERE wheel_cycle_id = $1', [cycleId]
  )
  if (remaining.legs === 0 && lots.lots === 0) {
    await client.query('DELETE FROM wheel_cycles WHERE id = $1 AND user_id = $2', [cycleId, req.userId])
    return { deleted: true, cycle: null, cycle_removed: true }
  }

  return { deleted: true, cycle: await recomputeCycle(client, cycleId) }
}))

/** Manual "needs roll" flag — v1's stand-in for automatic ITM detection. */
router.post('/legs/:id/flag', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  const { rows: [row] } = await client.query(
    'UPDATE trades SET needs_roll = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [Boolean(req.body.needs_roll), leg.id]
  )
  return { leg: row }
}))

/** Attach or replace the strike-selection snapshot on a leg (spec §9.11). */
router.put('/legs/:id/snapshot', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  const { rows: [row] } = await client.query(
    'UPDATE trades SET strike_selection_snapshot = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [req.body.snapshot ?? null, leg.id]
  )
  return { leg: row }
}))

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle events (spec §7) — outcomes, not new trades
// ─────────────────────────────────────────────────────────────────────────────

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e }

function assertOpen(leg) {
  if (leg.leg_status !== 'open') throw badRequest(`Leg is already marked "${leg.leg_status}".`)
}

/** Expired worthless — keep the premium. */
router.post('/legs/:id/expire', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  assertOpen(leg)
  await resolveLeg(client, leg, 'expired')
  const cycle = await recomputeCycle(client, leg.wheel_cycle_id, { eventDate: req.body.date || leg.expiry })
  return { cycle }
}))

/** Put assigned — shares arrive at the strike. */
router.post('/legs/:id/assign', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  assertOpen(leg)
  if (leg.option_type !== 'put') throw badRequest('Only a put can be assigned. A call that finished in the money is "called away".')

  const when = req.body.date || leg.expiry || today()
  await client.query(`
    INSERT INTO share_lots (wheel_cycle_id, ticker, shares, assigned_strike, assigned_at, trade_id, user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [leg.wheel_cycle_id, leg.ticker, sharesFor(leg.contracts), leg.strike, when, leg.id, req.userId])

  await resolveLeg(client, leg, 'assigned')
  const cycle = await recomputeCycle(client, leg.wheel_cycle_id, { eventDate: when })
  return { cycle }
}))

/**
 * Call assigned — shares leave at the call strike.
 *
 * Supports a partial call-away (holding 200, one contract written): premium is
 * attributed pro rata to the shares that leave, which leaves the remaining
 * shares' effective basis unchanged. The cycle only closes once shares hit zero.
 */
router.post('/legs/:id/call-away', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  assertOpen(leg)
  if (leg.option_type !== 'call') throw badRequest('Only a call can be called away.')

  const { rows: [cycle] } = await client.query('SELECT * FROM wheel_cycles WHERE id = $1', [leg.wheel_cycle_id])
  if (!cycle || cycle.shares <= 0) throw badRequest('No shares held on this cycle to be called away.')

  const when = req.body.date || leg.expiry || today()
  // Resolve the leg FIRST so its premium is inside net_premium before the
  // pro-rata attribution runs — the premium of the call that caused the exit
  // belongs to the shares leaving.
  await resolveLeg(client, leg, 'called_away')
  await recomputeCycle(client, cycle.id)

  const { rows: [fresh] } = await client.query('SELECT * FROM wheel_cycles WHERE id = $1', [cycle.id])
  const exit = bookShareExit(
    { shares: fresh.shares, avgAssignedStrike: fresh.avg_assigned_strike, netPremium: fresh.net_premium },
    { exitPrice: Number(leg.strike), sharesOut: sharesFor(leg.contracts) }
  )

  await client.query(`
    UPDATE wheel_cycles SET shares_exited = shares_exited + $1,
      premium_attributed = premium_attributed + $2,
      realized_pnl = realized_pnl + $3, updated_at = NOW()
    WHERE id = $4
  `, [exit.sharesOut, exit.premiumAttributed, exit.bookedPnl, cycle.id])

  const updated = await recomputeCycle(client, cycle.id, {
    eventDate: when,
    closeReason: exit.flat ? 'called_away' : undefined,
    exitPrice:   exit.flat ? Number(leg.strike) : undefined,
  })
  return { cycle: updated, booked: exit.bookedPnl, shares_out: exit.sharesOut }
}))

/**
 * Roll: buy the current leg back and sell a new one.
 * The buy-to-close debit is captured on the closed leg as `close_cost`, so a roll
 * that is a net debit correctly drags net_premium down instead of quietly
 * inflating it.
 */
router.post('/legs/:id/roll', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  assertOpen(leg)

  const { close_cost, strike, expiry, premium, contracts = leg.contracts, date = today() } = req.body
  if (!(Number(close_cost) >= 0)) throw badRequest('Buy-to-close cost is required (enter 0 if it expired into the roll for nothing).')
  if (!(Number(strike) > 0))      throw badRequest('New strike is required')
  if (!expiry)                    throw badRequest('New expiry is required')
  if (premium == null || Number.isNaN(Number(premium))) throw badRequest('New premium is required')

  await resolveLeg(client, leg, 'rolled', { closeCost: Number(close_cost) })

  const qty   = sharesFor(contracts)
  const total = Number(premium)
  const { rows: [row] } = await client.query(`
    INSERT INTO trades (
      date, ticker, direction, entry_price, position_size, fees, account_id,
      status, entry_mode, instrument_type, strategy_tag, option_type, strike, expiry,
      premium, contracts, leg_status, wheel_cycle_id, rolled_from_id, strategy_id, user_id
    ) VALUES ($1,$2,'short',$3,$4,0,$5,'open','wheel_option','option','wheel',
              $6,$7,$8,$9,$10,'open',$11,$12,$13,$14)
    RETURNING *
  `, [date, leg.ticker, total / qty, qty, leg.account_id, leg.option_type,
      Number(strike), expiry, total, Math.round(Number(contracts)),
      leg.wheel_cycle_id, leg.id, await wheelStrategyId(client, req.userId), req.userId])

  const cycle = await recomputeCycle(client, leg.wheel_cycle_id, { eventDate: date })
  return { leg: row, cycle }
}))

/** Buy to close without rolling. */
router.post('/legs/:id/close', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  assertOpen(leg)
  const cost = Number(req.body.close_cost)
  if (!(cost >= 0)) throw badRequest('Buy-to-close cost is required')

  await resolveLeg(client, leg, 'closed', { closeCost: cost })
  const cycle = await recomputeCycle(client, leg.wheel_cycle_id, { eventDate: req.body.date || today() })
  return { cycle }
}))

/** Sell the shares outright — abandon the wheel at the market price. */
router.post('/cycles/:id/sell-shares', async (req, res) => tx(res, async (client) => {
  const { rows: [cycle] } = await client.query(
    'SELECT * FROM wheel_cycles WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
  )
  if (!cycle) { const e = new Error('Cycle not found'); e.status = 404; throw e }
  if (cycle.shares <= 0) throw badRequest('This cycle holds no shares.')

  const price = Number(req.body.price)
  if (!(price > 0)) throw badRequest('Sale price is required')
  const when = req.body.date || today()
  const qty  = req.body.shares ? Math.min(Math.round(Number(req.body.shares)), cycle.shares) : cycle.shares

  const exit = bookShareExit(
    { shares: cycle.shares, avgAssignedStrike: cycle.avg_assigned_strike, netPremium: cycle.net_premium },
    { exitPrice: price, sharesOut: qty }
  )

  // Any option still open against shares that just left is now naked — surface it
  // rather than letting the position drift out of sync with reality.
  const { rows: openLegs } = await client.query(
    `SELECT id FROM trades WHERE wheel_cycle_id = $1 AND leg_status = 'open' AND option_type = 'call'`,
    [cycle.id]
  )
  if (exit.flat && openLegs.length) {
    throw badRequest(`${openLegs.length} covered call(s) are still open on this cycle. Close or roll them before selling the shares.`)
  }

  await client.query(`
    UPDATE wheel_cycles SET shares_exited = shares_exited + $1,
      premium_attributed = premium_attributed + $2,
      realized_pnl = realized_pnl + $3, updated_at = NOW()
    WHERE id = $4
  `, [exit.sharesOut, exit.premiumAttributed, exit.bookedPnl, cycle.id])

  const updated = await recomputeCycle(client, cycle.id, {
    eventDate: when,
    closeReason: exit.flat ? 'sold' : undefined,
    exitPrice:   exit.flat ? price : undefined,
  })
  return { cycle: updated, booked: exit.bookedPnl, shares_out: exit.sharesOut }
}))

/** Delete a whole cycle and every leg attached to it. */
router.delete('/cycles/:id', async (req, res) => tx(res, async (client) => {
  const { rows: [cycle] } = await client.query(
    'SELECT * FROM wheel_cycles WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
  )
  if (!cycle) { const e = new Error('Cycle not found'); e.status = 404; throw e }
  await client.query('DELETE FROM trades WHERE wheel_cycle_id = $1 AND user_id = $2', [cycle.id, req.userId])
  await client.query('DELETE FROM wheel_cycles WHERE id = $1', [cycle.id])
  return { deleted: true }
}))

export default router
export { SHARES_PER_CONTRACT }
