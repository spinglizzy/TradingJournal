import { useEffect, useRef, useState } from 'react'
import { Plus, X, ChevronUp, ChevronDown, TrendingUp, TrendingDown, Minus, Trash2, ImagePlus, Camera, Check, Ban } from 'lucide-react'
import { DatePicker } from '../ui/DatePicker.jsx'
import TipTapEditor from './TipTapEditor.jsx'
import { strategiesApi } from '../../api/strategies.js'
import { supabase } from '../../lib/supabase.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
  text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

function newId() { return Date.now() + Math.random() }

function todayStr() { return new Date().toISOString().split('T')[0] }

function emptyIdea(type = 'continuation') {
  return {
    id: newId(),
    type,                      // 'rejection' | 'continuation'
    direction: 'long',         // 'long' | 'short'
    setup_id: '',              // playbook setup id (optional)
    setup_name: '',
    notes: '',
    checklist: [],
  }
}

function emptyTicker() {
  return {
    id: newId(),
    symbol: '',
    bias: 'bullish',           // 'bullish' | 'bearish'
    ideas: [emptyIdea('continuation')],
  }
}

function emptyAnnotation() {
  return {
    id: newId(),
    time: new Date().toTimeString().slice(0, 5),  // HH:MM local
    ticker: '',
    image_path: '',
    caption: '',
    decision: 'none',          // 'took' | 'skipped' | 'none'
    notes: '',
  }
}

const EMPTY_PLAN = {
  bias: 'neutral',             // overall day bias
  market_notes: '',
  tickers: [emptyTicker()],
  annotations: [],
}

// ── Bias pill selector ────────────────────────────────────────────────────────

function BiasSelector({ value, onChange, allowNeutral = true, size = 'md' }) {
  const options = [
    { value: 'bullish', label: 'Bullish', icon: TrendingUp,   on: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
    ...(allowNeutral ? [{ value: 'neutral', label: 'Neutral', icon: Minus, on: 'bg-gray-700/50 text-gray-200 border-gray-500' }] : []),
    { value: 'bearish', label: 'Bearish', icon: TrendingDown, on: 'bg-red-500/15 text-red-400 border-red-500/40' },
  ]
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
  return (
    <div className="flex gap-1.5">
      {options.map(o => {
        const Icon = o.icon
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 ${pad} rounded-lg border font-medium transition-colors ${
              selected ? o.on : 'border-gray-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Inline checklist editor (used inside an idea card) ───────────────────────

function PlanChecklist({ items, onChange }) {
  const [newItem, setNewItem] = useState('')

  function add() {
    const t = newItem.trim()
    if (!t) return
    onChange([...items, { id: newId(), text: t, checked: false }])
    setNewItem('')
  }
  function toggle(id) {
    onChange(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  }
  function remove(id) { onChange(items.filter(i => i.id !== id)) }
  function move(idx, dir) {
    const next = idx + dir
    if (next < 0 || next >= items.length) return
    const a = [...items]
    ;[a[idx], a[next]] = [a[next], a[idx]]
    onChange(a)
  }
  function updateText(id, text) {
    onChange(items.map(i => i.id === id ? { ...i, text } : i))
  }

  return (
    <div className="space-y-1.5">
      {items.length === 0 && (
        <p className="text-[11px] text-gray-600 italic">No checklist items — add some below or pick a setup to seed defaults.</p>
      )}
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-1.5 group">
          <input
            type="checkbox"
            checked={!!item.checked}
            onChange={() => toggle(item.id)}
            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 shrink-0"
          />
          <input
            value={item.text}
            onChange={e => updateText(item.id, e.target.value)}
            className={`flex-1 bg-transparent border-0 px-1.5 py-0.5 text-xs text-white focus:outline-none focus:bg-gray-800 rounded ${
              item.checked ? 'line-through text-gray-500' : ''
            }`}
          />
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
              className="text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
            <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
              className="text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronDown className="w-3 h-3" /></button>
            <button type="button" onClick={() => remove(item.id)}
              className="text-gray-600 hover:text-red-400"><X className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
      <div className="flex gap-1.5 pt-1">
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add checklist item…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <button type="button" onClick={add}
          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded transition-colors">
          Add
        </button>
      </div>
    </div>
  )
}

// ── Single trade idea card ────────────────────────────────────────────────────

function IdeaCard({ idea, setups, onChange, onRemove, ideaIndex }) {
  function patch(p) { onChange({ ...idea, ...p }) }

  function seedChecklistFromSetup(s) {
    return (s.checklist || []).map(c => ({
      id: newId(),
      text: typeof c === 'string' ? c : (c.text || ''),
      checked: false,
    })).filter(item => item.text.trim() !== '')
  }

  function pickSetup(setupId) {
    if (!setupId) {
      patch({ setup_id: '', setup_name: '' })
      return
    }
    const s = setups.find(x => String(x.id) === String(setupId))
    if (!s) return
    const seeded = seedChecklistFromSetup(s)
    patch({
      setup_id: s.id,
      setup_name: s.name,
      // Always replace checklist with the setup's checklist when picking
      checklist: seeded,
      direction: s.default_fields?.direction || idea.direction,
    })
  }

  function reloadChecklist() {
    if (!idea.setup_id) return
    const s = setups.find(x => String(x.id) === String(idea.setup_id))
    if (!s) return
    patch({ checklist: seedChecklistFromSetup(s) })
  }

  const typeColors = idea.type === 'rejection'
    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
    : 'bg-sky-500/10 border-sky-500/30 text-sky-300'

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-600">#{ideaIndex + 1}</span>
          <div className="flex rounded-md border border-gray-700 overflow-hidden">
            <button type="button" onClick={() => patch({ type: 'continuation' })}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                idea.type === 'continuation' ? 'bg-sky-500/20 text-sky-300' : 'text-gray-500 hover:text-gray-300'
              }`}>
              Continuation
            </button>
            <button type="button" onClick={() => patch({ type: 'rejection' })}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                idea.type === 'rejection' ? 'bg-rose-500/20 text-rose-300' : 'text-gray-500 hover:text-gray-300'
              }`}>
              Rejection
            </button>
          </div>
          <div className="flex rounded-md border border-gray-700 overflow-hidden">
            <button type="button" onClick={() => patch({ direction: 'long' })}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                idea.direction === 'long' ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-500 hover:text-gray-300'
              }`}>
              Long
            </button>
            <button type="button" onClick={() => patch({ direction: 'short' })}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                idea.direction === 'short' ? 'bg-red-500/20 text-red-300' : 'text-gray-500 hover:text-gray-300'
              }`}>
              Short
            </button>
          </div>
        </div>
        <button type="button" onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-800">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Setup picker */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Playbook Setup</label>
        <select
          value={idea.setup_id || ''}
          onChange={e => pickSetup(e.target.value)}
          className={inputCls}
        >
          <option value="">— None —</option>
          {setups.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{Array.isArray(s.checklist) && s.checklist.length > 0 ? ` · ${s.checklist.length} checklist item${s.checklist.length === 1 ? '' : 's'}` : ''}
            </option>
          ))}
        </select>
        {setups.length === 0 && (
          <p className="text-[10px] text-gray-600 mt-1 italic">No setups in your Playbook yet. Create one in the Playbook tab to seed checklists here.</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Idea Notes</label>
        <textarea
          value={idea.notes}
          onChange={e => patch({ notes: e.target.value })}
          rows={2}
          placeholder={idea.type === 'rejection'
            ? 'What needs to fail / get rejected for this idea to be live?'
            : 'What confirms the trend continues?'}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* Checklist */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Pre-Trade Checklist</label>
          <div className="flex items-center gap-2">
            {idea.setup_name && (
              <span className="text-[10px] text-gray-600">from <span className="text-indigo-400">{idea.setup_name}</span></span>
            )}
            {idea.setup_id && (
              <button
                type="button"
                onClick={reloadChecklist}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors underline-offset-2 hover:underline"
                title="Replace this checklist with the latest from the playbook setup"
              >
                Reload from setup
              </button>
            )}
          </div>
        </div>
        <PlanChecklist items={idea.checklist} onChange={c => patch({ checklist: c })} />
      </div>

      <div className={`text-[10px] uppercase tracking-wide font-semibold border-t border-gray-800 pt-2 -mb-1 ${typeColors.split(' ').slice(2).join(' ')}`}>
        {idea.type === 'rejection' ? 'REJECTION PLAY' : 'CONTINUATION PLAY'} · {idea.direction.toUpperCase()}
      </div>
    </div>
  )
}

// ── Per-ticker section ────────────────────────────────────────────────────────

function TickerSection({ ticker, setups, onChange, onRemove, index }) {
  function patch(p) { onChange({ ...ticker, ...p }) }

  function addIdea(type) {
    patch({ ideas: [...ticker.ideas, emptyIdea(type)] })
  }
  function updateIdea(ideaId, next) {
    patch({ ideas: ticker.ideas.map(i => i.id === ideaId ? next : i) })
  }
  function removeIdea(ideaId) {
    patch({ ideas: ticker.ideas.filter(i => i.id !== ideaId) })
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
      {/* Ticker header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Ticker</label>
            <input
              value={ticker.symbol}
              onChange={e => patch({ symbol: e.target.value.toUpperCase() })}
              placeholder="AAPL"
              className={`${inputCls} uppercase font-mono font-bold`}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Bias</label>
            <BiasSelector value={ticker.bias} onChange={b => patch({ bias: b })} allowNeutral={false} size="sm" />
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-gray-800 mt-5"
          title="Remove ticker"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Ideas */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trade Ideas</h4>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => addIdea('continuation')}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Continuation
            </button>
            <button
              type="button"
              onClick={() => addIdea('rejection')}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Rejection
            </button>
          </div>
        </div>
        {ticker.ideas.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No ideas yet — add a continuation or rejection play above.</p>
        ) : (
          ticker.ideas.map((idea, ideaIdx) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              setups={setups}
              ideaIndex={ideaIdx}
              onChange={next => updateIdea(idea.id, next)}
              onRemove={() => removeIdea(idea.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Annotation card (live market screenshot + caption + decision) ───────────

async function uploadImage(file) {
  const { data: { session } } = await supabase.auth.getSession()
  const form = new FormData()
  form.append('screenshot', file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    body: form,
  })
  if (!res.ok) throw new Error('Upload failed')
  const { path } = await res.json()
  return path
}

function AnnotationCard({ annotation, onChange, onRemove, onLightbox }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  function patch(p) { onChange({ ...annotation, ...p }) }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const path = await uploadImage(file)
      patch({ image_path: path })
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const decisionStyles = {
    took:    { activeCls: 'bg-emerald-500/20 text-emerald-300', icon: Check, label: 'Took' },
    skipped: { activeCls: 'bg-rose-500/20 text-rose-300',       icon: Ban,   label: 'Skipped' },
    none:    { activeCls: 'bg-gray-700/60 text-gray-200',       icon: Minus, label: 'Watch' },
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2.5">
      {/* Header: time + ticker + decision + delete */}
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={annotation.time}
          onChange={e => patch({ time: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <input
          value={annotation.ticker}
          onChange={e => patch({ ticker: e.target.value.toUpperCase() })}
          placeholder="TICKER"
          className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono font-bold text-white uppercase placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex rounded-md border border-gray-700 overflow-hidden ml-auto">
          {Object.entries(decisionStyles).map(([key, cfg]) => {
            const Icon = cfg.icon
            const active = annotation.decision === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => patch({ decision: key })}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                  active ? cfg.activeCls : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon className="w-3 h-3" />
                {cfg.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Image */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {annotation.image_path ? (
        <div className="relative group rounded-lg overflow-hidden border border-gray-700">
          <img
            src={annotation.image_path}
            alt={annotation.caption || 'annotation'}
            className="w-full object-contain max-h-72 bg-gray-950 cursor-zoom-in"
            onClick={() => onLightbox(annotation.image_path)}
          />
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-1 bg-black/60 hover:bg-indigo-600 text-white rounded-full"
              title="Replace image"
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => patch({ image_path: '' })}
              className="p-1 bg-black/60 hover:bg-red-600 text-white rounded-full"
              title="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full min-h-[80px] border-2 border-dashed border-gray-700 hover:border-indigo-500/60 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-400 transition-colors disabled:opacity-50"
        >
          <ImagePlus className="w-5 h-5" />
          <span className="text-xs">{uploading ? 'Uploading…' : 'Add screenshot'}</span>
        </button>
      )}

      {/* Caption */}
      <input
        value={annotation.caption}
        onChange={e => patch({ caption: e.target.value })}
        placeholder="Caption (e.g. AAPL VWAP reclaim, 5m chart)"
        className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
      />

      {/* Notes */}
      <textarea
        value={annotation.notes}
        onChange={e => patch({ notes: e.target.value })}
        rows={2}
        placeholder={
          annotation.decision === 'took'
            ? 'Why I took it — entry trigger, confluence, conviction…'
            : annotation.decision === 'skipped'
              ? "Why I didn't take it — what was missing, what stopped me…"
              : 'What you saw and your read on it…'
        }
        className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
      />
    </div>
  )
}

function AnnotationLightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85" onClick={onClose}>
      <img
        src={src}
        className="max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] object-contain rounded-lg shadow-2xl"
        alt="annotation"
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

// ── Main editor ───────────────────────────────────────────────────────────────

export default function PremarketPlanEditor({
  entry,
  initialDate,
  onSave,
  onClose,
  isSaving,
}) {
  const isNew = !entry
  const [date, setDate]   = useState(entry?.date ?? initialDate ?? todayStr())
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [plan, setPlan]   = useState(() => {
    if (entry?.plan_data) return normalisePlan(entry.plan_data)
    return EMPTY_PLAN
  })
  const [setups, setSetups] = useState([])
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    strategiesApi.list().then(setSetups).catch(() => setSetups([]))
  }, [])

  function patchPlan(p) { setPlan(prev => ({ ...prev, ...p })) }

  function addTicker() {
    patchPlan({ tickers: [...plan.tickers, emptyTicker()] })
  }
  function updateTicker(id, next) {
    patchPlan({ tickers: plan.tickers.map(t => t.id === id ? next : t) })
  }
  function removeTicker(id) {
    patchPlan({ tickers: plan.tickers.filter(t => t.id !== id) })
  }

  function addAnnotation() {
    patchPlan({ annotations: [...(plan.annotations || []), emptyAnnotation()] })
  }
  function updateAnnotation(id, next) {
    patchPlan({ annotations: (plan.annotations || []).map(a => a.id === id ? next : a) })
  }
  function removeAnnotation(id) {
    patchPlan({ annotations: (plan.annotations || []).filter(a => a.id !== id) })
  }

  function handleSave() {
    onSave({
      date,
      entry_type: 'premarket_plan',
      title: title.trim() || `Pre-Market Plan — ${date}`,
      content,
      mood: null,
      tags: [],
      trade_ids: entry?.linked_trades?.map(t => t.id) ?? [],
      screenshot_paths: null,
      plan_data: plan,
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 rounded border border-amber-500/30">
            Pre-Market Plan
          </span>
          <h2 className="font-semibold text-white text-sm">
            {isNew ? 'New Plan' : 'Edit Plan'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Date + title */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`Pre-Market Plan — ${date}`}
              className={inputCls}
            />
          </div>
        </div>

        {/* Overall day bias */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Overall Day Bias</label>
            <BiasSelector value={plan.bias} onChange={b => patchPlan({ bias: b })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Market Notes</label>
            <textarea
              value={plan.market_notes}
              onChange={e => patchPlan({ market_notes: e.target.value })}
              rows={3}
              placeholder="SPY/QQQ context, news, sector rotation, key macro events…"
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        {/* Tickers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Tickers</h3>
            <button
              type="button"
              onClick={addTicker}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Ticker
            </button>
          </div>

          {plan.tickers.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No tickers — add one above to start planning.</p>
          ) : (
            plan.tickers.map((ticker, idx) => (
              <TickerSection
                key={ticker.id}
                ticker={ticker}
                setups={setups}
                index={idx}
                onChange={next => updateTicker(ticker.id, next)}
                onRemove={() => removeTicker(ticker.id)}
              />
            ))
          )}
        </div>

        {/* Live annotations (during the session) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                Live Annotations
              </h3>
              <p className="text-[11px] text-gray-600 mt-0.5">Screenshot setups as they form during the session — captured why you took or skipped them.</p>
            </div>
            <button
              type="button"
              onClick={addAnnotation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Annotation
            </button>
          </div>

          {(plan.annotations || []).length === 0 ? (
            <p className="text-xs text-gray-600 italic">No annotations yet — click "Add Annotation" when a setup appears intraday.</p>
          ) : (
            (plan.annotations || []).map(annotation => (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                onChange={next => updateAnnotation(annotation.id, next)}
                onRemove={() => removeAnnotation(annotation.id)}
                onLightbox={setLightbox}
              />
            ))
          )}
        </div>

        {/* Free-form notes */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Additional Notes</label>
          <TipTapEditor
            content={content}
            onChange={setContent}
            placeholder="Anything else for today's plan…"
            minHeight={180}
          />
        </div>
      </div>

      {lightbox && <AnnotationLightbox src={lightbox} onClose={() => setLightbox(null)} />}

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
          disabled={isSaving}
          className="px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          {isSaving ? 'Saving…' : isNew ? 'Create Plan' : 'Save Plan'}
        </button>
      </div>
    </div>
  )
}

// Defensive normaliser — handles older/partial plan_data shapes
function normalisePlan(raw) {
  return {
    bias: raw.bias ?? 'neutral',
    market_notes: raw.market_notes ?? '',
    tickers: (raw.tickers ?? []).map(t => ({
      id: t.id ?? newId(),
      symbol: t.symbol ?? '',
      bias: t.bias ?? 'bullish',
      ideas: (t.ideas ?? []).map(i => ({
        id: i.id ?? newId(),
        type: i.type ?? 'continuation',
        direction: i.direction ?? 'long',
        setup_id: i.setup_id ?? '',
        setup_name: i.setup_name ?? '',
        notes: i.notes ?? '',
        checklist: (i.checklist ?? []).map(c => ({
          id: c.id ?? newId(),
          text: c.text ?? '',
          checked: !!c.checked,
        })),
      })),
    })),
    annotations: (raw.annotations ?? []).map(a => ({
      id: a.id ?? newId(),
      time: a.time ?? '',
      ticker: a.ticker ?? '',
      image_path: a.image_path ?? '',
      caption: a.caption ?? '',
      decision: a.decision ?? 'none',
      notes: a.notes ?? '',
    })),
  }
}
