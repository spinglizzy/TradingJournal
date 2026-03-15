import { Router } from 'express'
import pool from '../db.js'

const router = Router()

function safeJson(v) {
  if (!v) return null
  try { return JSON.parse(v) } catch { return null }
}

// ── Timeframe helpers ─────────────────────────────────────────────────────────
function getTimeframeRange(timeframe) {
  const today = new Date().toISOString().split('T')[0]
  const now   = new Date()
  if (timeframe === 'daily')   return { from: today, to: today }
  if (timeframe === 'weekly') {
    const d = new Date(now)
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    d.setDate(d.getDate() - diff)
    return { from: d.toISOString().split('T')[0], to: today }
  }
  if (timeframe === 'monthly') return { from: today.slice(0,7)+'-01', to: today }
  if (timeframe === 'yearly')  return { from: today.slice(0,4)+'-01-01', to: today }
  return { from: today, to: today }
}

// ── Metric computation ────────────────────────────────────────────────────────
async function computeCurrentJournalStreak(userId) {
  const r = await pool.query(
    'SELECT DISTINCT date FROM journal_entries WHERE user_id=$1 ORDER BY date DESC',
    [userId]
  )
  if (!r.rows.length) return 0
  const today = new Date().toISOString().split('T')[0]
  const dates = new Set(r.rows.map(row => row.date))
  let streak = 0
  const d = new Date(today)
  if (!dates.has(today)) d.setDate(d.getDate() - 1)
  while (dates.has(d.toISOString().split('T')[0])) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

async function computeCurrentValue(metric, from, to, userId) {
  if (metric === 'pnl') {
    const r = await pool.query(
      `SELECT COALESCE(SUM(pnl),0) as v FROM trades WHERE status='closed' AND date BETWEEN $1 AND $2 AND user_id=$3`,
      [from, to, userId]
    )
    return Number(r.rows[0].v)
  }
  if (metric === 'win_rate') {
    const r = await pool.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins FROM trades WHERE status='closed' AND date BETWEEN $1 AND $2 AND user_id=$3`,
      [from, to, userId]
    )
    const { total, wins } = r.rows[0]
    return total > 0 ? (Number(wins) / Number(total)) * 100 : 0
  }
  if (metric === 'trade_count') {
    const r = await pool.query(
      `SELECT COUNT(*) as v FROM trades WHERE date BETWEEN $1 AND $2 AND user_id=$3`,
      [from, to, userId]
    )
    return Number(r.rows[0].v)
  }
  if (metric === 'discipline_score') {
    const r = await pool.query(
      `SELECT rules_broken FROM trades WHERE status='closed' AND date BETWEEN $1 AND $2 AND user_id=$3`,
      [from, to, userId]
    )
    if (!r.rows.length) return 0
    const disciplined = r.rows.filter(row => {
      const b = safeJson(row.rules_broken)
      return !b || b.length === 0
    }).length
    return (disciplined / r.rows.length) * 100
  }
  if (metric === 'journal_streak') {
    return computeCurrentJournalStreak(userId)
  }
  if (metric === 'max_daily_loss') {
    const r = await pool.query(
      `SELECT MIN(s) as worst FROM (SELECT SUM(pnl) as s FROM trades WHERE status='closed' AND date BETWEEN $1 AND $2 AND user_id=$3 GROUP BY date) AS sub`,
      [from, to, userId]
    )
    const worst = r.rows[0].worst
    return worst !== null && worst < 0 ? Math.abs(worst) : 0
  }
  return 0
}

function computeGoalProgress(goal, currentValue) {
  const isMet = goal.direction === 'above'
    ? currentValue >= goal.target_value
    : currentValue <= goal.target_value
  let progress = 0
  if (goal.target_value === 0) {
    progress = isMet ? 100 : 0
  } else if (goal.direction === 'above') {
    progress = Math.min(100, Math.max(0, (currentValue / goal.target_value) * 100))
  } else {
    progress = Math.max(0, Math.min(100, (1 - currentValue / goal.target_value) * 100))
  }
  return { isMet, progress }
}

async function formatGoal(g, userId) {
  const range = getTimeframeRange(g.timeframe)
  const currentValue = await computeCurrentValue(g.metric, range.from, range.to, userId)
  const { isMet, progress } = computeGoalProgress(g, currentValue)
  return {
    ...g,
    active: Boolean(g.active),
    current_value: currentValue,
    progress,
    is_met: isMet,
    period_from: range.from,
    period_to: range.to,
  }
}

// ── Goal CRUD ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM goals WHERE user_id=$1 ORDER BY active DESC, created_at DESC',
      [req.userId]
    )
    res.json(await Promise.all(r.rows.map(g => formatGoal(g, req.userId))))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, metric, target_value, timeframe, direction='above', active=1 } = req.body
    const result = await pool.query(
      `INSERT INTO goals (name,metric,target_value,timeframe,direction,active,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, metric, target_value, timeframe, direction, active ? 1 : 0, req.userId]
    )
    const row = await pool.query('SELECT * FROM goals WHERE id=$1 AND user_id=$2', [result.rows[0].id, req.userId])
    res.json(await formatGoal(row.rows[0], req.userId))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { name, metric, target_value, timeframe, direction, active } = req.body
    await pool.query(
      `UPDATE goals SET name=$1,metric=$2,target_value=$3,timeframe=$4,direction=$5,active=$6 WHERE id=$7 AND user_id=$8`,
      [name, metric, target_value, timeframe, direction, active ? 1 : 0, req.params.id, req.userId]
    )
    const row = await pool.query('SELECT * FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!row.rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(await formatGoal(row.rows[0], req.userId))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Streaks ───────────────────────────────────────────────────────────────────
function longestStreakOf(dateSet) {
  const sorted = [...dateSet].sort()
  if (!sorted.length) return { longest:0, longestStart:null, longestEnd:null }
  let longest=1, cur=1, start=sorted[0], longestStart=sorted[0], longestEnd=sorted[0]
  for (let i=1; i<sorted.length; i++) {
    const prev = new Date(sorted[i-1])
    prev.setDate(prev.getDate()+1)
    if (prev.toISOString().split('T')[0] === sorted[i]) {
      cur++
      if (cur > longest) { longest=cur; longestStart=start; longestEnd=sorted[i] }
    } else { cur=1; start=sorted[i] }
  }
  return { longest, longestStart, longestEnd }
}

function currentStreakOf(dateSet) {
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = (() => { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0] })()
  const sorted    = [...dateSet].sort()
  if (!sorted.length) return 0
  const last = sorted[sorted.length-1]
  if (last !== today && last !== yesterday) return 0
  const d = new Date(last)
  let streak=0
  while (dateSet.has(d.toISOString().split('T')[0])) { streak++; d.setDate(d.getDate()-1) }
  return streak
}

router.get('/streaks', async (req, res) => {
  try {
    const [tradingR, journalR, rulesR] = await Promise.all([
      pool.query(`SELECT date, SUM(pnl) as daily_pnl FROM trades WHERE status='closed' AND user_id=$1 GROUP BY date ORDER BY date`, [req.userId]),
      pool.query('SELECT DISTINCT date FROM journal_entries WHERE user_id=$1', [req.userId]),
      pool.query(`SELECT date, rules_broken FROM trades WHERE status='closed' AND user_id=$1 ORDER BY date`, [req.userId]),
    ])

    const journalDays = new Set(journalR.rows.map(r => r.date))
    const greenDays   = new Set(tradingR.rows.filter(d => Number(d.daily_pnl) > 0).map(d => d.date))

    const byDay = {}
    for (const t of rulesR.rows) {
      if (!byDay[t.date]) byDay[t.date] = []
      byDay[t.date].push(t)
    }
    const ruleDays = new Set()
    for (const [date, dayTrades] of Object.entries(byDay)) {
      if (dayTrades.every(t => { const b=safeJson(t.rules_broken); return !b||b.length===0 })) {
        ruleDays.add(date)
      }
    }

    const green   = longestStreakOf(greenDays)
    const journal = longestStreakOf(journalDays)
    const rule    = longestStreakOf(ruleDays)

    res.json({
      green_days:     { current:currentStreakOf(greenDays),   longest:green.longest,   longest_start:green.longestStart,   longest_end:green.longestEnd },
      journal:        { current:currentStreakOf(journalDays), longest:journal.longest, longest_start:journal.longestStart, longest_end:journal.longestEnd },
      rule_following: { current:currentStreakOf(ruleDays),    longest:rule.longest,    longest_start:rule.longestStart,    longest_end:rule.longestEnd },
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Goal Progress Calendar ────────────────────────────────────────────────────
router.get('/progress', async (req, res) => {
  try {
    const goalsR = await pool.query(
      `SELECT * FROM goals WHERE active=1 AND timeframe='daily' AND user_id=$1`,
      [req.userId]
    )
    const goals  = goalsR.rows

    const today = new Date()
    const days  = []
    for (let i=89; i>=0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate()-i)
      days.push(d.toISOString().split('T')[0])
    }

    if (!goals.length) {
      return res.json({ days: days.map(date => ({ date, met:0, total:0, status:'none' })), goals:[] })
    }

    const from = days[0], to = days[days.length-1]

    const [dailyR, journalR, ruleR] = await Promise.all([
      pool.query(`SELECT date, SUM(pnl) as pnl, COUNT(*) as trades, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins FROM trades WHERE status='closed' AND date BETWEEN $1 AND $2 AND user_id=$3 GROUP BY date`, [from, to, req.userId]),
      pool.query(`SELECT DISTINCT date FROM journal_entries WHERE date BETWEEN $1 AND $2 AND user_id=$3`, [from, to, req.userId]),
      pool.query(`SELECT date, rules_broken FROM trades WHERE status='closed' AND date BETWEEN $1 AND $2 AND user_id=$3`, [from, to, req.userId]),
    ])

    const dailyStats = {}
    dailyR.rows.forEach(r => { dailyStats[r.date] = r })
    const journalDates = new Set(journalR.rows.map(r => r.date))

    const rulesByDay = {}
    for (const t of ruleR.rows) {
      if (!rulesByDay[t.date]) rulesByDay[t.date] = []
      rulesByDay[t.date].push(t)
    }

    const result = days.map(date => {
      let met=0, total=goals.length
      const day = dailyStats[date]
      for (const goal of goals) {
        let cv = 0
        if (goal.metric==='pnl')              cv = day ? Number(day.pnl) : 0
        else if (goal.metric==='win_rate')    cv = (day && day.trades>0) ? (Number(day.wins)/Number(day.trades))*100 : 0
        else if (goal.metric==='trade_count') cv = day ? Number(day.trades) : 0
        else if (goal.metric==='discipline_score') {
          const dt = rulesByDay[date]||[]
          if (!dt.length) { total--; continue }
          const disc = dt.filter(t => { const b=safeJson(t.rules_broken); return !b||b.length===0 }).length
          cv = (disc/dt.length)*100
        }
        else if (goal.metric==='max_daily_loss') cv = day ? Math.abs(Math.min(0,Number(day.pnl))) : 0
        else if (goal.metric==='journal_streak') cv = journalDates.has(date) ? 1 : 0
        const isMet = goal.direction==='above' ? cv>=goal.target_value : cv<=goal.target_value
        if (isMet) met++
      }
      let status='none'
      if (total>0) {
        if (met===total) status='met'
        else if (met>0)  status='partial'
        else             status='missed'
      }
      return { date, met, total, status }
    })

    res.json({ days:result, goals:goals.map(g=>({id:g.id,name:g.name})) })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Achievements ──────────────────────────────────────────────────────────────
const PREDEFINED = [
  { key:'first_trade',          name:'First Trade',        description:'Log your very first trade',                             icon:'🎯', category:'trading' },
  { key:'trades_10',            name:'Getting Started',    description:'Log 10 trades',                                         icon:'📊', category:'trading' },
  { key:'trades_50',            name:'Building Habits',    description:'Log 50 trades',                                         icon:'📈', category:'trading' },
  { key:'trades_100',           name:'Century Club',       description:'Log 100 trades',                                        icon:'💯', category:'trading' },
  { key:'trades_250',           name:'Veteran Trader',     description:'Log 250 trades',                                        icon:'🏅', category:'trading' },
  { key:'profit_1000',          name:'First Grand',        description:'Accumulate $1,000 in total profit',                     icon:'💵', category:'trading' },
  { key:'profit_10000',         name:'Five Figures',       description:'Accumulate $10,000 in total profit',                    icon:'💰', category:'trading' },
  { key:'green_streak_5',       name:'5 Green Days',       description:'5 consecutive profitable trading days',                 icon:'🔥', category:'trading' },
  { key:'green_streak_10',      name:'10 Green Days',      description:'10 consecutive profitable trading days',                icon:'🚀', category:'trading' },
  { key:'green_streak_20',      name:'Hot Streak',         description:'20 consecutive profitable trading days',               icon:'⚡', category:'trading' },
  { key:'journal_streak_5',     name:'Journal Starter',    description:'5 consecutive days of journaling',                     icon:'📖', category:'journaling' },
  { key:'journal_streak_10',    name:'Journal Habit',      description:'10 consecutive days of journaling',                    icon:'✍️', category:'journaling' },
  { key:'journal_streak_30',    name:'Journal Master',     description:'30 consecutive days of journaling',                    icon:'📚', category:'journaling' },
  { key:'rule_compliance_week', name:'Rule Follower',      description:'7 consecutive trading days with no broken rules',      icon:'✅', category:'discipline' },
  { key:'missed_trade_logged',  name:'Honest Trader',      description:'Log your first missed trade',                          icon:'🎓', category:'discipline' },
  { key:'all_setups_used',      name:'Strategy Diversity', description:'Trade using 5 or more different setups',              icon:'🎰', category:'trading' },
  { key:'win_rate_55',          name:'Consistent Winner',  description:'Achieve 55%+ win rate over at least 20 trades',       icon:'🎯', category:'trading' },
  { key:'win_rate_60',          name:'Sharp Shooter',      description:'Achieve 60%+ win rate over at least 20 trades',       icon:'🏆', category:'trading' },
]

function longestStreak(dateSet) { return longestStreakOf(dateSet).longest }

async function checkAndUpsertAchievements(userId) {
  const [tsR, missedR, strategiesR, tradingR, journalR, rulesR] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, COALESCE(SUM(pnl),0) as pnl FROM trades WHERE status='closed' AND user_id=$1`, [userId]),
    pool.query(`SELECT COUNT(*) as cnt FROM missed_trades WHERE user_id=$1`, [userId]),
    pool.query(`SELECT COUNT(DISTINCT strategy_id) as cnt FROM trades WHERE strategy_id IS NOT NULL AND user_id=$1`, [userId]),
    pool.query(`SELECT date, SUM(pnl) as daily_pnl FROM trades WHERE status='closed' AND user_id=$1 GROUP BY date ORDER BY date`, [userId]),
    pool.query('SELECT DISTINCT date FROM journal_entries WHERE user_id=$1', [userId]),
    pool.query(`SELECT date, rules_broken FROM trades WHERE status='closed' AND user_id=$1 ORDER BY date`, [userId]),
  ])

  const ts         = tsR.rows[0]
  const missed     = Number(missedR.rows[0].cnt)
  const strategies = Number(strategiesR.rows[0].cnt)

  const greenDays   = new Set(tradingR.rows.filter(d => Number(d.daily_pnl) > 0).map(d => d.date))
  const journalDays = new Set(journalR.rows.map(r => r.date))

  const byDay = {}
  for (const t of rulesR.rows) {
    if (!byDay[t.date]) byDay[t.date] = []
    byDay[t.date].push(t)
  }
  const ruleDays = new Set()
  for (const [date, dayTrades] of Object.entries(byDay)) {
    if (dayTrades.every(t => { const b=safeJson(t.rules_broken); return !b||b.length===0 })) ruleDays.add(date)
  }

  const totalTrades = Number(ts.total)
  const totalPnl    = Number(ts.pnl)
  const winRate     = totalTrades >= 20 ? (Number(ts.wins) / totalTrades) * 100 : 0

  const checks = {
    first_trade: totalTrades>=1, trades_10: totalTrades>=10, trades_50: totalTrades>=50,
    trades_100: totalTrades>=100, trades_250: totalTrades>=250,
    profit_1000: totalPnl>=1000, profit_10000: totalPnl>=10000,
    green_streak_5: longestStreak(greenDays)>=5, green_streak_10: longestStreak(greenDays)>=10, green_streak_20: longestStreak(greenDays)>=20,
    journal_streak_5: longestStreak(journalDays)>=5, journal_streak_10: longestStreak(journalDays)>=10, journal_streak_30: longestStreak(journalDays)>=30,
    rule_compliance_week: longestStreak(ruleDays)>=7,
    missed_trade_logged: missed>=1, all_setups_used: strategies>=5,
    win_rate_55: winRate>=55, win_rate_60: winRate>=60,
  }

  const progress = {
    first_trade:totalTrades, trades_10:totalTrades, trades_50:totalTrades, trades_100:totalTrades, trades_250:totalTrades,
    profit_1000:totalPnl, profit_10000:totalPnl,
    green_streak_5:longestStreak(greenDays), green_streak_10:longestStreak(greenDays), green_streak_20:longestStreak(greenDays),
    journal_streak_5:longestStreak(journalDays), journal_streak_10:longestStreak(journalDays), journal_streak_30:longestStreak(journalDays),
    rule_compliance_week:longestStreak(ruleDays),
    missed_trade_logged:missed, all_setups_used:strategies,
    win_rate_55:totalTrades>=20?winRate:0, win_rate_60:totalTrades>=20?winRate:0,
  }

  const thresholds = {
    first_trade:1, trades_10:10, trades_50:50, trades_100:100, trades_250:250,
    profit_1000:1000, profit_10000:10000,
    green_streak_5:5, green_streak_10:10, green_streak_20:20,
    journal_streak_5:5, journal_streak_10:10, journal_streak_30:30,
    rule_compliance_week:7, missed_trade_logged:1, all_setups_used:5,
    win_rate_55:55, win_rate_60:60,
  }

  const now = new Date().toISOString()
  for (const a of PREDEFINED) {
    const existR = await pool.query('SELECT * FROM achievements WHERE key=$1 AND user_id=$2', [a.key, userId])
    if (!existR.rows[0]) {
      await pool.query(
        `INSERT INTO achievements (key,name,description,icon,category,custom,earned_at,user_id) VALUES ($1,$2,$3,$4,$5,0,$6,$7)`,
        [a.key, a.name, a.description, a.icon, a.category, checks[a.key] ? now : null, userId]
      )
    } else if (!existR.rows[0].earned_at && checks[a.key]) {
      await pool.query('UPDATE achievements SET earned_at=$1 WHERE key=$2 AND user_id=$3', [now, a.key, userId])
    }
  }

  return { progress, thresholds }
}

router.get('/achievements', async (req, res) => {
  try {
    const { progress, thresholds } = await checkAndUpsertAchievements(req.userId)
    const r = await pool.query(
      `SELECT * FROM achievements WHERE user_id=$1 ORDER BY custom ASC, CASE WHEN earned_at IS NULL THEN 1 ELSE 0 END ASC, earned_at DESC, created_at ASC`,
      [req.userId]
    )
    res.json(r.rows.map(a => ({
      ...a,
      custom:        Boolean(a.custom),
      threshold:     thresholds[a.key] ?? null,
      current_value: progress[a.key]   ?? null,
      progress:      thresholds[a.key] != null && progress[a.key] != null
        ? Math.min(100, Math.max(0, (progress[a.key] / thresholds[a.key]) * 100))
        : null,
    })))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/achievements', async (req, res) => {
  try {
    const { name, description='', icon='🏆', category='custom' } = req.body
    const result = await pool.query(
      `INSERT INTO achievements (name,description,icon,category,custom,user_id) VALUES ($1,$2,$3,$4,1,$5) RETURNING id`,
      [name, description, icon, category, req.userId]
    )
    const row = await pool.query('SELECT * FROM achievements WHERE id=$1 AND user_id=$2', [result.rows[0].id, req.userId])
    res.json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.put('/achievements/:id', async (req, res) => {
  try {
    const aR = await pool.query('SELECT * FROM achievements WHERE id=$1 AND custom=1 AND user_id=$2', [req.params.id, req.userId])
    if (!aR.rows[0]) return res.status(404).json({ error: 'Not found or not a custom achievement' })
    const a = aR.rows[0]
    const { name, description, icon, category, earned_at } = req.body
    await pool.query(
      `UPDATE achievements SET name=$1,description=$2,icon=$3,category=$4,earned_at=$5 WHERE id=$6 AND user_id=$7`,
      [name??a.name, description??a.description, icon??a.icon, category??a.category,
       earned_at !== undefined ? earned_at : a.earned_at, req.params.id, req.userId]
    )
    const row = await pool.query('SELECT * FROM achievements WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    res.json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/achievements/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM achievements WHERE id=$1 AND custom=1 AND user_id=$2', [req.params.id, req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

export default router
