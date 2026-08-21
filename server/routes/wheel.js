import { Router } from 'express'
import pool from '../db.js'
import {
  SHARES_PER_CONTRACT, sharesFor, legNetPremium, sumLegPremium, legPnl, settledPremium,
  rollupLots, bookShareExit, isCycleFlat, describeCycle, dte, effectiveBasis,
} from '../lib/wheelEngine.js'

const router = Router()

const today = () => new Date().toISOString().slice(0, 10)

/** Round to cents — fee arithmetic is money, and 0.1 + 0.2 is not 0.3. */
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100

/**
 * Validate a commission coming off the wire. Absent means zero (an older client,
 * or a broker that genuinely charges nothing), but a negative or non-numeric fee
 * is a bug that would silently INFLATE the basis, so it is refused outright.
 */
function feeAmount(v, label = 'Fees') {
  if (v == null || v === '') return 0
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) {
    const e = new Error(`${label} must be a number of dollars, zero or more.`)
    e.status = 400
    throw e
  }
  return round2(n)
}
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

  // Leg P&L is DERIVED here, not accumulated at the point of each event, so a
  // roll chain can never be left booking the wrong number after a leg is edited
  // or deleted. `legPnl` defers a rolled leg and books the whole chain on the leg
  // that ends it — see its doc comment for why a roll must not book on its own.
  const pnlByLeg = legPnl(legs)
  for (const leg of legs) {
    const next = pnlByLeg.get(leg.id) ?? null
    const curr = leg.pnl == null ? null : Number(leg.pnl)
    if (next === curr) continue
    await client.query('UPDATE trades SET pnl = $1, updated_at = NOW() WHERE id = $2', [next, leg.id])
    leg.pnl = next
  }

  const { shares: assigned, avgAssignedStrike } = rollupLots(lots)
  const shares     = assigned - cycle.shares_exited
  // `retained_share_gain` is profit from basis-reducing partial sales that was
  // deliberately NOT booked — it lives in the running premium so it keeps
  // pulling the break-even line down. See wheel_migration_02.sql.
  let netPremium   = sumLegPremium(legs) - cycle.premium_attributed + Number(cycle.retained_share_gain ?? 0)
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

/**
 * Mark a leg resolved and book its realised premium as the row's P&L.
 *
 * `closeFees` is the commission paid to GET OUT — the buy-to-close ticket, or the
 * broker's assignment/exercise charge. It is ADDED to whatever the leg already
 * carries from its opening order, because `trades.fees` is the leg's lifetime
 * commission, not a per-event one. Skipping it is not a rounding matter: an
 * unrecorded round-trip commission reads the basis low by exactly that amount,
 * in the direction that makes a marginal strike look safer than it is.
 *
 * A roll books NOTHING here: the position continues in the leg that replaces
 * this one, so `pnl` is left NULL and the realised premium is carried forward to
 * whichever leg ends the chain. The provisional value written for every other
 * outcome is finalised moments later by `recomputeCycle`, which owns leg P&L —
 * it is the same figure unless this leg is itself the end of a roll chain, in
 * which case the chain's earlier legs are added there.
 */
async function resolveLeg(client, leg, legStatus, { closeCost = null, closeFees = 0 } = {}) {
  const cost = closeCost == null ? leg.close_cost : closeCost
  const fees = round2(Number(leg.fees || 0) + feeAmount(closeFees))
  // Same figure the cycle's net_premium uses, so the row's P&L and the basis
  // line can never tell two different stories about the same leg.
  const pnl  = legStatus === 'rolled'
    ? null
    : legNetPremium({ premium: leg.premium, close_cost: cost, fees })
  await client.query(`
    UPDATE trades SET leg_status = $1, close_cost = $2, status = 'closed',
                      pnl = $3, fees = $4, needs_roll = false, updated_at = NOW()
    WHERE id = $5
  `, [legStatus, cost, pnl, fees, leg.id])
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
     *
     * `settledPremium` rather than `sumLegPremium` for the same reason: a leg
     * that has been rolled is settled on paper but its money is not, because the
     * position continues. Summing raw premium would report the buy-to-close
     * debit now AND the chain's total again when it ends, and would disagree with
     * the Playbook, which sees the deferred leg's NULL P&L as nothing.
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
        const banked = settledPremium(openLegs.filter(l => l.wheel_cycle_id === c.id))
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
     * these legs once rolled legs are excluded — those are also closed with a
     * NULL P&L, but theirs is deferred into a live chain rather than journalled
     * on another row, and counting them here would report money as missing from
     * the dashboard that is merely not booked yet.
     */
    const { rows: excludedLegs } = await pool.query(
      `SELECT ${LEG_COLS} FROM trades
        WHERE user_id = $1 AND strategy_tag = 'wheel'
          AND status = 'closed' AND pnl IS NULL
          AND leg_status IS DISTINCT FROM 'rolled'`, [req.userId]
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

  const openFees = feeAmount(fees, 'Commission')
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
    date, sym, total / qty, qty, openFees, notes, account_id ?? cycle.account_id,
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

  const seedFees = feeAmount(fees, 'Commission')
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
  `, [assigned_at, sym, total / qty, qty, seedFees,
      dupe
        ? 'Assignment recorded retrospectively — this put predates the Wheel tab and is already logged in the Trade Log, so its premium is excluded from dashboard P&L to avoid double-counting.'
        : 'Assignment recorded retrospectively — this put predates the Wheel tab.',
      account_id, Number(assigned_strike), total, contracts, cycle.id,
      dupe ? null : total - seedFees,
      await wheelStrategyId(client, req.userId), req.userId])

  await client.query(`
    INSERT INTO share_lots (wheel_cycle_id, ticker, shares, assigned_strike, assigned_at, trade_id, user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [cycle.id, sym, qty, Number(assigned_strike), assigned_at, leg.id, req.userId])

  const updated = await recomputeCycle(client, cycle.id, { eventDate: assigned_at })
  return { cycle: updated, leg }
}))

/**
 * Edit an unresolved leg's details, `option_type` included.
 *
 * Correcting the type matters more than the other fields: a covered call logged
 * as a cash-secured put reads as a leg with no shares behind it, and if it is
 * later marked assigned it manufactures a lot that was never bought. Deleting
 * and re-entering is the alternative, and it loses the leg's history — so the
 * type is editable here under exactly the guards `POST /legs` applies.
 */
router.put('/legs/:id', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  if (leg.leg_status !== 'open') {
    throw badRequest(`This leg is already marked "${leg.leg_status}". Reopen it by deleting and re-entering.`)
  }

  const f = {
    option_type: req.body.option_type ?? leg.option_type,
    strike:      req.body.strike      ?? leg.strike,
    expiry:      req.body.expiry      ?? leg.expiry,
    premium:     req.body.premium     ?? leg.premium,
    contracts:   req.body.contracts   ?? leg.contracts,
    date:        req.body.date        ?? leg.date,
    fees:        req.body.fees        ?? leg.fees,
    notes:       req.body.notes       ?? leg.notes,
  }
  if (!['put', 'call'].includes(f.option_type)) throw badRequest('option_type must be put or call')
  if (!(Number(f.strike) > 0))                  throw badRequest('Strike must be greater than zero')
  if (!f.expiry)                                throw badRequest('Expiry is required')
  if (!(Number(f.contracts) >= 1))              throw badRequest('Contracts must be at least 1')
  if (f.premium == null || Number.isNaN(Number(f.premium))) throw badRequest('Premium is required')
  f.fees = feeAmount(f.fees, 'Commission')

  const qty = sharesFor(f.contracts)

  // Same coverage rule as creation. An open leg holds no lots, so the cycle's
  // cached share count is already the number this call would be written against.
  if (f.option_type === 'call' && leg.wheel_cycle_id) {
    const { rows: [cycle] } = await client.query('SELECT * FROM wheel_cycles WHERE id = $1', [leg.wheel_cycle_id])
    if (cycle && cycle.shares <= 0) {
      throw badRequest(`No assigned ${leg.ticker} shares on this cycle — a covered call needs shares behind it. Record the put assignment first, or use "Add assigned shares" if it predates this tab.`)
    }
    if (cycle && qty > cycle.shares) {
      throw badRequest(`${Math.round(Number(f.contracts))} contract(s) covers ${qty} shares but only ${cycle.shares} are held.`)
    }
  }

  await client.query(`
    UPDATE trades SET option_type=$1, strike=$2, expiry=$3, premium=$4, contracts=$5, date=$6,
      fees=$7, notes=$8, position_size=$9, entry_price=$10, updated_at=NOW()
    WHERE id=$11
  `, [f.option_type, f.strike, f.expiry, f.premium, Math.round(Number(f.contracts)), f.date,
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
  // Normally zero — brokers don't charge you for a contract that just died — but
  // it is accepted so an exchange fee can be recorded when one does show up.
  await resolveLeg(client, leg, 'expired', { closeFees: feeAmount(req.body.fees) })
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

  await resolveLeg(client, leg, 'assigned', { closeFees: feeAmount(req.body.fees, 'Assignment fee') })
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
  await resolveLeg(client, leg, 'called_away', { closeFees: feeAmount(req.body.fees, 'Exercise fee') })
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
 *
 * A roll is TWO commissioned orders, and both belong on the books:
 *   `close_fees` — the buy-to-close ticket, added to the leg being resolved.
 *   `fees`       — the sell-to-open ticket on the new leg, stored on that row.
 * The new leg used to be inserted with a hardcoded fees = 0, which meant every
 * roll understated its cost by a full commission and the break-even line drifted
 * further from the truth with each one.
 */
router.post('/legs/:id/roll', async (req, res) => tx(res, async (client) => {
  const leg = await getOwnedLeg(client, req.params.id, req.userId)
  assertOpen(leg)

  const {
    close_cost, strike, expiry, premium, contracts = leg.contracts, date = today(),
    close_fees = 0, fees = 0,
  } = req.body
  if (!(Number(close_cost) >= 0)) throw badRequest('Buy-to-close cost is required (enter 0 if it expired into the roll for nothing).')
  if (!(Number(strike) > 0))      throw badRequest('New strike is required')
  if (!expiry)                    throw badRequest('New expiry is required')
  if (premium == null || Number.isNaN(Number(premium))) throw badRequest('New premium is required')

  const closeFees = feeAmount(close_fees, 'Buy-to-close commission')
  const openFees  = feeAmount(fees, 'New leg commission')

  await resolveLeg(client, leg, 'rolled', { closeCost: Number(close_cost), closeFees })

  const qty   = sharesFor(contracts)
  const total = Number(premium)
  const { rows: [row] } = await client.query(`
    INSERT INTO trades (
      date, ticker, direction, entry_price, position_size, fees, account_id,
      status, entry_mode, instrument_type, strategy_tag, option_type, strike, expiry,
      premium, contracts, leg_status, wheel_cycle_id, rolled_from_id, strategy_id, user_id
    ) VALUES ($1,$2,'short',$3,$4,$5,$6,'open','wheel_option','option','wheel',
              $7,$8,$9,$10,$11,'open',$12,$13,$14,$15)
    RETURNING *
  `, [date, leg.ticker, total / qty, qty, openFees, leg.account_id, leg.option_type,
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

  await resolveLeg(client, leg, 'closed', {
    closeCost: cost,
    closeFees: feeAmount(req.body.fees, 'Buy-to-close commission'),
  })
  const cycle = await recomputeCycle(client, leg.wheel_cycle_id, { eventDate: req.body.date || today() })
  return { cycle }
}))

/**
 * Sell shares at the market price — all of them (abandon the wheel) or part of
 * the lot.
 *
 * A PARTIAL sale keeps its gain in the cycle rather than booking it, which drops
 * the effective basis of the shares still held:
 *
 *     B_new = B_old - (sharesOut / remaining) x (price - B_old)
 *
 * That is the point of the trade — Sam trims a winner to bring the break-even
 * line down on the rest, so the next covered call can be written lower. Booking
 * the gain instead would leave B exactly where it was and make the sale
 * pointless in basis terms. Lifetime P&L is unaffected: the carried gain books
 * when the cycle goes flat.
 *
 * `fees` is the commission on the share order. It comes off the gain inside
 * `bookShareExit`, so it follows whichever path the sale takes — booked on a
 * full exit, carried on a trim — without a separate accumulator to keep in sync.
 */
router.post('/cycles/:id/sell-shares', async (req, res) => tx(res, async (client) => {
  const { rows: [cycle] } = await client.query(
    'SELECT * FROM wheel_cycles WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
  )
  if (!cycle) { const e = new Error('Cycle not found'); e.status = 404; throw e }
  if (cycle.shares <= 0) throw badRequest('This cycle holds no shares.')

  const price = Number(req.body.price)
  if (!(price > 0)) throw badRequest('Sale price is required')
  const fees = feeAmount(req.body.fees, 'Share order commission')
  const when = req.body.date || today()

  const asked = req.body.shares == null || req.body.shares === '' ? cycle.shares : Math.round(Number(req.body.shares))
  if (!Number.isFinite(asked) || asked <= 0) throw badRequest('Shares to sell must be a positive number')
  if (asked > cycle.shares) throw badRequest(`You hold ${cycle.shares} shares on this cycle.`)
  const qty = asked

  // Shares pinned under an open covered call are not yours to sell — selling
  // them leaves the call naked and the position out of sync with reality. This
  // guards the partial case too, not just a full exit.
  const { rows: openCalls } = await client.query(
    `SELECT contracts FROM trades WHERE wheel_cycle_id = $1 AND leg_status = 'open' AND option_type = 'call'`,
    [cycle.id]
  )
  const covered = openCalls.reduce((n, leg) => n + sharesFor(leg.contracts), 0)
  const free    = cycle.shares - covered
  if (qty > free) {
    throw badRequest(
      `${openCalls.length} covered call(s) cover ${covered} of your ${cycle.shares} shares. ` +
      `You can sell ${Math.max(free, 0)} without going naked — close or roll a call first.`
    )
  }

  const exit = bookShareExit(
    { shares: cycle.shares, avgAssignedStrike: cycle.avg_assigned_strike, netPremium: cycle.net_premium },
    { exitPrice: price, sharesOut: qty, retainGain: true, fees }
  )

  await client.query(`
    UPDATE wheel_cycles SET shares_exited = shares_exited + $1,
      premium_attributed = premium_attributed + $2,
      retained_share_gain = retained_share_gain + $3,
      realized_pnl = realized_pnl + $4, updated_at = NOW()
    WHERE id = $5
  `, [exit.sharesOut, exit.premiumAttributed, exit.retainedGain, exit.bookedPnl, cycle.id])

  const updated = await recomputeCycle(client, cycle.id, {
    eventDate: when,
    closeReason: exit.flat ? 'sold' : undefined,
    exitPrice:   exit.flat ? price : undefined,
  })
  return {
    cycle: updated,
    booked: exit.bookedPnl,
    shares_out: exit.sharesOut,
    retained_gain: exit.retainedGain,
    fees,
    basis: updated?.shares > 0
      ? effectiveBasis({ shares: updated.shares, avgAssignedStrike: updated.avg_assigned_strike, netPremium: updated.net_premium })
      : null,
  }
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
