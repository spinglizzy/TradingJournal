import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, ChevronDown, Settings, X, Menu } from 'lucide-react'
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { journalApi } from '../api/journal.js'
import { statsApi } from '../api/stats.js'
import { tradesApi } from '../api/trades.js'
import JournalCalendar, { ENTRY_TYPES } from '../components/journal/JournalCalendar.jsx'
import JournalList from '../components/journal/JournalList.jsx'
import TipTapEditor from '../components/journal/TipTapEditor.jsx'
import TradePicker from '../components/journal/TradePicker.jsx'
import TagInput from '../components/journal/TagInput.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'

// ── Templates ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'journal_templates_v2'

const DEFAULT_TEMPLATES = {
  daily: '',
  pre_session: `<h2>Market Bias</h2><p>Describe your overall market bias for today — bullish, bearish, or neutral — and why.</p><h2>Key Levels to Watch</h2><p>Important support/resistance levels, gap fills, or price zones to monitor.</p><h2>Watchlist &amp; Trade Ideas</h2><p>Tickers you're watching and the specific setups you're looking for.</p><h2>Rules Reminder</h2><p>Your key trading rules for today's session.</p><h2>Goals for Today</h2><p>Non-P&amp;L process goals for today.</p>`,
  post_session: `<h2>What Went Well?</h2><p>Trades or decisions you executed well today.</p><h2>What Could Improve?</h2><p>Mistakes, missed opportunities, or areas for growth.</p><h2>Key Lessons</h2><p>What did you learn from today's trading session?</p><h2>Emotions &amp; Psychology</h2><p>How did you feel during the session? Any tilt or discipline issues?</p><h2>Plan for Tomorrow</h2><p>Setups to watch, rules to focus on, adjustments to make.</p>`,
  weekly_review: '', // generated dynamically
}

function getTemplates() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...DEFAULT_TEMPLATES, ...stored }
  } catch { return DEFAULT_TEMPLATES }
}

function saveTemplate(type, content) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [type]: content }))
  } catch {}
}

function generateWeeklyContent(stats, from, to) {
  if (!stats) return DEFAULT_TEMPLATES.post_session
  const pnl = stats.total_pnl >= 0
    ? `+$${stats.total_pnl.toFixed(2)}`
    : `-$${Math.abs(stats.total_pnl).toFixed(2)}`
  const wr = stats.win_rate?.toFixed(1) ?? '—'
  const pf = stats.profit_factor != null ? stats.profit_factor.toFixed(2) : '—'

  return `<h2>Performance Summary</h2>
<p><strong>Week: ${from} → ${to}</strong></p>
<p>Total Trades: <strong>${stats.total_trades}</strong> &nbsp;|&nbsp; P&amp;L: <strong>${pnl}</strong> &nbsp;|&nbsp; Win Rate: <strong>${wr}%</strong> &nbsp;|&nbsp; Profit Factor: <strong>${pf}</strong></p>
${stats.best_trade ? `<p>Best Trade: <strong>${stats.best_trade.ticker}</strong> (+$${Math.abs(stats.best_trade.pnl ?? 0).toFixed(2)})</p>` : ''}
${stats.worst_trade ? `<p>Worst Trade: <strong>${stats.worst_trade.ticker}</strong> (-$${Math.abs(stats.worst_trade.pnl ?? 0).toFixed(2)})</p>` : ''}
${stats.top_setup ? `<p>Most Used Setup: <strong>${stats.top_setup}</strong></p>` : ''}
<h2>What Worked This Week?</h2>
<p></p>
<h2>What Needs Improvement?</h2>
<p></p>
<h2>Discipline &amp; Psychology</h2>
<p></p>
<h2>Goals for Next Week</h2>
<ul><li></li></ul>`
}

// ── Helper: today string ──────────────────────────────────────────────────────
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

// ── Mood selector ─────────────────────────────────────────────────────────────
const MOODS = [
  { value: 'great',   emoji: '😄', label: 'Great',    cls: 'text-emerald-400' },
  { value: 'good',    emoji: '🙂', label: 'Good',     cls: 'text-green-400'   },
  { value: 'neutral', emoji: '😐', label: 'Neutral',  cls: 'text-gray-400'    },
  { value: 'bad',     emoji: '😕', label: 'Bad',      cls: 'text-orange-400'  },
  { value: 'terrible',emoji: '😤', label: 'Terrible', cls: 'text-red-400'     },
]

function fmt$(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2)
}

// ── LinkedTradeCard ───────────────────────────────────────────────────────────
function LinkedTradeCard({ trade, onRemove }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg">
      <button
        type="button"
        onClick={() => navigate(`/trades/${trade.id}`)}
        className="flex-1 flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
      >
        <span className="font-semibold text-white text-sm">{trade.ticker}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
          trade.direction === 'long'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400'
        }`}>
          {trade.direction?.toUpperCase()}
        </span>
        <span className="text-xs text-gray-500">{trade.date}</span>
        {trade.pnl != null && (
          <span className={`text-xs font-mono ml-auto ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt$(trade.pnl)}
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors p-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Template editor modal ─────────────────────────────────────────────────────
function TemplateEditorModal({ type, onClose }) {
  const [tpl, setTpl] = useState(getTemplates()[type] || '')

  function save() {
    saveTemplate(type, tpl)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">
            Edit {ENTRY_TYPES[type]?.label} Template
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          <p className="text-xs text-gray-500 mb-3">Edit the HTML template for this entry type. This will be pre-filled when creating a new {ENTRY_TYPES[type]?.label?.toLowerCase()} entry.</p>
          <TipTapEditor content={tpl} onChange={setTpl} placeholder="Enter template content…" minHeight={300} />
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">Save Template</button>
        </div>
      </div>
    </div>
  )
}

// ── Entry editor panel (right drawer) ────────────────────────────────────────
function EntryEditorPanel({
  entry,          // null = new entry
  initialDate,    // for new entries
  initialType,    // for new entries
  allTags,
  onSave,
  onClose,
  isSaving,
}) {
  const isNew = !entry
  const [date,       setDate]       = useState(entry?.date       ?? initialDate ?? todayStr())
  const [entryType,  setEntryType]  = useState(entry?.entry_type ?? initialType ?? 'daily')
  const [title,      setTitle]      = useState(entry?.title      ?? '')
  const [content,    setContent]    = useState(entry?.content    ?? '')
  const [mood,       setMood]       = useState(entry?.mood       ?? null)
  const [tags,       setTags]       = useState(entry?.tags       ?? [])
  const [linkedTrades, setLinkedTrades] = useState(entry?.linked_trades ?? [])
  const [tradePickerOpen, setTradePickerOpen] = useState(false)
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const contentInitialized = useRef(false)

  // Initialize content from template when creating a new entry
  useEffect(() => {
    if (!isNew || contentInitialized.current) return
    contentInitialized.current = true

    if (entryType === 'weekly_review') {
      // Auto-fetch week stats
      const d = parseISO(date)
      const from = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const to   = format(endOfWeek(d,   { weekStartsOn: 1 }), 'yyyy-MM-dd')
      setLoadingTemplate(true)
      journalApi.weeklyStats(from, to)
        .then(stats => setContent(generateWeeklyContent(stats, from, to)))
        .catch(() => setContent(DEFAULT_TEMPLATES.post_session))
        .finally(() => setLoadingTemplate(false))
    } else {
      const templates = getTemplates()
      setContent(templates[entryType] || '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When entry type changes on new entry, reload template
  function handleTypeChange(newType) {
    setEntryType(newType)
    if (!isNew) return
    if (newType === 'weekly_review') {
      const d = parseISO(date)
      const from = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const to   = format(endOfWeek(d,   { weekStartsOn: 1 }), 'yyyy-MM-dd')
      setLoadingTemplate(true)
      journalApi.weeklyStats(from, to)
        .then(stats => setContent(generateWeeklyContent(stats, from, to)))
        .catch(() => setContent(''))
        .finally(() => setLoadingTemplate(false))
    } else {
      const templates = getTemplates()
      setContent(templates[newType] || '')
    }
  }

  function handleTradesConfirm(ids) {
    // Load full trade info for display
    const currentIds = linkedTrades.map(t => t.id)
    const newIds = ids.filter(id => !currentIds.includes(id))
    const kept = linkedTrades.filter(t => ids.includes(t.id))

    Promise.all(newIds.map(id => tradesApi.get(id)))
      .then(newTrades => setLinkedTrades([...kept, ...newTrades]))
      .catch(console.error)
  }

  function handleSave() {
    onSave({
      date,
      entry_type: entryType,
      title: title.trim(),
      content,
      mood: mood || null,
      tags,
      trade_ids: linkedTrades.map(t => t.id),
    })
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors'

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="font-semibold text-white text-sm">
            {isNew ? 'New Entry' : 'Edit Entry'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Template editor (not for weekly_review or daily) */}
            {entryType !== 'weekly_review' && (
              <button
                type="button"
                onClick={() => setTemplateEditorOpen(true)}
                title="Edit template for this entry type"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800"
              >
                <Settings className="w-3.5 h-3.5" />
                Template
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Entry type + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Type</label>
              <select
                value={entryType}
                onChange={e => handleTypeChange(e.target.value)}
                className={inputCls}
              >
                {Object.entries(ENTRY_TYPES).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`${ENTRY_TYPES[entryType]?.label ?? 'Journal'} — ${date}`}
              className={inputCls}
            />
          </div>

          {/* Mood */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Mood</label>
            <div className="flex gap-2">
              {MOODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  title={m.label}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-xs transition-colors ${
                    mood === m.value
                      ? `border-current ${m.cls} bg-current bg-opacity-10`
                      : 'border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  <span className="text-base">{m.emoji}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Tags</label>
            <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
          </div>

          {/* Rich text editor */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Content</label>
            {loadingTemplate ? (
              <div className="flex items-center justify-center h-40 bg-gray-900/50 border border-gray-700 rounded-xl">
                <LoadingSpinner />
              </div>
            ) : (
              <TipTapEditor
                content={content}
                onChange={setContent}
                placeholder={`Write your ${ENTRY_TYPES[entryType]?.label?.toLowerCase() ?? 'journal entry'}…`}
                minHeight={300}
              />
            )}
          </div>

          {/* Linked trades */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Linked Trades</label>
              <button
                type="button"
                onClick={() => setTradePickerOpen(true)}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Link Trades
              </button>
            </div>
            {linkedTrades.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No trades linked</p>
            ) : (
              <div className="space-y-1.5">
                {linkedTrades.map(trade => (
                  <LinkedTradeCard
                    key={trade.id}
                    trade={trade}
                    onRemove={() => setLinkedTrades(prev => prev.filter(t => t.id !== trade.id))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !content.replace(/<[^>]*>/g, '').trim()}
            className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {isSaving ? 'Saving…' : isNew ? 'Create Entry' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Trade picker */}
      <TradePicker
        isOpen={tradePickerOpen}
        onClose={() => setTradePickerOpen(false)}
        selectedIds={linkedTrades.map(t => t.id)}
        onConfirm={handleTradesConfirm}
      />

      {/* Template editor */}
      {templateEditorOpen && (
        <TemplateEditorModal
          type={entryType}
          onClose={() => setTemplateEditorOpen(false)}
        />
      )}
    </>
  )
}

// ── New entry type picker ─────────────────────────────────────────────────────
function NewEntryMenu({ onSelect, onClose }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-52 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-30 overflow-hidden">
      {Object.entries(ENTRY_TYPES).map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => { onSelect(key); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700 transition-colors text-left"
        >
          <span className={`w-2 h-2 rounded-full ${cfg.dot} shrink-0`} />
          <span className="text-sm text-gray-200">{cfg.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Journal() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Data
  const [entries,     setEntries]     = useState([])
  const [calData,     setCalData]     = useState([])   // { date, types[] }
  const [tradeDays,   setTradeDays]   = useState([])   // { date, pnl, trades }
  const [allTags,     setAllTags]     = useState([])
  const [loading,     setLoading]     = useState(true)

  // Editor state
  const [editingEntry, setEditingEntry] = useState(null)  // full entry object | null (new)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [newEntryType, setNewEntryType] = useState('daily')
  const [newEntryDate, setNewEntryDate] = useState(todayStr())
  const [isSaving,    setIsSaving]    = useState(false)

  // Delete
  const [deleteId, setDeleteId] = useState(null)

  // View
  const [view,     setView]     = useState('calendar')  // 'calendar' | 'list'
  const [month,    setMonth]    = useState(new Date())
  const [selDate,  setSelDate]  = useState(null)        // selected calendar day

  // Filters (list view)
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterTag,  setFilterTag]  = useState('')

  // New entry menu
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // ── Load entries + tags (on mount and after mutations) ──
  const loadEntries = useCallback(() => {
    setLoading(true)
    Promise.all([
      journalApi.list(),
      journalApi.allTags(),
    ]).then(([ents, tags]) => {
      setEntries(ents)
      setAllTags(tags)
    }).finally(() => setLoading(false))
  }, [])

  // ── Load calendar data for current month (no spinner) ──
  const loadCalendar = useCallback(() => {
    const monthFrom = format(startOfMonth(month), 'yyyy-MM-dd')
    const monthTo   = format(endOfMonth(month),   'yyyy-MM-dd')
    Promise.all([
      journalApi.calendar({ start_date: monthFrom, end_date: monthTo }),
      statsApi.calendar({ from: monthFrom, to: monthTo }),
    ]).then(([cal, tdays]) => {
      setCalData(cal)
      setTradeDays(tdays)
    })
  }, [month])

  const loadAll = useCallback(() => {
    loadEntries()
    loadCalendar()
  }, [loadEntries, loadCalendar])

  useEffect(() => { loadEntries() }, [loadEntries])
  useEffect(() => { loadCalendar() }, [loadCalendar])

  // Handle URL params: ?entry=id, ?trade_id=id
  useEffect(() => {
    const entryId = searchParams.get('entry')
    const tradeId = searchParams.get('trade_id')
    if (entryId) {
      journalApi.get(entryId).then(e => {
        setEditingEntry(e)
        setIsEditorOpen(true)
      }).catch(() => {})
    } else if (tradeId) {
      setNewEntryType('post_session')
      setNewEntryDate(todayStr())
      setEditingEntry(null)
      setIsEditorOpen(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close menu on outside click
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Handlers ──
  function openNewEntry(type, date = todayStr()) {
    setNewEntryType(type)
    setNewEntryDate(date)
    setEditingEntry(null)
    setIsEditorOpen(true)
  }

  async function openEntry(entry) {
    // Load full entry with linked trades
    try {
      const full = await journalApi.get(entry.id)
      setEditingEntry(full)
      setIsEditorOpen(true)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleSave(data) {
    setIsSaving(true)
    try {
      if (editingEntry) {
        await journalApi.update(editingEntry.id, data)
      } else {
        await journalApi.create(data)
      }
      setIsEditorOpen(false)
      setEditingEntry(null)
      loadAll()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    await journalApi.delete(deleteId)
    setDeleteId(null)
    if (editingEntry?.id === deleteId) {
      setIsEditorOpen(false)
      setEditingEntry(null)
    }
    loadAll()
  }

  function handleDayClick(dateStr) {
    setSelDate(prev => prev === dateStr ? null : dateStr)
    setView('list')
  }

  // ── Filtered entries for list view ──
  const filteredEntries = entries.filter(e => {
    if (selDate && e.date !== selDate) return false
    if (filterType && e.entry_type !== filterType) return false
    if (filterTag && !(Array.isArray(e.tags) ? e.tags : []).includes(filterTag)) return false
    if (search) {
      const q = search.toLowerCase()
      const matchesTitle = e.title?.toLowerCase().includes(q)
      const matchesPreview = (e.preview || '').toLowerCase().includes(q)
      if (!matchesTitle && !matchesPreview) return false
    }
    return true
  })

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal</h1>
          <p className="text-sm text-gray-500 mt-0.5">Trading reflections &amp; session reviews</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View tabs */}
          <div className="flex rounded-lg bg-gray-900 border border-gray-800 p-0.5">
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                view === 'calendar' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                view === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              List
            </button>
          </div>

          {/* New Entry dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(p => !p)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Entry
              <ChevronDown className="w-4 h-4 ml-0.5" />
            </button>
            {menuOpen && (
              <NewEntryMenu
                onSelect={type => openNewEntry(type, selDate || todayStr())}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <LoadingSpinner className="h-64" />
      ) : (
        <div className={`grid gap-5 ${isEditorOpen ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>

          {/* Left: Calendar or List */}
          <div className={isEditorOpen ? 'lg:col-span-2' : ''}>
            {view === 'calendar' ? (
              <div className="space-y-4">
                <JournalCalendar
                  month={month}
                  onMonthChange={setMonth}
                  journalDays={calData}
                  tradeDays={tradeDays}
                  selectedDate={selDate}
                  onDayClick={handleDayClick}
                />

                {/* Day entries (shown below calendar when day selected) */}
                {selDate && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-300">
                        {format(parseISO(selDate), 'EEEE, MMMM d, yyyy')}
                      </h3>
                      <div className="flex gap-1">
                        {Object.keys(ENTRY_TYPES).map(type => (
                          <button
                            key={type}
                            onClick={() => openNewEntry(type, selDate)}
                            title={`New ${ENTRY_TYPES[type].label}`}
                            className={`w-2 h-2 rounded-full ${ENTRY_TYPES[type].dot} hover:opacity-70 transition-opacity`}
                          />
                        ))}
                      </div>
                    </div>
                    <JournalList
                      entries={filteredEntries}
                      selectedId={editingEntry?.id}
                      onSelect={openEntry}
                      onDelete={id => setDeleteId(id)}
                      emptyMessage={`No entries for ${format(parseISO(selDate), 'MMM d')} — click a dot above to create one`}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Search & filters */}
                <div className="flex gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search entries…"
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">All types</option>
                    {Object.entries(ENTRY_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  {allTags.length > 0 && (
                    <select
                      value={filterTag}
                      onChange={e => setFilterTag(e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">All tags</option>
                      {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  {(search || filterType || filterTag || selDate) && (
                    <button
                      onClick={() => { setSearch(''); setFilterType(''); setFilterTag(''); setSelDate(null) }}
                      className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {selDate && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>Showing: {format(parseISO(selDate), 'MMM d, yyyy')}</span>
                    <button onClick={() => setSelDate(null)} className="text-gray-600 hover:text-gray-300 transition-colors">×</button>
                  </div>
                )}

                <JournalList
                  entries={filteredEntries}
                  selectedId={editingEntry?.id}
                  onSelect={openEntry}
                  onDelete={id => setDeleteId(id)}
                  emptyMessage="No entries match your filters"
                />
              </div>
            )}
          </div>

          {/* Right: Editor panel — desktop only (mobile uses overlay below) */}
          {isEditorOpen && (
            <div className="hidden lg:block lg:col-span-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden h-full flex flex-col card-glow" style={{ minHeight: '600px' }}>
                <EntryEditorPanel
                  key={editingEntry?.id ?? `new-${newEntryType}-${newEntryDate}`}
                  entry={editingEntry}
                  initialDate={newEntryDate}
                  initialType={newEntryType}
                  allTags={allTags}
                  onSave={handleSave}
                  onClose={() => { setIsEditorOpen(false); setEditingEntry(null) }}
                  isSaving={isSaving}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right-side overlay on mobile when editor is open */}
      {isEditorOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/50" onClick={() => { setIsEditorOpen(false); setEditingEntry(null) }} />
          <div className="w-full max-w-lg bg-gray-950 border-l border-gray-800 h-full overflow-y-auto flex flex-col shadow-2xl">
            <EntryEditorPanel
              key={`mobile-${editingEntry?.id ?? `new-${newEntryType}`}`}
              entry={editingEntry}
              initialDate={newEntryDate}
              initialType={newEntryType}
              allTags={allTags}
              onSave={handleSave}
              onClose={() => { setIsEditorOpen(false); setEditingEntry(null) }}
              isSaving={isSaving}
            />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Journal Entry"
        message="This journal entry will be permanently deleted."
        confirmLabel="Delete Entry"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
