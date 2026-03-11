import { Router } from 'express'
import db from '../db.js'

const router = Router()

function dateFilter(from, to, col = 'date') {
  const parts = []
  const params = {}
  if (from) { parts.push(`${col} >= :from`); params.from = from }
  if (to)   { parts.push(`${col} <= :to`);   params.to   = to   }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params }
}

function parseJson(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

const MOOD_SCORE = { great: 5, good: 4, neutral: 3, bad: 2, terrible: 1 }

const TILT_WINDOW = 10

// Compute rolling tilt score for an ordered array of trades
function computeTiltHistory(trades) {
  return trades.map((trade, i) => {
    const windowStart = Math.max(0, i - TILT_WINDOW + 1)
    const window = trades.slice(windowStart, i + 1)
    const total = window.length

    const mistake_rate     = window.filter(t => parseJson(t.mistakes).length > 0).length / total
    const rule_break_rate  = window.filter(t => parseJson(t.rules_broken).length > 0).length / total
    const loss_rate        = window.filter(t => t.pnl != null && t.pnl <= 0).length / total
    const low_conf_rate    = window.filter(t => t.confidence != null && t.confidence < 3).length / total

    const tilt_score = Math.round(
      (mistake_rate * 0.35 + low_conf_rate * 0.25 + loss_rate * 0.25 + rule_break_rate * 0.15) * 100
    )
    return { id: trade.id, date: trade.date, pnl: trade.pnl, tilt_score }
  })
}

// ── Tilt history + equity overlay ─────────────────────────────────────────────
router.get('/tilt-history', (req, res) => {
  const { from, to } = req.query
  const { clause, params } = dateFilter(from, to)

  const trades = db.prepare(`
    SELECT id, date, pnl, confidence, emotions, mistakes, rules_broken
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    ORDER BY date ASC, id ASC
  `).all(params)

  const history = computeTiltHistory(trades)
  let equity = 0
  res.json(history.map(h => {
    equity += h.pnl ?? 0
    return { ...h, equity: Math.round(equity * 100) / 100 }
  }))
})

// ── Summary: current tilt + insights ──────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { from, to } = req.query
  const { clause, params } = dateFilter(from, to)

  const trades = db.prepare(`
    SELECT id, date, pnl, confidence, emotions, mistakes, rules_followed, rules_broken
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    ORDER BY date ASC, id ASC
  `).all(params)

  if (trades.length === 0) {
    return res.json({ tilt_score: 0, discipline_score: 100, tilt_trend: 0, total_trades: 0, insights: [] })
  }

  const history = computeTiltHistory(trades)
  const current_tilt = history[history.length - 1]?.tilt_score ?? 0
  const discipline_score = 100 - current_tilt

  // Trend: avg tilt of last 5 vs previous 5
  const recent5 = history.slice(-5).map(h => h.tilt_score)
  const prev5   = history.slice(-10, -5).map(h => h.tilt_score)
  const recent_avg = recent5.reduce((a, b) => a + b, 0) / (recent5.length || 1)
  const prev_avg   = prev5.length ? prev5.reduce((a, b) => a + b, 0) / prev5.length : recent_avg
  const tilt_trend = Math.round(recent_avg - prev_avg)

  const insights = []

  // Most costly emotion
  const emotionPnl = {}
  trades.forEach(t => {
    parseJson(t.emotions).forEach(e => {
      emotionPnl[e] = (emotionPnl[e] || 0) + (t.pnl || 0)
    })
  })
  const worstEmotion = Object.entries(emotionPnl).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])[0]
  if (worstEmotion) {
    insights.push({
      type: 'emotion', color: 'red',
      title: 'Most Costly Emotion',
      value: worstEmotion[0],
      detail: `${worstEmotion[1] >= 0 ? '+' : ''}$${worstEmotion[1].toFixed(2)} total P&L`,
    })
  }

  // Most broken rule
  const ruleBrokenCounts = {}
  trades.forEach(t => {
    parseJson(t.rules_broken).forEach(r => { ruleBrokenCounts[r] = (ruleBrokenCounts[r] || 0) + 1 })
  })
  const mostBroken = Object.entries(ruleBrokenCounts).sort((a, b) => b[1] - a[1])[0]
  if (mostBroken) {
    const trackedCount = trades.filter(t =>
      parseJson(t.rules_followed).length > 0 || parseJson(t.rules_broken).length > 0
    ).length
    const pct = trackedCount > 0 ? Math.round((mostBroken[1] / trackedCount) * 100) : 0
    insights.push({
      type: 'rule', color: 'orange',
      title: 'Most Broken Rule',
      value: mostBroken[0],
      detail: `Broken in ${pct}% of tracked trades`,
    })
  }

  // Disciplined vs undisciplined average P&L
  const disciplined   = trades.filter(t => parseJson(t.mistakes).length === 0 && parseJson(t.rules_broken).length === 0)
  const undisciplined = trades.filter(t => parseJson(t.mistakes).length > 0 || parseJson(t.rules_broken).length > 0)
  if (disciplined.length > 0 && undisciplined.length > 0) {
    const disc_avg   = disciplined.reduce((a, t) => a + (t.pnl || 0), 0) / disciplined.length
    const undisc_avg = undisciplined.reduce((a, t) => a + (t.pnl || 0), 0) / undisciplined.length
    insights.push({
      type: 'discipline', color: 'green',
      title: 'Discipline Pays Off',
      value: `${disc_avg >= 0 ? '+' : ''}$${disc_avg.toFixed(2)} vs ${undisc_avg >= 0 ? '+' : ''}$${undisc_avg.toFixed(2)}`,
      detail: 'Avg P&L: disciplined vs undisciplined',
    })
  }

  // Most common mistake
  const mistakeCounts = {}
  trades.forEach(t => {
    parseJson(t.mistakes).forEach(m => { mistakeCounts[m] = (mistakeCounts[m] || 0) + 1 })
  })
  const mostCommon = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0]
  if (mostCommon) {
    insights.push({
      type: 'mistake', color: 'yellow',
      title: 'Most Common Mistake',
      value: mostCommon[0],
      detail: `Occurred in ${mostCommon[1]} trade${mostCommon[1] > 1 ? 's' : ''}`,
    })
  }

  res.json({ tilt_score: current_tilt, discipline_score, tilt_trend, total_trades: trades.length, insights })
})

// ── Emotion performance ────────────────────────────────────────────────────────
router.get('/emotion-performance', (req, res) => {
  const { from, to } = req.query
  const { clause, params } = dateFilter(from, to)

  const trades = db.prepare(`
    SELECT pnl, emotions
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL AND emotions IS NOT NULL AND emotions != '[]' ${clause}
  `).all(params)

  const byEmotion = {}
  trades.forEach(t => {
    parseJson(t.emotions).forEach(e => {
      if (!byEmotion[e]) byEmotion[e] = { pnls: [], wins: 0 }
      byEmotion[e].pnls.push(t.pnl)
      if (t.pnl > 0) byEmotion[e].wins++
    })
  })

  res.json(
    Object.entries(byEmotion).map(([emotion, d]) => ({
      emotion,
      count:     d.pnls.length,
      avg_pnl:   d.pnls.reduce((a, b) => a + b, 0) / d.pnls.length,
      total_pnl: d.pnls.reduce((a, b) => a + b, 0),
      win_rate:  (d.wins / d.pnls.length) * 100,
    })).sort((a, b) => b.count - a.count)
  )
})

// ── Emotion frequency by month ─────────────────────────────────────────────────
router.get('/emotion-frequency', (req, res) => {
  const { from, to } = req.query
  const { clause, params } = dateFilter(from, to)

  const trades = db.prepare(`
    SELECT date, emotions
    FROM trades
    WHERE status = 'closed' AND emotions IS NOT NULL AND emotions != '[]' ${clause}
    ORDER BY date ASC
  `).all(params)

  const byMonth = {}
  const allEmotions = new Set()

  trades.forEach(t => {
    const month = t.date.slice(0, 7)
    if (!byMonth[month]) byMonth[month] = {}
    parseJson(t.emotions).forEach(e => {
      allEmotions.add(e)
      byMonth[month][e] = (byMonth[month][e] || 0) + 1
    })
  })

  res.json({
    months: Object.keys(byMonth).sort(),
    emotions: [...allEmotions],
    data: byMonth,
  })
})

// ── Rule compliance ────────────────────────────────────────────────────────────
router.get('/rule-compliance', (req, res) => {
  const { from, to } = req.query
  const { clause, params } = dateFilter(from, to)

  const trades = db.prepare(`
    SELECT pnl, mistakes, rules_followed, rules_broken
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    ORDER BY date ASC
  `).all(params)

  const ruleStats = {}
  trades.forEach(t => {
    const followed = parseJson(t.rules_followed)
    const broken   = parseJson(t.rules_broken)
    followed.forEach(r => {
      if (!ruleStats[r]) ruleStats[r] = { followed: 0, broken: 0, pnl_f: [], pnl_b: [] }
      ruleStats[r].followed++
      ruleStats[r].pnl_f.push(t.pnl)
    })
    broken.forEach(r => {
      if (!ruleStats[r]) ruleStats[r] = { followed: 0, broken: 0, pnl_f: [], pnl_b: [] }
      ruleStats[r].broken++
      ruleStats[r].pnl_b.push(t.pnl)
    })
  })

  const disciplined   = trades.filter(t => parseJson(t.mistakes).length === 0 && parseJson(t.rules_broken).length === 0)
  const undisciplined = trades.filter(t => parseJson(t.mistakes).length > 0 || parseJson(t.rules_broken).length > 0)

  const tracked   = trades.filter(t => parseJson(t.rules_followed).length > 0 || parseJson(t.rules_broken).length > 0)
  const compliant = tracked.filter(t => parseJson(t.rules_broken).length === 0)

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const wr  = arr => arr.length ? (arr.filter(v => v > 0).length / arr.length) * 100 : 0

  res.json({
    overall_compliance: tracked.length > 0 ? (compliant.length / tracked.length) * 100 : null,
    tracked_trades: tracked.length,
    total_trades: trades.length,
    disciplined:   { count: disciplined.length,   avg_pnl: avg(disciplined.map(t => t.pnl)),   win_rate: wr(disciplined.map(t => t.pnl)) },
    undisciplined: { count: undisciplined.length, avg_pnl: avg(undisciplined.map(t => t.pnl)), win_rate: wr(undisciplined.map(t => t.pnl)) },
    rules: Object.entries(ruleStats).map(([rule, s]) => ({
      rule,
      followed: s.followed,
      broken:   s.broken,
      total:    s.followed + s.broken,
      compliance_pct: (s.followed / (s.followed + s.broken)) * 100,
      avg_pnl_followed: s.pnl_f.length ? avg(s.pnl_f) : null,
      avg_pnl_broken:   s.pnl_b.length ? avg(s.pnl_b) : null,
    })).sort((a, b) => a.compliance_pct - b.compliance_pct),
  })
})

// ── Mistake stats ─────────────────────────────────────────────────────────────
router.get('/mistake-stats', (req, res) => {
  const { from, to } = req.query
  const { clause, params } = dateFilter(from, to)

  const trades = db.prepare(`
    SELECT date, pnl, mistakes
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL AND mistakes IS NOT NULL AND mistakes != '[]' ${clause}
    ORDER BY date ASC
  `).all(params)

  const byMistake = {}
  const byMonth   = {}

  trades.forEach(t => {
    const month    = t.date.slice(0, 7)
    const mistakes = parseJson(t.mistakes)
    if (!byMonth[month]) byMonth[month] = 0
    byMonth[month] += mistakes.length
    mistakes.forEach(m => {
      if (!byMistake[m]) byMistake[m] = { count: 0, pnls: [] }
      byMistake[m].count++
      byMistake[m].pnls.push(t.pnl)
    })
  })

  res.json({
    by_mistake: Object.entries(byMistake).map(([mistake, d]) => ({
      mistake,
      count:     d.count,
      total_pnl: d.pnls.reduce((a, b) => a + b, 0),
      avg_pnl:   d.pnls.reduce((a, b) => a + b, 0) / d.pnls.length,
    })).sort((a, b) => b.count - a.count),
    by_month: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
  })
})

// ── Session quality (from journal mood) ────────────────────────────────────────
router.get('/session-quality', (req, res) => {
  const { from, to } = req.query

  const journalWhere  = ['je.mood IS NOT NULL']
  const journalParams = []
  if (from) { journalWhere.push('je.date >= ?'); journalParams.push(from) }
  if (to)   { journalWhere.push('je.date <= ?'); journalParams.push(to) }

  const sessions = db.prepare(`
    SELECT je.date, je.mood
    FROM journal_entries je
    WHERE ${journalWhere.join(' AND ')}
    ORDER BY je.date ASC
  `).all(...journalParams)

  const { clause, params } = dateFilter(from, to)
  const dailyPnl = db.prepare(`
    SELECT date, SUM(pnl) as pnl
    FROM trades
    WHERE status = 'closed' AND pnl IS NOT NULL ${clause}
    GROUP BY date
  `).all(params)

  const pnlByDate = {}
  dailyPnl.forEach(d => { pnlByDate[d.date] = d.pnl })

  const sessionData = sessions.map(s => ({
    date:   s.date,
    mood:   s.mood,
    rating: MOOD_SCORE[s.mood] ?? null,
    pnl:    pnlByDate[s.date] ?? null,
  }))

  // Aggregate by month
  const byMonth = {}
  sessionData.forEach(s => {
    const m = s.date.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = { ratings: [], pnls: [] }
    if (s.rating != null) byMonth[m].ratings.push(s.rating)
    if (s.pnl    != null) byMonth[m].pnls.push(s.pnl)
  })
  const by_month = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({
    month,
    avg_rating: d.ratings.length ? d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length : null,
    avg_pnl:    d.pnls.length    ? d.pnls.reduce((a, b) => a + b, 0)    / d.pnls.length    : null,
  }))

  // Avg P&L by rating level
  const byRating = {}
  sessionData.filter(s => s.rating && s.pnl != null).forEach(s => {
    if (!byRating[s.rating]) byRating[s.rating] = []
    byRating[s.rating].push(s.pnl)
  })
  const pnl_by_rating = [1, 2, 3, 4, 5].map(r => ({
    rating:  r,
    label:   ['', 'Terrible', 'Bad', 'Neutral', 'Good', 'Great'][r],
    count:   byRating[r]?.length ?? 0,
    avg_pnl: byRating[r]?.length ? byRating[r].reduce((a, b) => a + b, 0) / byRating[r].length : null,
  }))

  res.json({ sessions: sessionData, by_month, pnl_by_rating })
})

export default router
