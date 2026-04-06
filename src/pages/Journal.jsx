import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useFlushNavigate } from '../hooks/useFlushNavigate.js'
import { Search, Plus, X, Pencil, Trash2, ImagePlus } from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { journalApi } from '../api/journal.js'
import { statsApi } from '../api/stats.js'
import { tradesApi } from '../api/trades.js'
import { playbookApi } from '../api/playbook.js'
import { strategiesApi } from '../api/strategies.js'
import JournalCalendar, { ENTRY_TYPES } from '../components/journal/JournalCalendar.jsx'
import JournalList from '../components/journal/JournalList.jsx'
import TipTapEditor from '../components/journal/TipTapEditor.jsx'
import TradePicker from '../components/journal/TradePicker.jsx'
import TagInput from '../components/journal/TagInput.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import { BouncingDots } from '../components/ui/BouncingDots.jsx'
import { DatePicker } from '../components/ui/DatePicker.jsx'

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
  const navigate = useFlushNavigate()
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

// ── Lightbox ──────────────────────────────────────────────────────────────────
function JournalLightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <img
        src={src}
        className="max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] object-contain rounded-lg shadow-2xl"
        alt="journal image"
        onClick={e => e.stopPropagation()}
      />
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-900/80 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  )
}

// ── Screenshot panel ──────────────────────────────────────────────────────────
function ScreenshotPanel({ screenshots, onChange }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const formData = new FormData()
      formData.append('screenshot', file)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const { path } = await res.json()
      onChange([...screenshots, { url: path, caption: '' }])
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Images <span className="normal-case text-gray-600 font-normal">(max 2)</span>
          </label>
          {screenshots.length < 2 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-indigo-400 hover:text-white hover:bg-indigo-600 border border-indigo-500/40 hover:border-indigo-600 rounded-lg transition-all disabled:opacity-50"
            >
              {uploading ? <BouncingDots size="sm" /> : <ImagePlus className="w-3 h-3" />}
              {uploading ? 'Uploading…' : 'Add Image'}
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {screenshots.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[100px] border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group"
          >
            <ImagePlus className="w-7 h-7 text-gray-700 group-hover:text-gray-500 transition-colors" />
            <p className="text-xs text-gray-600 group-hover:text-gray-500 transition-colors">Click to upload an image</p>
          </div>
        ) : (
          <div className="space-y-3">
            {screenshots.map((s, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="relative group rounded-lg overflow-hidden border border-gray-700">
                  <img
                    src={s.url}
                    alt={s.caption || `Image ${idx + 1}`}
                    className="w-full object-contain cursor-zoom-in max-h-[400px] bg-gray-950"
                    onClick={() => setLightbox(s.url)}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(screenshots.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Caption (optional)"
                  value={s.caption || ''}
                  onChange={e => onChange(screenshots.map((sc, i) => i === idx ? { ...sc, caption: e.target.value } : sc))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            ))}
            {screenshots.length < 2 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-2 border border-dashed border-gray-700 hover:border-gray-600 rounded-lg text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-50"
              >
                + Add another image
              </button>
            )}
          </div>
        )}
      </div>

      {lightbox && createPortal(
        <JournalLightbox src={lightbox} onClose={() => setLightbox(null)} />,
        document.body
      )}
    </>
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
  const [date,         setDate]         = useState(entry?.date       ?? initialDate ?? todayStr())
  const [title,        setTitle]        = useState(entry?.title      ?? '')
  const [content,      setContent]      = useState(entry?.content    ?? '')
  const [mood,         setMood]         = useState(entry?.mood       ?? null)
  const [tags,         setTags]         = useState(entry?.tags       ?? [])
  const [linkedTrades, setLinkedTrades] = useState(entry?.linked_trades ?? [])
  const [tradePickerOpen, setTradePickerOpen] = useState(false)
  const [screenshots, setScreenshots] = useState(() => {
    if (!entry?.screenshot_paths) return []
    if (Array.isArray(entry.screenshot_paths)) return entry.screenshot_paths
    try { const p = JSON.parse(entry.screenshot_paths); return Array.isArray(p) ? p : [] } catch { return [] }
  })

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
      entry_type: entry?.entry_type ?? 'daily',
      title: title.trim(),
      content,
      mood: mood || null,
      tags,
      trade_ids: linkedTrades.map(t => t.id),
      screenshot_paths: screenshots.length ? screenshots : null,
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
          {/* Date */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Title</label>
            <input
              data-testid="journal-title-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`Journal Entry — ${date}`}
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
            <TipTapEditor
              content={content}
              onChange={setContent}
              placeholder="Write your journal entry…"
              minHeight={300}
            />
          </div>

          {/* Screenshots */}
          <ScreenshotPanel screenshots={screenshots} onChange={setScreenshots} />

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

    </>
  )
}

// ── Missed trades (moved from Playbook) ──────────────────────────────────────

const missedInputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
  text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

function pnlCls(v) { return v == null ? 'text-gray-400' : v >= 0 ? 'text-emerald-400' : 'text-red-400' }

function MissedForm({ trade, setups, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [date,    setDate]    = useState(trade?.date                  ?? today)
  const [ticker,  setTicker]  = useState(trade?.ticker                ?? '')
  const [setupId, setSetupId] = useState(trade?.strategy_id           ?? '')
  const [dir,     setDir]     = useState(trade?.direction              ?? 'long')
  const [entry,   setEntry]   = useState(trade?.entry_would_have_been  ?? '')
  const [exit,    setExit]    = useState(trade?.exit_would_have_been   ?? '')
  const [size,    setSize]    = useState(trade?.position_size          ?? 100)
  const [simPnl,  setSimPnl]  = useState(trade?.simulated_pnl         ?? '')
  const [reason,  setReason]  = useState(trade?.reason_missed          ?? '')
  const [notes,   setNotes]   = useState(trade?.notes                  ?? '')

  useEffect(() => {
    if (!entry || !exit || !size) return
    const mult = dir === 'long' ? 1 : -1
    setSimPnl((mult * (Number(exit) - Number(entry)) * Number(size)).toFixed(2))
  }, [entry, exit, size, dir])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Date *</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Ticker *</label>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" className={`${missedInputCls} uppercase`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Setup</label>
          <select value={setupId} onChange={e => setSetupId(e.target.value)} className={missedInputCls}>
            <option value="">None</option>
            {setups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Direction</label>
          <select value={dir} onChange={e => setDir(e.target.value)} className={missedInputCls}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Would-have Entry</label>
          <input type="number" step="0.01" value={entry} onChange={e => setEntry(e.target.value)} className={missedInputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Would-have Exit</label>
          <input type="number" step="0.01" value={exit} onChange={e => setExit(e.target.value)} className={missedInputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Size</label>
          <input type="number" step="1" value={size} onChange={e => setSize(e.target.value)} className={missedInputCls} />
        </div>
      </div>
      {simPnl !== '' && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono font-bold ${
          Number(simPnl) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          Simulated P&L: {fmt$(Number(simPnl))}
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Reason Missed</label>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Was distracted, Didn't take the setup, Fear of loss" className={missedInputCls} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${missedInputCls} resize-none`} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
        <button
          onClick={() => onSave({ date, ticker, strategy_id: setupId || null, direction: dir,
            entry_would_have_been: entry || null, exit_would_have_been: exit || null,
            position_size: Number(size), simulated_pnl: simPnl !== '' ? Number(simPnl) : null,
            reason_missed: reason, notes })}
          disabled={!ticker.trim() || !date}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors">
          {trade ? 'Save' : 'Log Missed Trade'}
        </button>
      </div>
    </div>
  )
}

function MissedSection() {
  const [missed,   setMissed]   = useState([])
  const [summary,  setSummary]  = useState(null)
  const [setups,   setSetups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([playbookApi.missed(), playbookApi.missedSummary(), strategiesApi.list()])
      .then(([m, s, st]) => { setMissed(m); setSummary(s); setSetups(st) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    if (editItem) await playbookApi.updateMissed(editItem.id, data)
    else await playbookApi.createMissed(data)
    setShowForm(false); setEditItem(null); load()
  }

  async function handleDelete() {
    await playbookApi.deleteMissed(deleteId)
    setDeleteId(null); load()
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`bg-gray-900 border rounded-xl p-4 card-glow ${(summary.total_missed ?? 0) >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
            <div className="text-xs text-gray-500 mb-1">P&L Left on Table</div>
            <div className={`text-2xl font-bold font-mono ${pnlCls(summary.total_missed)}`}>{fmt$(summary.total_missed)}</div>
            <div className="text-xs text-gray-600 mt-0.5">{summary.count} missed trade{summary.count !== 1 ? 's' : ''}</div>
          </div>
          {summary.by_setup?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
              <div className="text-xs text-gray-500 mb-2">By Setup</div>
              <div className="space-y-1.5">
                {summary.by_setup.slice(0, 4).map(s => (
                  <div key={s.setup_name} className="flex justify-between text-xs">
                    <span className="text-gray-400">{s.setup_name}</span>
                    <span className={`font-mono font-semibold ${pnlCls(s.total_pnl)}`}>{fmt$(s.total_pnl)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {summary.by_month?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
              <div className="text-xs text-gray-500 mb-2">Recent Months</div>
              <div className="space-y-1.5">
                {summary.by_month.slice(-4).map(m => (
                  <div key={m.month} className="flex justify-between text-xs">
                    <span className="text-gray-400">{m.month}</span>
                    <span className={`font-mono font-semibold ${pnlCls(m.total_pnl)}`}>{fmt$(m.total_pnl)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Missed Trades Log</h3>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Log Missed Trade
        </button>
      </div>

      {(showForm || editItem) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
          <h3 className="text-sm font-medium text-white mb-4">{editItem ? 'Edit' : 'Log Missed Trade'}</h3>
          <MissedForm trade={editItem} setups={setups} onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditItem(null) }} />
        </div>
      )}

      {loading ? <LoadingSpinner className="h-40" /> : missed.length === 0 ? (
        <div className="py-16 text-center text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
          No missed trades logged yet
        </div>
      ) : (
        <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl card-glow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Date','Ticker','Dir','Setup','Entry','Exit','Sim P&L','Reason',''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-3 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {missed.map(t => (
                <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-mono text-gray-500">{t.date}</td>
                  <td className="px-3 py-2.5 font-semibold text-white">{t.ticker}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${t.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.direction?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{t.strategy_name || '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-gray-400">{t.entry_would_have_been ? `$${t.entry_would_have_been}` : '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-gray-400">{t.exit_would_have_been ? `$${t.exit_would_have_been}` : '—'}</td>
                  <td className={`px-3 py-2.5 text-xs font-mono font-semibold ${pnlCls(t.simulated_pnl)}`}>{fmt$(t.simulated_pnl)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs truncate">{t.reason_missed || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => { setEditItem(t); setShowForm(false) }}
                        className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(t.id)}
                        className="p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Missed Trade"
        message="This entry will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Journal() {
  const [searchParams] = useSearchParams()
  const navigate = useFlushNavigate()

  // Data
  const [entries,     setEntries]     = useState([])
  const [calData,     setCalData]     = useState([])   // { date, types[] }
  const [tradeDays,   setTradeDays]   = useState([])   // { date, pnl, trades }
  const [allTags,     setAllTags]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [dayTrades,   setDayTrades]   = useState([])   // trades on selected calendar day

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
  const [search,    setSearch]   = useState('')
  const [filterTag, setFilterTag] = useState('')

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

  // Load trades for the selected calendar day
  useEffect(() => {
    if (!selDate) { setDayTrades([]); return }
    tradesApi.list({ start_date: selDate, end_date: selDate, limit: 50 })
      .then(res => setDayTrades(res.data || []))
      .catch(() => setDayTrades([]))
  }, [selDate])

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
  function openNewEntry(date = todayStr()) {
    setNewEntryType('daily')
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
    setIsEditorOpen(false)
    setEditingEntry(null)
  }

  // ── Filtered entries for list view ──
  const filteredEntries = entries.filter(e => {
    if (selDate && e.date !== selDate) return false
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
            {['calendar','list','missed'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors capitalize ${
                  view === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {v === 'missed' ? 'Missed Trades' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* New Entry button — hidden on missed tab */}
          {view !== 'missed' && (
            <button
              onClick={() => openNewEntry(selDate || todayStr())}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Entry
            </button>
          )}
        </div>
      </div>

      {/* Missed Trades view */}
      {view === 'missed' && <MissedSection />}

      {/* Main content */}
      {view !== 'missed' && loading ? (
        <LoadingSpinner className="h-64" />
      ) : view !== 'missed' && (
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
                      <button
                        onClick={() => openNewEntry(selDate)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        + New Entry
                      </button>
                    </div>
                    <JournalList
                      entries={filteredEntries}
                      selectedId={editingEntry?.id}
                      onSelect={openEntry}
                      onDelete={id => setDeleteId(id)}
                      emptyMessage={`No entries for ${format(parseISO(selDate), 'MMM d')} — click a dot above to create one`}
                    />

                    {/* Trades for this day */}
                    {dayTrades.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</p>
                        {dayTrades.map(trade => (
                          <div
                            key={trade.id}
                            onClick={() => navigate(`/trades/${trade.id}`)}
                            className="cursor-pointer flex items-center gap-2 px-3 py-2.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl transition-all"
                          >
                            <span className="font-semibold text-white text-sm">{trade.ticker}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              trade.direction === 'long'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}>
                              {trade.direction?.toUpperCase()}
                            </span>
                            {trade.status === 'open' && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Open</span>
                            )}
                            {trade.strategy_name && (
                              <span className="text-xs text-gray-600 truncate">{trade.strategy_name}</span>
                            )}
                            {trade.pnl != null && (
                              <span className={`text-sm font-mono ml-auto ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {fmt$(trade.pnl)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                  {(search || filterTag || selDate) && (
                    <button
                      onClick={() => { setSearch(''); setFilterTag(''); setSelDate(null) }}
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

                {/* Trades for the selected day (list view) */}
                {selDate && dayTrades.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</p>
                    {dayTrades.map(trade => (
                      <div
                        key={trade.id}
                        onClick={() => navigate(`/trades/${trade.id}`)}
                        className="cursor-pointer flex items-center gap-2 px-3 py-2.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl transition-all"
                      >
                        <span className="font-semibold text-white text-sm">{trade.ticker}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          trade.direction === 'long'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}>
                          {trade.direction?.toUpperCase()}
                        </span>
                        {trade.status === 'open' && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Open</span>
                        )}
                        {trade.strategy_name && (
                          <span className="text-xs text-gray-600 truncate">{trade.strategy_name}</span>
                        )}
                        {trade.pnl != null && (
                          <span className={`text-sm font-mono ml-auto ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmt$(trade.pnl)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
