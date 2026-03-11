import { Router } from 'express'
import db from '../db.js'

const router = Router()

function safeJson(v) {
  if (!v) return null
  try { return JSON.parse(v) } catch { return null }
}

// ── Timeframe helpers ─────────────────────────────────────────────────────────

function getTimeframeRange(timeframe) {
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()

  if (timeframe === 'daily') {
    return { from: today, to: today }
  }
  if (timeframe === 'weekly') {
    const d = new Date(now)
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1 // Mon = 0
    d.setDate(d.getDate() - diff)
    return { from: d.toISOString().split('T')[0], to: today }
  }
  if (timeframe === 'monthly') {
    return { from: today.slice(0, 7) + '-01', to: today }
  }
  if (timeframe === 'yearly') {
    return { from: today.slice(0, 4) + '-01-01', to: today }
  }
  return { from: today, to: today }
}

// ── Metric computation ────────────────────────────────────────────────────────

function computeCurrentJournalStreak() {
  const rows = db.prepare(
    'SELECT DISTINCT date FROM journal_entries ORDER BY date DESC'
  ).all()
  if (!rows.length) return 0

  const today = new Date().toISOString().split('T')[0]
  const dates = new Set(rows.map(r => r.date))
  let streak = 0
  const d = new Date(today)
  if (!dates.has(today)) d.setDate(d.getDate() - 1)
  while (dates.has(d.toISOString().split('T')[0])) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function computeCurrentValue(metric, from, to) {
  if (metric === 'pnl') {
    return db.prepare(
      `SELECT COALESCE(SUM(pnl),0) as v FROM trades WHERE status='closed' AND date BETWEEN ? AND ?`
    ).get(from, to).v
  }
  if (metric === 'win_rate') {
    const r = db.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins
       FROM trades WHERE status='closed' AND date BETWEEN ? AND ?`
    ).get(from, to)
    return r.total ? (r.wins / r.total) * 100 : 0
  }
  if (metric === 'trade_count') {
    return db.prepare(
      `SELECT COUNT(*) as v FROM trades WHERE date BETWEEN ? AND ?`
    ).get(from, to).v
  }
  if (metric === 'discipline_score') {
    const rows = db.prepare(
      `SELECT rules_broken FROM trades WHERE status='closed' AND date BETWEEN ? AND ?`
    ).all(from, to)
    if (!rows.length) return 0
    const disciplined = rows.filter(r => {
      const b = safeJson(r.rules_broken)
      return !b || b.length === 0
    }).length
    return (disciplined / rows.length) * 100
  }
  if (metric === 'journal_streak') {
    return computeCurrentJournalStreak()
  }
  if (metric === 'max_daily_loss') {
    const r = db.prepare(
      `SELECT MIN(s) as worst FROM (
         SELECT SUM(pnl) as s FROM trades WHERE status='closed' AND date BETWEEN ? AND ? GROUP BY date
       )`
    ).get(from, to)
    return r.worst !== null && r.worst < 0 ? Math.abs(r.worst) : 0
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
    // "below" goal: progress = how far under the limit you are
    // currentValue=0 → 100%, currentValue=target → 0%, over target → 0%
    progress = Math.max(0, Math.min(100, (1 - currentValue / goal.target_value) * 100))
  }

  return { isMet, progress }
}

function formatGoal(g) {
  const range = getTimeframeRange(g.timeframe)
  const currentValue = computeCurrentValue(g.metric, range.from, range.to)
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

router.get('/', (_req, res) => {
  const goals = db.prepare('SELECT * FROM goals ORDER BY active DESC, created_at DESC').all()
  res.json(goals.map(formatGoal))
})

router.post('/', (req, res) => {
  const { name, metric, target_value, timeframe, direction = 'above', active = 1 } = req.body
  const info = db.prepare(
    `INSERT INTO goals (name,metric,target_value,timeframe,direction,active) VALUES (?,?,?,?,?,?)`
  ).run(name, metric, target_value, timeframe, direction, active ? 1 : 0)
  res.json(formatGoal(db.prepare('SELECT * FROM goals WHERE id=?').get(info.lastInsertRowid)))
})

router.put('/:id', (req, res) => {
  const { name, metric, target_value, timeframe, direction, active } = req.body
  db.prepare(
    `UPDATE goals SET name=?,metric=?,target_value=?,timeframe=?,direction=?,active=? WHERE id=?`
  ).run(name, metric, target_value, timeframe, direction, active ? 1 : 0, req.params.id)
  const goal = db.prepare('SELECT * FROM goals WHERE id=?').get(req.params.id)
  if (!goal) return res.status(404).json({ error: 'Not found' })
  res.json(formatGoal(goal))
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Streaks ───────────────────────────────────────────────────────────────────

function longestStreakOf(dateSet) {
  const sorted = [...dateSet].sort()
  if (!sorted.length) return { longest: 0, longestStart: null, longestEnd: null }
  let longest = 1, cur = 1, start = sorted[0], longestStart = sorted[0], longestEnd = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    prev.setDate(prev.getDate() + 1)
    if (prev.toISOString().split('T')[0] === sorted[i]) {
      cur++
      if (cur > longest) {
        longest = cur
        longestStart = start
        longestEnd = sorted[i]
      }
    } else {
      cur = 1
      start = sorted[i]
    }
  }
  return { longest, longestStart, longestEnd }
}

function currentStreakOf(dateSet) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
  const sorted = [...dateSet].sort()
  if (!sorted.length) return 0
  const last = sorted[sorted.length - 1]
  if (last !== today && last !== yesterday) return 0
  const d = new Date(last)
  let streak = 0
  while (dateSet.has(d.toISOString().split('T')[0])) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

router.get('/streaks', (_req, res) => {
  const tradingDays = db.prepare(
    `SELECT date, SUM(pnl) as daily_pnl FROM trades WHERE status='closed' GROUP BY date ORDER BY date`
  ).all()

  const journalDays = new Set(
    db.prepare('SELECT DISTINCT date FROM journal_entries').all().map(r => r.date)
  )

  const greenDays = new Set(tradingDays.filter(d => d.daily_pnl > 0).map(d => d.date))

  const rulesRows = db.prepare(
    `SELECT date, rules_broken FROM trades WHERE status='closed' ORDER BY date`
  ).all()
  const byDay = {}
  for (const t of rulesRows) {
    if (!byDay[t.date]) byDay[t.date] = []
    byDay[t.date].push(t)
  }
  const ruleDays = new Set()
  for (const [date, dayTrades] of Object.entries(byDay)) {
    if (dayTrades.every(t => { const b = safeJson(t.rules_broken); return !b || b.length === 0 })) {
      ruleDays.add(date)
    }
  }

  const green = longestStreakOf(greenDays)
  const journal = longestStreakOf(journalDays)
  const rule = longestStreakOf(ruleDays)

  res.json({
    green_days: {
      current: currentStreakOf(greenDays),
      longest: green.longest,
      longest_start: green.longestStart,
      longest_end: green.longestEnd,
    },
    journal: {
      current: currentStreakOf(journalDays),
      longest: journal.longest,
      longest_start: journal.longestStart,
      longest_end: journal.longestEnd,
    },
    rule_following: {
      current: currentStreakOf(ruleDays),
      longest: rule.longest,
      longest_start: rule.longestStart,
      longest_end: rule.longestEnd,
    },
  })
})

// ── Goal Progress Calendar ────────────────────────────────────────────────────

router.get('/progress', (_req, res) => {
  const goals = db.prepare(`SELECT * FROM goals WHERE active=1 AND timeframe='daily'`).all()

  // Build last 90 days
  const today = new Date()
  const days = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }

  if (!goals.length) {
    return res.json({ days: days.map(date => ({ date, met: 0, total: 0, status: 'none' })), goals: [] })
  }

  const from = days[0], to = days[days.length - 1]

  const dailyStats = {}
  db.prepare(
    `SELECT date, SUM(pnl) as pnl, COUNT(*) as trades, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins
     FROM trades WHERE status='closed' AND date BETWEEN ? AND ? GROUP BY date`
  ).all(from, to).forEach(r => { dailyStats[r.date] = r })

  const journalDates = new Set(
    db.prepare(`SELECT DISTINCT date FROM journal_entries WHERE date BETWEEN ? AND ?`)
      .all(from, to).map(r => r.date)
  )

  const ruleRows = db.prepare(
    `SELECT date, rules_broken FROM trades WHERE status='closed' AND date BETWEEN ? AND ?`
  ).all(from, to)
  const rulesByDay = {}
  for (const t of ruleRows) {
    if (!rulesByDay[t.date]) rulesByDay[t.date] = []
    rulesByDay[t.date].push(t)
  }

  const result = days.map(date => {
    let met = 0, total = goals.length
    const day = dailyStats[date]

    for (const goal of goals) {
      let cv = 0
      if (goal.metric === 'pnl') {
        cv = day ? day.pnl : 0
      } else if (goal.metric === 'win_rate') {
        cv = (day && day.trades > 0) ? (day.wins / day.trades) * 100 : 0
      } else if (goal.metric === 'trade_count') {
        cv = day ? day.trades : 0
      } else if (goal.metric === 'discipline_score') {
        const dt = rulesByDay[date] || []
        if (!dt.length) { total--; continue }
        const disc = dt.filter(t => { const b = safeJson(t.rules_broken); return !b || b.length === 0 }).length
        cv = (disc / dt.length) * 100
      } else if (goal.metric === 'max_daily_loss') {
        cv = day ? Math.abs(Math.min(0, day.pnl)) : 0
      } else if (goal.metric === 'journal_streak') {
        cv = journalDates.has(date) ? 1 : 0
      }
      const isMet = goal.direction === 'above' ? cv >= goal.target_value : cv <= goal.target_value
      if (isMet) met++
    }

    let status = 'none'
    if (total > 0) {
      if (met === total) status = 'met'
      else if (met > 0) status = 'partial'
      else status = 'missed'
    }
    return { date, met, total, status }
  })

  res.json({ days: result, goals: goals.map(g => ({ id: g.id, name: g.name })) })
})

// ── Achievements ──────────────────────────────────────────────────────────────

const PREDEFINED = [
  { key: 'first_trade',          name: 'First Trade',        description: 'Log your very first trade',                               icon: '🎯', category: 'trading' },
  { key: 'trades_10',            name: 'Getting Started',    description: 'Log 10 trades',                                           icon: '📊', category: 'trading' },
  { key: 'trades_50',            name: 'Building Habits',    description: 'Log 50 trades',                                           icon: '📈', category: 'trading' },
  { key: 'trades_100',           name: 'Century Club',       description: 'Log 100 trades',                                          icon: '💯', category: 'trading' },
  { key: 'trades_250',           name: 'Veteran Trader',     description: 'Log 250 trades',                                          icon: '🏅', category: 'trading' },
  { key: 'profit_1000',          name: 'First Grand',        description: 'Accumulate $1,000 in total profit',                       icon: '💵', category: 'trading' },
  { key: 'profit_10000',         name: 'Five Figures',       description: 'Accumulate $10,000 in total profit',                      icon: '💰', category: 'trading' },
  { key: 'green_streak_5',       name: '5 Green Days',       description: '5 consecutive profitable trading days',                   icon: '🔥', category: 'trading' },
  { key: 'green_streak_10',      name: '10 Green Days',      description: '10 consecutive profitable trading days',                  icon: '🚀', category: 'trading' },
  { key: 'green_streak_20',      name: 'Hot Streak',         description: '20 consecutive profitable trading days',                  icon: '⚡', category: 'trading' },
  { key: 'journal_streak_5',     name: 'Journal Starter',    description: '5 consecutive days of journaling',                        icon: '📖', category: 'journaling' },
  { key: 'journal_streak_10',    name: 'Journal Habit',      description: '10 consecutive days of journaling',                       icon: '✍️', category: 'journaling' },
  { key: 'journal_streak_30',    name: 'Journal Master',     description: '30 consecutive days of journaling',                       icon: '📚', category: 'journaling' },
  { key: 'rule_compliance_week', name: 'Rule Follower',      description: '7 consecutive trading days with no broken rules',         icon: '✅', category: 'discipline' },
  { key: 'missed_trade_logged',  name: 'Honest Trader',      description: 'Log your first missed trade',                             icon: '🎓', category: 'discipline' },
  { key: 'all_setups_used',      name: 'Strategy Diversity', description: 'Trade using 5 or more different setups',                  icon: '🎰', category: 'trading' },
  { key: 'win_rate_55',          name: 'Consistent Winner',  description: 'Achieve 55%+ win rate over at least 20 trades',          icon: '🎯', category: 'trading' },
  { key: 'win_rate_60',          name: 'Sharp Shooter',      description: 'Achieve 60%+ win rate over at least 20 trades',          icon: '🏆', category: 'trading' },
]

function longestStreak(dateSet) {
  return longestStreakOf(dateSet).longest
}

function checkAndUpsertAchievements() {
  const ts = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, COALESCE(SUM(pnl),0) as pnl
     FROM trades WHERE status='closed'`
  ).get()

  const missed = db.prepare(`SELECT COUNT(*) as cnt FROM missed_trades`).get().cnt
  const strategies = db.prepare(`SELECT COUNT(DISTINCT strategy_id) as cnt FROM trades WHERE strategy_id IS NOT NULL`).get().cnt

  const tradingDays = db.prepare(
    `SELECT date, SUM(pnl) as daily_pnl FROM trades WHERE status='closed' GROUP BY date ORDER BY date`
  ).all()
  const greenDays = new Set(tradingDays.filter(d => d.daily_pnl > 0).map(d => d.date))
  const journalDays = new Set(
    db.prepare('SELECT DISTINCT date FROM journal_entries').all().map(r => r.date)
  )
  const rulesRows = db.prepare(
    `SELECT date, rules_broken FROM trades WHERE status='closed' ORDER BY date`
  ).all()
  const byDay = {}
  for (const t of rulesRows) {
    if (!byDay[t.date]) byDay[t.date] = []
    byDay[t.date].push(t)
  }
  const ruleDays = new Set()
  for (const [date, dayTrades] of Object.entries(byDay)) {
    if (dayTrades.every(t => { const b = safeJson(t.rules_broken); return !b || b.length === 0 })) {
      ruleDays.add(date)
    }
  }

  const winRate = ts.total >= 20 ? (ts.wins / ts.total) * 100 : 0

  const checks = {
    first_trade:          ts.total >= 1,
    trades_10:            ts.total >= 10,
    trades_50:            ts.total >= 50,
    trades_100:           ts.total >= 100,
    trades_250:           ts.total >= 250,
    profit_1000:          ts.pnl >= 1000,
    profit_10000:         ts.pnl >= 10000,
    green_streak_5:       longestStreak(greenDays) >= 5,
    green_streak_10:      longestStreak(greenDays) >= 10,
    green_streak_20:      longestStreak(greenDays) >= 20,
    journal_streak_5:     longestStreak(journalDays) >= 5,
    journal_streak_10:    longestStreak(journalDays) >= 10,
    journal_streak_30:    longestStreak(journalDays) >= 30,
    rule_compliance_week: longestStreak(ruleDays) >= 7,
    missed_trade_logged:  missed >= 1,
    all_setups_used:      strategies >= 5,
    win_rate_55:          winRate >= 55,
    win_rate_60:          winRate >= 60,
  }

  // Progress values for display
  const progress = {
    first_trade: ts.total, trades_10: ts.total, trades_50: ts.total,
    trades_100: ts.total, trades_250: ts.total,
    profit_1000: ts.pnl, profit_10000: ts.pnl,
    green_streak_5: longestStreak(greenDays), green_streak_10: longestStreak(greenDays),
    green_streak_20: longestStreak(greenDays),
    journal_streak_5: longestStreak(journalDays), journal_streak_10: longestStreak(journalDays),
    journal_streak_30: longestStreak(journalDays),
    rule_compliance_week: longestStreak(ruleDays),
    missed_trade_logged: missed,
    all_setups_used: strategies,
    win_rate_55: ts.total >= 20 ? winRate : 0,
    win_rate_60: ts.total >= 20 ? winRate : 0,
  }

  const thresholds = {
    first_trade: 1, trades_10: 10, trades_50: 50, trades_100: 100, trades_250: 250,
    profit_1000: 1000, profit_10000: 10000,
    green_streak_5: 5, green_streak_10: 10, green_streak_20: 20,
    journal_streak_5: 5, journal_streak_10: 10, journal_streak_30: 30,
    rule_compliance_week: 7, missed_trade_logged: 1, all_setups_used: 5,
    win_rate_55: 55, win_rate_60: 60,
  }

  const now = new Date().toISOString()
  for (const a of PREDEFINED) {
    const existing = db.prepare('SELECT * FROM achievements WHERE key=?').get(a.key)
    if (!existing) {
      db.prepare(
        `INSERT INTO achievements (key,name,description,icon,category,custom,earned_at) VALUES (?,?,?,?,?,0,?)`
      ).run(a.key, a.name, a.description, a.icon, a.category, checks[a.key] ? now : null)
    } else if (!existing.earned_at && checks[a.key]) {
      db.prepare('UPDATE achievements SET earned_at=? WHERE key=?').run(now, a.key)
    }
  }

  return { progress, thresholds }
}

router.get('/achievements', (_req, res) => {
  const { progress, thresholds } = checkAndUpsertAchievements()
  const achievements = db.prepare(
    `SELECT * FROM achievements ORDER BY custom ASC, CASE WHEN earned_at IS NULL THEN 1 ELSE 0 END ASC, earned_at DESC, created_at ASC`
  ).all()

  res.json(achievements.map(a => ({
    ...a,
    custom: Boolean(a.custom),
    threshold: thresholds[a.key] ?? null,
    current_value: progress[a.key] ?? null,
    progress: thresholds[a.key] != null && progress[a.key] != null
      ? Math.min(100, Math.max(0, (progress[a.key] / thresholds[a.key]) * 100))
      : null,
  })))
})

router.post('/achievements', (req, res) => {
  const { name, description = '', icon = '🏆', category = 'custom' } = req.body
  const info = db.prepare(
    `INSERT INTO achievements (name,description,icon,category,custom) VALUES (?,?,?,?,1)`
  ).run(name, description, icon, category)
  res.json(db.prepare('SELECT * FROM achievements WHERE id=?').get(info.lastInsertRowid))
})

router.put('/achievements/:id', (req, res) => {
  const { name, description, icon, category, earned_at } = req.body
  const a = db.prepare('SELECT * FROM achievements WHERE id=? AND custom=1').get(req.params.id)
  if (!a) return res.status(404).json({ error: 'Not found or not a custom achievement' })
  db.prepare(
    `UPDATE achievements SET name=?,description=?,icon=?,category=?,earned_at=? WHERE id=?`
  ).run(
    name ?? a.name, description ?? a.description, icon ?? a.icon, category ?? a.category,
    earned_at !== undefined ? earned_at : a.earned_at,
    req.params.id
  )
  res.json(db.prepare('SELECT * FROM achievements WHERE id=?').get(req.params.id))
})

router.delete('/achievements/:id', (req, res) => {
  db.prepare('DELETE FROM achievements WHERE id=? AND custom=1').run(req.params.id)
  res.json({ ok: true })
})

export default router
