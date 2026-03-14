import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ComposedChart, Area, ReferenceLine, Cell, Legend,
} from 'recharts'
import { psychologyApi } from '../api/psychology.js'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v, digits = 2) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(digits)}`

const fmtPct = (v) => v == null ? '—' : `${v.toFixed(1)}%`

function tiltColor(score) {
  if (score <= 33) return '#34d399'
  if (score <= 66) return '#fbbf24'
  return '#f87171'
}

function tiltZone(score) {
  if (score <= 33) return { label: 'Trading Well', color: 'emerald' }
  if (score <= 66) return { label: 'Caution', color: 'yellow' }
  return { label: 'Tilting!', color: 'red' }
}

// ── Tilt Gauge (SVG semicircle) ───────────────────────────────────────────────
function TiltGauge({ score = 0 }) {
  const R = 80
  const cx = 100, cy = 100
  const startAngle = Math.PI        // 180° = left
  const endAngle   = 0             // 0° = right
  const toXY = (angle) => ({
    x: cx + R * Math.cos(angle),
    y: cy - R * Math.sin(angle),
  })

  // Arc path helper (going clockwise from left to right via top)
  const arcPath = (from, to, r) => {
    const s = { x: cx + r * Math.cos(from), y: cy - r * Math.sin(from) }
    const e = { x: cx + r * Math.cos(to),   y: cy - r * Math.sin(to) }
    return `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`
  }

  // Zone arcs: green 180°→120°, yellow 120°→60°, red 60°→0°
  const greenEnd  = Math.PI * (2/3)  // 120°
  const yellowEnd = Math.PI * (1/3)  // 60°

  // Needle angle: score 0 → left (180°), score 100 → right (0°)
  const needleAngle = Math.PI - (score / 100) * Math.PI
  const needleTip = toXY(needleAngle)
  const needleBase1 = { x: cx + 6 * Math.cos(needleAngle + Math.PI / 2), y: cy - 6 * Math.sin(needleAngle + Math.PI / 2) }
  const needleBase2 = { x: cx + 6 * Math.cos(needleAngle - Math.PI / 2), y: cy - 6 * Math.sin(needleAngle - Math.PI / 2) }

  const zone = tiltZone(score)
  const zoneColors = { emerald: '#34d399', yellow: '#fbbf24', red: '#f87171' }
  const zoneTextColors = { emerald: 'text-emerald-400', yellow: 'text-yellow-400', red: 'text-red-400' }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="20 20 160 95" width="260" height="130">
        {/* Track */}
        <path d={arcPath(Math.PI, 0, R)} fill="none" stroke="#374151" strokeWidth="14" />
        {/* Green zone */}
        <path d={arcPath(Math.PI, greenEnd, R)} fill="none" stroke="#065f46" strokeWidth="14" />
        {/* Yellow zone */}
        <path d={arcPath(greenEnd, yellowEnd, R)} fill="none" stroke="#78350f" strokeWidth="14" />
        {/* Red zone */}
        <path d={arcPath(yellowEnd, 0, R)} fill="none" stroke="#7f1d1d" strokeWidth="14" />
        {/* Active fill */}
        <path d={arcPath(Math.PI, needleAngle, R)} fill="none" stroke={zoneColors[zone.color]} strokeWidth="14" opacity="0.9" />
        {/* Tick marks */}
        {[0, 33, 66, 100].map(v => {
          const a = Math.PI - (v / 100) * Math.PI
          const inner = toXY2(cx, cy, a, R - 10)
          const outer = toXY2(cx, cy, a, R + 10)
          return <line key={v} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#4b5563" strokeWidth="1.5" />
        })}
        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={zoneColors[zone.color]}
          opacity="0.95"
        />
        <circle cx={cx} cy={cy} r="5" fill={zoneColors[zone.color]} />
        {/* Score text */}
        <text x={cx} y={cy - 20} textAnchor="middle" fill="white" fontSize="22" fontWeight="bold" fontFamily="monospace">
          {score}
        </text>
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#9ca3af" fontSize="7.5">
          TILT SCORE
        </text>
        {/* Zone labels */}
        <text x="32" y={cy + 12} textAnchor="middle" fill="#34d399" fontSize="7">CALM</text>
        <text x={cx} y="30"    textAnchor="middle" fill="#fbbf24" fontSize="7">CAUTION</text>
        <text x="168" y={cy + 12} textAnchor="middle" fill="#f87171" fontSize="7">TILT</text>
      </svg>
      <div className={`text-lg font-bold ${zoneTextColors[zone.color]}`}>{zone.label}</div>
    </div>
  )
}

function toXY2(cx, cy, angle, r) {
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) }
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>{p.name}: {p.value != null ? p.value.toFixed(2) : '—'}</p>
      ))}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Emotions', 'Rules', 'Mistakes', 'Sessions']

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children, className = '' }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow ${className}`}>
      {title && <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>}
      {children}
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────
const INSIGHT_COLORS = {
  red:    { bg: 'bg-red-500/5 border-red-500/20',    icon: 'text-red-400',    dot: 'bg-red-400' },
  orange: { bg: 'bg-orange-500/5 border-orange-500/20', icon: 'text-orange-400', dot: 'bg-orange-400' },
  green:  { bg: 'bg-emerald-500/5 border-emerald-500/20', icon: 'text-emerald-400', dot: 'bg-emerald-400' },
  yellow: { bg: 'bg-yellow-500/5 border-yellow-500/20', icon: 'text-yellow-400', dot: 'bg-yellow-400' },
}

function InsightCard({ insight }) {
  const c = INSIGHT_COLORS[insight.color] ?? INSIGHT_COLORS.yellow
  return (
    <div className={`rounded-xl border p-4 card-glow ${c.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{insight.title}</span>
      </div>
      <div className={`text-base font-bold ${c.icon} mb-0.5`}>{insight.value}</div>
      <div className="text-xs text-gray-500">{insight.detail}</div>
    </div>
  )
}

// ── Stat mini card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'white' }) {
  const colorMap = { white: 'text-white', emerald: 'text-emerald-400', red: 'text-red-400', yellow: 'text-yellow-400', indigo: 'text-indigo-400' }
  return (
    <div className="bg-gray-800/50 rounded-lg px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${colorMap[color] ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ summary, tiltHistory }) {
  if (!summary) return <LoadingSpinner className="h-40" />

  const zone = tiltZone(summary.tilt_score)
  const trendDir = summary.tilt_trend > 2 ? '↑ Getting worse' : summary.tilt_trend < -2 ? '↓ Improving' : '→ Stable'
  const trendColor = summary.tilt_trend > 2 ? 'text-red-400' : summary.tilt_trend < -2 ? 'text-emerald-400' : 'text-gray-400'

  return (
    <div className="space-y-5">
      {/* Tilt Meter + stats */}
      <Section>
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <TiltGauge score={summary.tilt_score} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 w-full">
            <StatCard
              label="Tilt Score"
              value={summary.tilt_score}
              sub={zone.label}
              color={zone.color === 'emerald' ? 'emerald' : zone.color === 'yellow' ? 'yellow' : 'red'}
            />
            <StatCard
              label="Discipline Score"
              value={`${summary.discipline_score}`}
              sub="out of 100"
              color={summary.discipline_score >= 67 ? 'emerald' : summary.discipline_score >= 34 ? 'yellow' : 'red'}
            />
            <StatCard label="Total Trades" value={summary.total_trades} />
            <div className="bg-gray-800/50 rounded-lg px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">Recent Trend</div>
              <div className={`text-sm font-semibold ${trendColor}`}>{trendDir}</div>
              <div className="text-xs text-gray-600 mt-0.5">vs previous 5 trades</div>
            </div>
          </div>
        </div>
        {summary.tilt_score >= 67 && (
          <div className="mt-4 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-red-300 font-medium">
              High tilt detected — consider taking a break or reducing position sizes.
            </span>
          </div>
        )}
      </Section>

      {/* Equity + Tilt History Chart */}
      {tiltHistory?.length > 1 && (
        <Section title="Equity Curve vs Tilt Score">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={tiltHistory} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={d => d?.slice(5)} />
              <YAxis yAxisId="equity" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${v >= 0 ? '' : '-'}${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : Math.abs(v).toFixed(0)}`} />
              <YAxis yAxisId="tilt" orientation="right" domain={[0, 100]}
                tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v}`} />
              <Tooltip content={<TiltChartTip />} />
              <Area yAxisId="equity" type="monotone" dataKey="equity" fill="#312e81" stroke="#6366f1"
                strokeWidth={2} fillOpacity={0.3} name="Equity" dot={false} />
              <Line yAxisId="tilt" type="monotone" dataKey="tilt_score" stroke="#fbbf24"
                strokeWidth={2} dot={false} name="Tilt" strokeDasharray="4 2" />
              <ReferenceLine yAxisId="tilt" y={33} stroke="#34d399" strokeDasharray="2 4" strokeOpacity={0.4} />
              <ReferenceLine yAxisId="tilt" y={67} stroke="#f87171" strokeDasharray="2 4" strokeOpacity={0.4} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Equity</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-yellow-400 inline-block border-dashed" style={{borderTop:'2px dashed #fbbf24', background:'none'}} /> Tilt Score</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block opacity-40" /> Calm Zone</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block opacity-40" /> Tilt Zone</span>
          </div>
        </Section>
      )}

      {/* Insights */}
      {summary.insights?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Key Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
          </div>
        </div>
      )}

      {summary.total_trades === 0 && (
        <EmptyState message="No closed trades yet. Log some trades with psychology data to see your overview." />
      )}
    </div>
  )
}

function TiltChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const equity    = payload.find(p => p.name === 'Equity')?.value
  const tiltScore = payload.find(p => p.name === 'Tilt')?.value
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {equity    != null && <p className={equity >= 0 ? 'text-emerald-400' : 'text-red-400'}>Equity: {fmt(equity, 0)}</p>}
      {tiltScore != null && <p style={{ color: tiltColor(tiltScore) }}>Tilt: {tiltScore}</p>}
    </div>
  )
}

// ── Emotions Tab ──────────────────────────────────────────────────────────────
function EmotionsTab({ emotionPerf, emotionFreq }) {
  if (!emotionPerf || !emotionFreq) return <LoadingSpinner className="h-40" />
  const isEmpty = emotionPerf.length === 0

  const perfData = [...emotionPerf].sort((a, b) => b.count - a.count).slice(0, 12)

  return (
    <div className="space-y-5">
      {isEmpty && <EmptyState message="No emotion data yet. Add emotions when logging trades to see analysis here." />}

      {!isEmpty && (
        <>
          {/* Performance by emotion */}
          <Section title="Average P&L by Emotion">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={perfData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${v >= 0 ? '' : ''}${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="emotion" tick={{ fill: '#d1d5db', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip content={<EmotionPerfTip />} />
                <Bar dataKey="avg_pnl" name="Avg P&L" radius={[0, 4, 4, 0]}>
                  {perfData.map((entry, i) => (
                    <Cell key={i} fill={entry.avg_pnl >= 0 ? '#059669' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Win rate by emotion */}
          <Section title="Win Rate & Trade Count by Emotion">
            <div className="space-y-2">
              {perfData.map((e) => (
                <div key={e.emotion} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-gray-300 truncate shrink-0">{e.emotion}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${e.win_rate}%`, backgroundColor: e.win_rate >= 50 ? '#059669' : '#dc2626' }} />
                  </div>
                  <div className="w-10 text-xs text-gray-400 font-mono text-right">{e.win_rate.toFixed(0)}%</div>
                  <div className="w-14 text-xs text-gray-600 text-right">{e.count} trade{e.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Frequency over time */}
          {emotionFreq.months?.length > 0 && (
            <Section title="Emotion Frequency Over Time">
              <EmotionFrequencyChart data={emotionFreq} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function EmotionPerfTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-200 font-semibold mb-1">{d.emotion}</p>
      <p className={d.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>Avg P&L: {fmt(d.avg_pnl)}</p>
      <p className="text-gray-400">Win Rate: {fmtPct(d.win_rate)}</p>
      <p className="text-gray-400">Trades: {d.count}</p>
      <p className={d.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>Total P&L: {fmt(d.total_pnl)}</p>
    </div>
  )
}

const EMOTION_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#14b8a6', '#a855f7', '#f59e0b']

function EmotionFrequencyChart({ data }) {
  const { months, emotions, data: byMonth } = data
  const chartData = months.map(m => {
    const row = { month: m }
    emotions.forEach(e => { row[e] = byMonth[m]?.[e] ?? 0 })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
        {emotions.slice(0, 8).map((e, i) => (
          <Bar key={e} dataKey={e} stackId="a" fill={EMOTION_COLORS[i % EMOTION_COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Rules Tab ────────────────────────────────────────────────────────────────
function RulesTab({ compliance }) {
  if (!compliance) return <LoadingSpinner className="h-40" />
  const { overall_compliance, tracked_trades, total_trades, disciplined, undisciplined, rules } = compliance
  const hasData = tracked_trades > 0

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Overall Compliance"
          value={overall_compliance != null ? `${overall_compliance.toFixed(0)}%` : '—'}
          sub={`${tracked_trades} tracked trades`}
          color={overall_compliance == null ? 'white' : overall_compliance >= 70 ? 'emerald' : overall_compliance >= 40 ? 'yellow' : 'red'}
        />
        <StatCard
          label="Disciplined Avg P&L"
          value={disciplined.count > 0 ? fmt(disciplined.avg_pnl) : '—'}
          sub={`${disciplined.count} trades`}
          color={disciplined.avg_pnl >= 0 ? 'emerald' : 'red'}
        />
        <StatCard
          label="Undisciplined Avg P&L"
          value={undisciplined.count > 0 ? fmt(undisciplined.avg_pnl) : '—'}
          sub={`${undisciplined.count} trades`}
          color={undisciplined.avg_pnl >= 0 ? 'emerald' : 'red'}
        />
        <StatCard
          label="Disciplined Win Rate"
          value={disciplined.count > 0 ? fmtPct(disciplined.win_rate) : '—'}
          sub={`vs ${undisciplined.count > 0 ? fmtPct(undisciplined.win_rate) : '—'} undisciplined`}
          color={disciplined.win_rate >= 50 ? 'emerald' : 'red'}
        />
      </div>

      {!hasData && (
        <EmptyState message="No rule compliance data yet. Add rules followed/broken when logging trades to see analysis here." />
      )}

      {hasData && rules.length > 0 && (
        <>
          {/* Per-rule compliance */}
          <Section title="Per-Rule Compliance">
            <div className="space-y-3">
              {rules.map((r) => (
                <div key={r.rule}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300 truncate">{r.rule}</span>
                    <span className="text-xs font-mono text-gray-400 ml-2 shrink-0">
                      {r.followed}/{r.total} ({r.compliance_pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="rounded-l-full bg-emerald-600 transition-all" style={{ width: `${r.compliance_pct}%` }} />
                    <div className="rounded-r-full bg-red-700 flex-1" />
                  </div>
                  {(r.avg_pnl_followed != null || r.avg_pnl_broken != null) && (
                    <div className="flex gap-4 mt-1 text-xs text-gray-600">
                      {r.avg_pnl_followed != null && (
                        <span className="text-emerald-600">Followed: {fmt(r.avg_pnl_followed)}</span>
                      )}
                      {r.avg_pnl_broken != null && (
                        <span className="text-red-600">Broken: {fmt(r.avg_pnl_broken)}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Disciplined vs Undisciplined comparison */}
          {disciplined.count > 0 && undisciplined.count > 0 && (
            <Section title="Disciplined vs Undisciplined Performance">
              <div className="grid grid-cols-2 gap-6">
                <CompareBar label="Avg P&L"
                  a={{ label: 'Disciplined', value: disciplined.avg_pnl, color: '#059669' }}
                  b={{ label: 'Undisciplined', value: undisciplined.avg_pnl, color: '#dc2626' }} />
                <CompareBar label="Win Rate"
                  a={{ label: 'Disciplined', value: disciplined.win_rate, color: '#059669', suffix: '%' }}
                  b={{ label: 'Undisciplined', value: undisciplined.win_rate, color: '#dc2626', suffix: '%' }} />
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function CompareBar({ label, a, b }) {
  const max = Math.max(Math.abs(a.value || 0), Math.abs(b.value || 0)) || 1
  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">{label}</div>
      <div className="space-y-2">
        {[a, b].map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">{item.label}</span>
              <span className="font-mono" style={{ color: item.color }}>
                {item.suffix ? `${(item.value || 0).toFixed(1)}${item.suffix}` : fmt(item.value)}
              </span>
            </div>
            <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.abs(item.value || 0) / max * 100}%`,
                backgroundColor: item.color,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mistakes Tab ──────────────────────────────────────────────────────────────
function MistakesTab({ mistakes }) {
  if (!mistakes) return <LoadingSpinner className="h-40" />
  const { by_mistake, by_month } = mistakes
  const isEmpty = by_mistake.length === 0

  return (
    <div className="space-y-5">
      {isEmpty && <EmptyState message="No mistake data yet. Add mistakes when logging trades to track patterns here." />}

      {!isEmpty && (
        <>
          {/* Frequency chart */}
          <Section title="Mistake Frequency">
            <ResponsiveContainer width="100%" height={Math.max(200, by_mistake.length * 38)}>
              <BarChart data={by_mistake} layout="vertical" margin={{ top: 0, right: 20, left: 120, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="mistake" tick={{ fill: '#d1d5db', fontSize: 11 }} tickLine={false} axisLine={false} width={115} />
                <Tooltip content={<MistakeTip />} />
                <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* P&L cost chart */}
          <Section title="P&L Cost by Mistake Type">
            <ResponsiveContainer width="100%" height={Math.max(200, by_mistake.length * 38)}>
              <BarChart data={by_mistake} layout="vertical" margin={{ top: 0, right: 20, left: 120, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="mistake" tick={{ fill: '#d1d5db', fontSize: 11 }} tickLine={false} axisLine={false} width={115} />
                <Tooltip content={<MistakeTip showPnl />} />
                <ReferenceLine x={0} stroke="#374151" />
                <Bar dataKey="total_pnl" name="Total P&L" radius={[0, 4, 4, 0]}>
                  {by_mistake.map((entry, i) => (
                    <Cell key={i} fill={entry.total_pnl >= 0 ? '#059669' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Mistake trend */}
          {by_month.length > 1 && (
            <Section title="Mistake Frequency Over Time">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={by_month} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="count" stroke="#f87171" strokeWidth={2} dot={{ fill: '#f87171', r: 3 }} name="Mistakes" />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function MistakeTip({ active, payload, label, showPnl }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-200 font-semibold mb-1">{d.mistake}</p>
      {!showPnl && <p className="text-purple-400">Count: {d.count}</p>}
      {showPnl && <p className={d.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>Total P&L: {fmt(d.total_pnl)}</p>}
      {showPnl && <p className={d.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>Avg P&L: {fmt(d.avg_pnl)}</p>}
    </div>
  )
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab({ sessions }) {
  if (!sessions) return <LoadingSpinner className="h-40" />
  const { sessions: sessionList, by_month, pnl_by_rating } = sessions
  const isEmpty = sessionList.length === 0

  const MOOD_COLORS = { great: '#34d399', good: '#6ee7b7', neutral: '#9ca3af', bad: '#fca5a5', terrible: '#f87171' }

  return (
    <div className="space-y-5">
      {isEmpty && (
        <EmptyState message="No session data yet. Add mood to your journal entries to track session quality here." />
      )}

      {!isEmpty && (
        <>
          {/* Session ratings by month */}
          {by_month.length > 0 && (
            <Section title="Average Session Rating Over Time">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={by_month} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="rating" domain={[1, 5]} ticks={[1,2,3,4,5]}
                    tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => ['','Terrible','Bad','Neutral','Good','Great'][v] ?? v} />
                  <YAxis yAxisId="pnl" orientation="right"
                    tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${v >= 0 ? '' : ''}${v.toFixed(0)}`} />
                  <Tooltip content={<SessionTip />} />
                  <Bar yAxisId="pnl" dataKey="avg_pnl" name="Avg P&L" radius={[3,3,0,0]} opacity={0.5}>
                    {by_month.map((d, i) => <Cell key={i} fill={d.avg_pnl >= 0 ? '#059669' : '#dc2626'} />)}
                  </Bar>
                  <Line yAxisId="rating" type="monotone" dataKey="avg_rating" stroke="#a78bfa" strokeWidth={2.5}
                    dot={{ fill: '#a78bfa', r: 3 }} name="Avg Rating" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-5 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-400 inline-block" /> Session Rating</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-emerald-600 inline-block opacity-50 rounded" /> Avg P&L</span>
              </div>
            </Section>
          )}

          {/* P&L by rating level */}
          <Section title="P&L Correlation by Session Rating">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pnl_by_rating.filter(r => r.count > 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${v.toFixed(0)}`} />
                <Tooltip content={<SessionRatingTip />} />
                <ReferenceLine y={0} stroke="#374151" />
                <Bar dataKey="avg_pnl" name="Avg P&L" radius={[4, 4, 0, 0]}>
                  {pnl_by_rating.filter(r => r.count > 0).map((d, i) => (
                    <Cell key={i} fill={d.avg_pnl >= 0 ? '#059669' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Recent sessions list */}
          <Section title="Recent Sessions">
            <div className="space-y-1.5">
              {sessionList.slice(-20).reverse().map((s) => (
                <div key={s.date} className="flex items-center justify-between py-1.5 border-b border-gray-800/60 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-mono w-20">{s.date}</span>
                    <span className="px-2 py-0.5 rounded text-xs capitalize"
                      style={{ background: `${MOOD_COLORS[s.mood]}18`, color: MOOD_COLORS[s.mood] }}>
                      {s.mood}
                    </span>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i <= s.rating ? MOOD_COLORS[s.mood] : '#374151' }} />
                      ))}
                    </div>
                  </div>
                  {s.pnl != null && (
                    <span className={`text-xs font-mono ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt(s.pnl, 0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function SessionTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{d?.month}</p>
      {d?.avg_rating != null && <p className="text-violet-400">Avg Rating: {d.avg_rating.toFixed(1)} / 5</p>}
      {d?.avg_pnl != null && <p className={d.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>Avg P&L: {fmt(d.avg_pnl)}</p>}
    </div>
  )
}

function SessionRatingTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-200 font-semibold mb-1">{d?.label}</p>
      {d?.avg_pnl != null && <p className={d.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>Avg P&L: {fmt(d.avg_pnl)}</p>}
      <p className="text-gray-400">{d?.count} session{d?.count !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center card-glow">
      <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">{message}</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Psychology() {
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading]     = useState(true)

  const [summary,      setSummary]      = useState(null)
  const [tiltHistory,  setTiltHistory]  = useState(null)
  const [emotionPerf,  setEmotionPerf]  = useState(null)
  const [emotionFreq,  setEmotionFreq]  = useState(null)
  const [compliance,   setCompliance]   = useState(null)
  const [mistakes,     setMistakes]     = useState(null)
  const [sessions,     setSessions]     = useState(null)

  useEffect(() => {
    Promise.all([
      psychologyApi.summary(),
      psychologyApi.tiltHistory(),
      psychologyApi.emotionPerformance(),
      psychologyApi.emotionFrequency(),
      psychologyApi.ruleCompliance(),
      psychologyApi.mistakeStats(),
      psychologyApi.sessionQuality(),
    ]).then(([sum, tilt, emoPerf, emoFreq, comp, mist, sess]) => {
      setSummary(sum)
      setTiltHistory(tilt)
      setEmotionPerf(emoPerf)
      setEmotionFreq(emoFreq)
      setCompliance(comp)
      setMistakes(mist)
      setSessions(sess)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Psychology</h1>
        <p className="text-sm text-gray-500 mt-1">Track your trading mindset, discipline, and emotional patterns</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === i
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <LoadingSpinner className="h-64" />
      ) : (
        <>
          {activeTab === 0 && <OverviewTab summary={summary} tiltHistory={tiltHistory} />}
          {activeTab === 1 && <EmotionsTab emotionPerf={emotionPerf} emotionFreq={emotionFreq} />}
          {activeTab === 2 && <RulesTab compliance={compliance} />}
          {activeTab === 3 && <MistakesTab mistakes={mistakes} />}
          {activeTab === 4 && <SessionsTab sessions={sessions} />}
        </>
      )}
    </div>
  )
}
