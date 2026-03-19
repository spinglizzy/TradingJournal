import { useState, useEffect, useCallback } from 'react'
import { X, Eye, EyeOff, Pencil, Trash2, Plus, Target } from 'lucide-react'
import { goalsApi } from '../api/goals.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS = [
  { value: 'pnl',              label: 'P&L ($)',            unit: '$',  direction: 'above' },
  { value: 'win_rate',         label: 'Win Rate (%)',       unit: '%',  direction: 'above' },
  { value: 'trade_count',      label: 'Trade Count',        unit: '',   direction: 'above' },
  { value: 'discipline_score', label: 'Discipline Score (%)',unit: '%', direction: 'above' },
  { value: 'journal_streak',   label: 'Journal Streak (days)',unit: 'd',direction: 'above' },
  { value: 'max_daily_loss',   label: 'Max Daily Loss ($)', unit: '$',  direction: 'below' },
]

const TIMEFRAMES = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
]

const ACHIEVEMENT_CATEGORIES = ['trading', 'journaling', 'discipline', 'custom']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(v % 1 === 0 ? 0 : 1) : v
}

function fmtMetricValue(metric, value) {
  if (value == null) return '—'
  if (metric === 'pnl' || metric === 'max_daily_loss') return `$${value.toFixed(2)}`
  if (metric === 'win_rate' || metric === 'discipline_score') return `${value.toFixed(1)}%`
  if (metric === 'journal_streak') return `${Math.round(value)} days`
  return Math.round(value).toString()
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function metaForMetric(metric) {
  return METRICS.find(m => m.value === metric) || METRICS[0]
}

// ── Goal Form Modal ───────────────────────────────────────────────────────────

function GoalFormModal({ goal, onSave, onClose }) {
  const defaultMetric = METRICS[0]
  const [form, setForm] = useState({
    name: goal?.name ?? '',
    metric: goal?.metric ?? defaultMetric.value,
    target_value: goal?.target_value ?? '',
    timeframe: goal?.timeframe ?? 'daily',
    direction: goal?.direction ?? defaultMetric.direction,
    active: goal?.active ?? true,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleMetricChange(val) {
    const meta = metaForMetric(val)
    setForm(f => ({ ...f, metric: val, direction: meta.direction }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || form.target_value === '') return
    const payload = { ...form, target_value: parseFloat(form.target_value) }
    await onSave(payload)
  }

  const selectedMetric = metaForMetric(form.metric)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">{goal ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Goal Name</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Make $500/day"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Metric</label>
              <select
                value={form.metric}
                onChange={e => handleMetricChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {METRICS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Timeframe</label>
              <select
                value={form.timeframe}
                onChange={e => set('timeframe', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {TIMEFRAMES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Target {selectedMetric.unit ? `(${selectedMetric.unit})` : ''}
              </label>
              <input
                type="number"
                step="any"
                value={form.target_value}
                onChange={e => set('target_value', e.target.value)}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Direction</label>
              <select
                value={form.direction}
                onChange={e => set('direction', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="above">At least (≥)</option>
                <option value="below">At most (≤)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => set('active', e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600"
              />
              <span className="text-sm text-gray-400">Active</span>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {goal ? 'Save Changes' : 'Create Goal'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Achievement Form Modal ────────────────────────────────────────────────────

const ICONS = ['🏆','🎯','📊','💰','🔥','🚀','✅','📖','💎','⭐','🎓','🏅','⚡','🎰','🌟']

function AchievementFormModal({ ach, onSave, onClose }) {
  const [form, setForm] = useState({
    name: ach?.name ?? '',
    description: ach?.description ?? '',
    icon: ach?.icon ?? '🏆',
    category: ach?.category ?? 'custom',
    earned_at: ach?.earned_at ?? null,
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">{ach ? 'Edit Milestone' : 'New Milestone'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Perfect Week"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this milestone represent?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, icon }))}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-xl transition-all
                    ${form.icon === icon ? 'bg-indigo-600 ring-2 ring-indigo-400' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              {ACHIEVEMENT_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Earned Date (optional)</label>
            <input
              type="date"
              value={form.earned_at ? form.earned_at.split('T')[0] : ''}
              onChange={e => setForm(f => ({ ...f, earned_at: e.target.value ? e.target.value + 'T00:00:00.000Z' : null }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {ach ? 'Save Changes' : 'Create Milestone'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'indigo', size = 'md' }) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5'
  const colors = {
    indigo:  'bg-indigo-500',
    emerald: 'bg-emerald-500',
    red:     'bg-red-500',
    amber:   'bg-amber-500',
  }
  return (
    <div className={`w-full bg-gray-800 rounded-full ${h} overflow-hidden`}>
      <div
        className={`${h} rounded-full transition-all duration-500 ${colors[color] || colors.indigo}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onEdit, onDelete, onToggle }) {
  const meta = metaForMetric(goal.metric)
  const isBelow = goal.direction === 'below'
  const color = goal.is_met ? 'emerald' : goal.progress >= 70 ? 'amber' : 'indigo'

  return (
    <div className={`bg-gray-900 border rounded-xl p-5 transition-all card-glow
      ${goal.active ? 'border-gray-800' : 'border-gray-800/50 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
              ${goal.active ? 'bg-indigo-500/15 text-indigo-400' : 'bg-gray-800 text-gray-500'}`}>
              {goal.timeframe}
            </span>
            {goal.is_met && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400">
                ✓ Met
              </span>
            )}
          </div>
          <h3 className="text-white font-medium text-sm mt-1 truncate">{goal.name}</h3>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(goal)}
            title={goal.active ? 'Deactivate' : 'Activate'}
            className={`p-1.5 rounded transition-colors ${goal.active ? 'text-indigo-400 hover:text-indigo-300' : 'text-gray-600 hover:text-gray-400'}`}
          >
            {goal.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(goal)}
            className="p-1.5 rounded text-gray-600 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{meta.label}</p>
          <p className={`text-lg font-bold ${goal.is_met ? 'text-emerald-400' : 'text-white'}`}>
            {fmtMetricValue(goal.metric, goal.current_value)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-0.5">Target {isBelow ? '≤' : '≥'}</p>
          <p className="text-sm text-gray-300">{fmtMetricValue(goal.metric, goal.target_value)}</p>
        </div>
      </div>

      <ProgressBar value={goal.progress} color={color} />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-600">{goal.period_from} – {goal.period_to}</span>
        <span className={`text-xs font-medium ${goal.is_met ? 'text-emerald-400' : 'text-gray-500'}`}>
          {goal.progress.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

// ── Streak Card ───────────────────────────────────────────────────────────────

function StreakCard({ title, icon, current, longest, longestStart, longestEnd, color = 'indigo' }) {
  const colors = {
    indigo:  { cur: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
    emerald: { cur: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    amber:   { cur: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  }
  const c = colors[color] || colors.indigo

  return (
    <div className={`bg-gray-900 border rounded-xl p-5 card-glow ${c.border}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-8 h-8 ${c.bg} rounded-lg flex items-center justify-center text-lg`}>{icon}</span>
        <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Current</p>
          <p className={`text-3xl font-bold ${c.cur}`}>{current}</p>
          <p className="text-xs text-gray-500 mt-0.5">days</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Personal Best</p>
          <p className="text-3xl font-bold text-white">{longest}</p>
          <p className="text-xs text-gray-500 mt-0.5">days</p>
        </div>
      </div>

      {longestStart && longestEnd && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500">Best streak period</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(longestStart)} – {fmtDate(longestEnd)}</p>
        </div>
      )}
    </div>
  )
}

// ── Achievement Badge ─────────────────────────────────────────────────────────

function AchievementBadge({ ach, onEdit, onDelete }) {
  const earned = Boolean(ach.earned_at)
  const hasProgress = ach.progress !== null && !earned

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-all card-glow
      ${earned ? 'border-yellow-600/40' : 'border-gray-800 opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0
          ${earned ? 'bg-yellow-500/15' : 'bg-gray-800'}`}>
          {earned ? ach.icon : <span className="opacity-30">{ach.icon}</span>}
        </div>
        {ach.custom && (
          <div className="flex gap-1 shrink-0">
            <button onClick={() => onEdit?.(ach)} className="p-1 text-gray-600 hover:text-gray-400 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete?.(ach)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h4 className={`text-sm font-semibold ${earned ? 'text-white' : 'text-gray-500'}`}>{ach.name}</h4>
          {ach.custom && (
            <span className="text-xs px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 rounded">custom</span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{ach.description}</p>
      </div>

      {earned ? (
        <div className="text-xs text-yellow-500/80">
          Earned {new Date(ach.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      ) : hasProgress ? (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{fmt(ach.current_value)} / {fmt(ach.threshold)}</span>
            <span>{ach.progress.toFixed(0)}%</span>
          </div>
          <ProgressBar value={ach.progress} color="indigo" size="sm" />
        </div>
      ) : null}
    </div>
  )
}

// ── Goal Progress Calendar ────────────────────────────────────────────────────

function GoalCalendar({ data }) {
  if (!data?.days?.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center card-glow">
        <p className="text-gray-500 text-sm">No active daily goals to track.</p>
        <p className="text-gray-600 text-xs mt-1">Create a daily goal to see calendar progress here.</p>
      </div>
    )
  }

  const STATUS_COLORS = {
    met:     'bg-emerald-500 opacity-90',
    partial: 'bg-yellow-500 opacity-70',
    missed:  'bg-red-500 opacity-60',
    none:    'bg-gray-800',
  }

  // Group days into weeks (rows)
  const days = data.days
  const today = new Date().toISOString().split('T')[0]

  // Find first date's weekday to offset the grid
  const firstDate = new Date(days[0].date + 'T00:00:00')
  const startDow = firstDate.getDay() // 0=Sun

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (const d of days) cells.push(d)

  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 card-glow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium">Daily Goal Completion — Last 90 Days</h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 opacity-90 inline-block" />All met
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-yellow-500 opacity-70 inline-block" />Partial
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500 opacity-60 inline-block" />Missed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-800 inline-block" />N/A
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {DOW.map(d => (
          <div key={d} className="text-center text-xs text-gray-600 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} />
          const isToday = cell.date === today
          return (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.met}/${cell.total} goals met`}
              className={`aspect-square rounded-sm cursor-default transition-opacity
                ${STATUS_COLORS[cell.status]}
                ${isToday ? 'ring-1 ring-white/40' : ''}`}
            />
          )
        })}
      </div>

      {data.goals?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Tracking:</span>
          {data.goals.map(g => (
            <span key={g.id} className="text-xs px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full">{g.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'goals',        label: 'Goals' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'streaks',      label: 'Streaks' },
]

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Goals() {
  const [tab, setTab] = useState('goals')
  const [goals, setGoals] = useState([])
  const [streaks, setStreaks] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [goalModal, setGoalModal] = useState(null) // null | { goal? }
  const [achModal, setAchModal] = useState(null)   // null | { ach? }
  const [achFilter, setAchFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, s, a, p] = await Promise.all([
        goalsApi.list(),
        goalsApi.streaks(),
        goalsApi.achievements(),
        goalsApi.progress(),
      ])
      setGoals(g)
      setStreaks(s)
      setAchievements(a)
      setProgress(p)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Goal actions
  async function handleSaveGoal(data) {
    if (goalModal?.goal) {
      await goalsApi.update(goalModal.goal.id, data)
    } else {
      await goalsApi.create(data)
    }
    setGoalModal(null)
    load()
  }

  async function handleDeleteGoal(goal) {
    if (!confirm(`Delete goal "${goal.name}"?`)) return
    await goalsApi.remove(goal.id)
    load()
  }

  async function handleToggleGoal(goal) {
    await goalsApi.update(goal.id, { ...goal, active: !goal.active })
    load()
  }

  // Achievement actions
  async function handleSaveAchievement(data) {
    if (achModal?.ach) {
      await goalsApi.updateAchievement(achModal.ach.id, data)
    } else {
      await goalsApi.createAchievement(data)
    }
    setAchModal(null)
    load()
  }

  async function handleDeleteAchievement(ach) {
    if (!confirm(`Delete milestone "${ach.name}"?`)) return
    await goalsApi.removeAchievement(ach.id)
    load()
  }

  // Stats
  const activeGoals = goals.filter(g => g.active)
  const metGoals    = activeGoals.filter(g => g.is_met)
  const earnedAchs  = achievements.filter(a => a.earned_at)

  const filteredAchs = achFilter === 'all'
    ? achievements
    : achFilter === 'earned'
      ? achievements.filter(a => a.earned_at)
      : achievements.filter(a => !a.earned_at && a.category === achFilter)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Goals & Achievements</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track your trading goals, streaks, and milestones</p>
        </div>
        {tab === 'goals' && (
          <button
            onClick={() => setGoalModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Goal
          </button>
        )}
        {tab === 'achievements' && (
          <button
            onClick={() => setAchModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Milestone
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Goals', value: activeGoals.length, color: 'text-white' },
          { label: 'Goals Met', value: `${metGoals.length} / ${activeGoals.length}`, color: metGoals.length === activeGoals.length && activeGoals.length > 0 ? 'text-emerald-400' : 'text-white' },
          { label: 'Achievements', value: `${earnedAchs.length} / ${achievements.length}`, color: 'text-yellow-400' },
          { label: 'Journal Streak', value: streaks ? `${streaks.journal.current}d` : '—', color: streaks?.journal.current > 0 ? 'text-indigo-400' : 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 card-glow">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              tab === t.id
                ? 'tab-active'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {t.label}
            {t.id === 'achievements' && earnedAchs.length > 0 && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                {earnedAchs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <>
          {/* ── GOALS TAB ── */}
          {tab === 'goals' && (
            <div className="space-y-6">
              {goals.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center card-glow">
                  <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><Target className="w-8 h-8 text-indigo-400" /></div>
                  <h3 className="text-white font-medium mb-2">No goals yet</h3>
                  <p className="text-gray-500 text-sm mb-6">Create your first goal to start tracking progress.</p>
                  <button
                    onClick={() => setGoalModal({})}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Create Goal
                  </button>
                </div>
              ) : (
                <>
                  {activeGoals.length > 0 && (
                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Active</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {activeGoals.map(g => (
                          <GoalCard
                            key={g.id}
                            goal={g}
                            onEdit={goal => setGoalModal({ goal })}
                            onDelete={handleDeleteGoal}
                            onToggle={handleToggleGoal}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {goals.filter(g => !g.active).length > 0 && (
                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Inactive</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {goals.filter(g => !g.active).map(g => (
                          <GoalCard
                            key={g.id}
                            goal={g}
                            onEdit={goal => setGoalModal({ goal })}
                            onDelete={handleDeleteGoal}
                            onToggle={handleToggleGoal}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── ACHIEVEMENTS TAB ── */}
          {tab === 'achievements' && (
            <div className="space-y-4">
              {/* Filter pills */}
              <div className="flex flex-wrap gap-2">
                {['all', 'earned', ...ACHIEVEMENT_CATEGORIES].map(f => (
                  <button
                    key={f}
                    onClick={() => setAchFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${achFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {f === 'all' ? 'All' : f === 'earned' ? `Earned (${earnedAchs.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {filteredAchs.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center card-glow">
                  <p className="text-gray-500 text-sm">No achievements in this category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredAchs.map(a => (
                    <AchievementBadge
                      key={a.id}
                      ach={a}
                      onEdit={ach => setAchModal({ ach })}
                      onDelete={handleDeleteAchievement}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STREAKS TAB ── */}
          {tab === 'streaks' && streaks && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StreakCard
                  title="Green Day Streak"
                  icon="🔥"
                  current={streaks.green_days.current}
                  longest={streaks.green_days.longest}
                  longestStart={streaks.green_days.longest_start}
                  longestEnd={streaks.green_days.longest_end}
                  color="emerald"
                />
                <StreakCard
                  title="Journal Streak"
                  icon="📖"
                  current={streaks.journal.current}
                  longest={streaks.journal.longest}
                  longestStart={streaks.journal.longest_start}
                  longestEnd={streaks.journal.longest_end}
                  color="indigo"
                />
                <StreakCard
                  title="Rule-Following Streak"
                  icon="✅"
                  current={streaks.rule_following.current}
                  longest={streaks.rule_following.longest}
                  longestStart={streaks.rule_following.longest_start}
                  longestEnd={streaks.rule_following.longest_end}
                  color="amber"
                />
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 card-glow">
                <h3 className="text-white font-medium mb-4">Streak Summary</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Green Days — Current', value: `${streaks.green_days.current} days`, color: 'text-emerald-400' },
                    { label: 'Green Days — Best Ever', value: `${streaks.green_days.longest} days`, color: 'text-emerald-300' },
                    { label: 'Journaling — Current', value: `${streaks.journal.current} days`, color: 'text-indigo-400' },
                    { label: 'Journaling — Best Ever', value: `${streaks.journal.longest} days`, color: 'text-indigo-300' },
                    { label: 'Rule Compliance — Current', value: `${streaks.rule_following.current} days`, color: 'text-amber-400' },
                    { label: 'Rule Compliance — Best Ever', value: `${streaks.rule_following.longest} days`, color: 'text-amber-300' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                      <span className="text-sm text-gray-400">{row.label}</span>
                      <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {goalModal !== null && (
        <GoalFormModal
          goal={goalModal.goal}
          onSave={handleSaveGoal}
          onClose={() => setGoalModal(null)}
        />
      )}
      {achModal !== null && (
        <AchievementFormModal
          ach={achModal.ach}
          onSave={handleSaveAchievement}
          onClose={() => setAchModal(null)}
        />
      )}
    </div>
  )
}
