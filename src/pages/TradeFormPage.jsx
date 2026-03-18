import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { flushSync, createPortal } from 'react-dom'
import { ArrowLeft, Calculator, Lightbulb, X, ImagePlus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { tradesApi } from '../api/trades.js'
import { strategiesApi } from '../api/strategies.js'
import { tagsApi } from '../api/tags.js'
import { useAccount } from '../contexts/AccountContext.jsx'
import { supabase } from '../lib/supabase.js'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import Badge from '../components/ui/Badge.jsx'
import PositionCalculator from '../components/calculator/PositionCalculator.jsx'

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <img
        src={src}
        alt="Screenshot"
        className="max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-900/80 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>
    </div>,
    document.body
  )
}

// ── Screenshot panel ──────────────────────────────────────────────────────────
function ScreenshotPanel({ screenshots, onChange }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null) // url string

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

  function updateCaption(idx, caption) {
    const next = screenshots.map((s, i) => i === idx ? { ...s, caption } : s)
    onChange(next)
  }

  function remove(idx) {
    onChange(screenshots.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Screenshots <span className="text-gray-600 font-normal">(max 2)</span></h2>
        {screenshots.length < 2 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-400 hover:text-white hover:bg-indigo-600 border border-indigo-500/40 hover:border-indigo-600 rounded-lg transition-all disabled:opacity-50"
          >
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <ImagePlus className="w-3.5 h-3.5" />
            )}
            {uploading ? 'Uploading…' : 'Add Screenshot'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {screenshots.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[120px] border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group"
        >
          <ImagePlus className="w-8 h-8 text-gray-700 group-hover:text-gray-500 transition-colors" />
          <p className="text-xs text-gray-600 group-hover:text-gray-500 transition-colors">Click to upload a chart screenshot</p>
        </div>
      ) : (
        <div className="space-y-4">
          {screenshots.map((s, idx) => (
            <div key={idx} className="space-y-2">
              <div className="relative group rounded-lg overflow-hidden border border-gray-700">
                <img
                  src={s.url}
                  alt={s.caption || `Screenshot ${idx + 1}`}
                  className="w-full object-contain cursor-zoom-in max-h-[700px] bg-gray-950"
                  onClick={() => setLightbox(s.url)}
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-900/80 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={s.caption}
                onChange={e => {
                  updateCaption(idx, e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.stopPropagation() }}
                placeholder="Add a caption…"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none overflow-hidden"
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
              + Add another screenshot
            </button>
          )}
        </div>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

function Field({ label, error, children, optional, headerAction }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1 text-xs text-gray-400 font-medium">
          {label}
          {optional && <span className="text-gray-600 font-normal">(optional)</span>}
        </label>
        {headerAction}
      </div>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

// ── Preset options ────────────────────────────────────────────────────────────
const EMOTION_PRESETS = ['Calm', 'Confident', 'Fearful', 'Greedy', 'FOMO', 'Anxious', 'Frustrated', 'Excited', 'Overconfident', 'Bored', 'Revenge', 'Patient']
const MISTAKE_PRESETS = ['Moved stop loss', 'Overtraded', 'FOMO entry', 'Early exit', 'Late exit', 'Position too large', 'No stop loss', 'Chasing price', 'Revenge trade', 'Ignored plan', 'Overleveraged', 'Late entry']

// ── Tag-input component (free-type + presets) ──────────────────────────────
function TagInput({ value, onChange, presets, placeholder, colorClass }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  function add(item) {
    const trimmed = item.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  function remove(item) {
    onChange(value.filter(v => v !== item))
  }

  function onKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      add(input)
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  const unusedPresets = presets.filter(p => !value.includes(p))

  return (
    <div>
      {/* Selected tags */}
      <div
        className="min-h-[40px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 cursor-text focus-within:border-indigo-500 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(item => (
          <span key={item} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${colorClass}`}>
            {item}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(item) }}
              className="opacity-60 hover:opacity-100 leading-none ml-0.5">×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (input.trim()) add(input) }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-gray-600 outline-none"
        />
      </div>
      {/* Preset chips */}
      {unusedPresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {unusedPresets.map(p => (
            <button key={p} type="button" onClick={() => add(p)}
              className="px-2 py-0.5 rounded text-xs text-gray-500 border border-gray-700 hover:border-gray-500 hover:text-gray-300 transition-colors">
              + {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Star rating ────────────────────────────────────────────────────────────────
function StarRating({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(value === star ? null : star)}
          className="transition-transform hover:scale-110"
        >
          <svg className="w-6 h-6" fill={star <= (value ?? 0) ? '#fbbf24' : 'none'} stroke={star <= (value ?? 0) ? '#fbbf24' : '#4b5563'} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      ))}
      {value != null && (
        <span className="text-xs text-gray-500 ml-1">{value} / 5</span>
      )}
    </div>
  )
}

// ── Intensity dots ─────────────────────────────────────────────────────────────
function IntensityPicker({ value, onChange }) {
  const labels = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High']
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`w-8 h-8 rounded-full text-xs font-semibold border-2 transition-all ${
            n === value
              ? 'border-purple-500 bg-purple-500/20 text-purple-300'
              : 'border-gray-700 bg-gray-800 text-gray-600 hover:border-gray-500'
          }`}
        >
          {n}
        </button>
      ))}
      {value != null && <span className="text-xs text-gray-500 ml-1">{labels[value]}</span>}
    </div>
  )
}

// ── Rule input (free-type, no presets) ────────────────────────────────────────
function RuleInput({ value, onChange, placeholder, colorClass }) {
  return (
    <TagInput value={value} onChange={onChange} presets={[]} placeholder={placeholder} colorClass={colorClass} />
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function TradeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const isEdit = Boolean(id)
  const { accounts, selectedAccountId } = useAccount()

  const [strategies, setStrategies] = useState([])
  const [tags, setTags]             = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [selectedAccountIdForm, setSelectedAccountIdForm] = useState(selectedAccountId ?? '')
  const [loading, setLoading]       = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [previewPnl, setPreviewPnl] = useState(null)
  const [screenshots, setScreenshots] = useState([]) // [{url, caption}]

  // Entry mode: 'entry_exit' or 'direct_pnl', persisted to localStorage
  const [entryMode, setEntryMode] = useState(
    () => localStorage.getItem('trade_entry_mode') || 'entry_exit'
  )

  function switchEntryMode(mode) {
    setEntryMode(mode)
    localStorage.setItem('trade_entry_mode', mode)
    setPreviewPnl(null)
  }

  // Psychology state (managed outside react-hook-form)
  const [confidence,       setConfidence]       = useState(null)
  const [emotionIntensity, setEmotionIntensity] = useState(null)
  const [emotions,         setEmotions]         = useState([])
  const [mistakes,         setMistakes]         = useState([])
  const [rulesFollowed,    setRulesFollowed]    = useState([])
  const [rulesBroken,      setRulesBroken]      = useState([])

  const [showCalc, setShowCalc] = useState(false)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      date:        new Date().toISOString().split('T')[0],
      direction:   navState?.direction   ?? 'long',
      timeframe:   navState?.timeframe   ?? '',
      strategy_id: navState?.strategy_id ?? '',
      ticker:      navState?.ticker      ?? '',
      entry_price: navState?.entry_price ?? '',
      stop_loss:   navState?.stop_loss   ?? '',
      fees: 0,
      direct_pnl: '',
    }
  })

  const watchedValues = watch(['direction', 'entry_price', 'exit_price', 'position_size', 'fees', 'stop_loss'])
  const watchedDirectPnl = watch('direct_pnl')

  // Live P&L preview
  useEffect(() => {
    if (submitting) return
    if (entryMode === 'direct_pnl') {
      if (!watchedDirectPnl && watchedDirectPnl !== 0) { setPreviewPnl(null); return }
      const fees = Number(watchedValues[4] || 0)
      const pnl = Number(watchedDirectPnl) - fees
      setPreviewPnl({ pnl, pct: null, r: null, fees })
      return
    }
    const [direction, entry, exit, size, fees, stop] = watchedValues
    if (!entry || !exit || !size) { setPreviewPnl(null); return }
    const mult = direction === 'long' ? 1 : -1
    const pnl  = mult * (Number(exit) - Number(entry)) * Number(size) - Number(fees || 0)
    const pct  = (pnl / (Number(entry) * Number(size))) * 100
    let r = null
    if (stop) {
      const risk = Math.abs(Number(entry) - Number(stop)) * Number(size)
      if (risk > 0) r = pnl / risk
    }
    setPreviewPnl({ pnl, pct, r, fees: Number(fees || 0) })
  }, [watchedValues, watchedDirectPnl, entryMode, submitting])

  useEffect(() => {
    strategiesApi.list().then(setStrategies)
    tagsApi.list().then(setTags)
  }, [])

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    tradesApi.get(id).then(trade => {
      if (cancelled) return
      const mode = trade.entry_mode || 'entry_exit'
      setEntryMode(mode)
      reset({
        date:           trade.date,
        ticker:         trade.ticker,
        direction:      trade.direction,
        entry_price:    mode === 'entry_exit' ? (trade.entry_price ?? '') : '',
        exit_price:     trade.exit_price ?? '',
        stop_loss:      trade.stop_loss ?? '',
        position_size:  mode === 'entry_exit' ? (trade.position_size ?? '') : '',
        fees:           trade.fees,
        strategy_id:    trade.strategy_id ?? '',
        timeframe:      trade.timeframe ?? '',
        notes:          trade.notes ?? '',
        direct_pnl:     trade.direct_pnl ?? '',
      })
      setSelectedTags(trade.tags.map(t => t.id))
      setSelectedAccountIdForm(trade.account_id ?? '')
      // Load screenshots — stored as JSON array or legacy single URL string
      if (trade.screenshot_path) {
        try {
          const parsed = JSON.parse(trade.screenshot_path)
          setScreenshots(Array.isArray(parsed) ? parsed : [{ url: trade.screenshot_path, caption: '' }])
        } catch {
          setScreenshots([{ url: trade.screenshot_path, caption: '' }])
        }
      }
      setConfidence(trade.confidence ?? null)
      setEmotionIntensity(trade.emotion_intensity ?? null)
      try { setEmotions(JSON.parse(trade.emotions || '[]')) } catch { setEmotions([]) }
      try { setMistakes(JSON.parse(trade.mistakes || '[]')) } catch { setMistakes([]) }
      try { setRulesFollowed(JSON.parse(trade.rules_followed || '[]')) } catch { setRulesFollowed([]) }
      try { setRulesBroken(JSON.parse(trade.rules_broken || '[]')) } catch { setRulesBroken([]) }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id, isEdit, reset])

  async function onSubmit(data) {
    setSubmitting(true)
    setSubmitError(null)
    let success = false
    try {
      let payload
      if (entryMode === 'direct_pnl') {
        payload = {
          date:              data.date,
          ticker:            data.ticker,
          direction:         data.direction,
          timeframe:         data.timeframe || null,
          strategy_id:       data.strategy_id || null,
          notes:             data.notes || null,
          fees:              Number(data.fees || 0),
          // Placeholders to satisfy DB NOT NULL constraints
          entry_price:       0,
          position_size:     1,
          exit_price:        null,
          stop_loss:         null,
          direct_pnl:        Number(data.direct_pnl),
          entry_mode:        'direct_pnl',
          screenshot_path:   screenshots.length ? JSON.stringify(screenshots) : null,
          tags:              selectedTags,
          account_id:        selectedAccountIdForm || null,
          confidence:        confidence,
          emotion_intensity: emotionIntensity,
          emotions:          JSON.stringify(emotions),
          mistakes:          JSON.stringify(mistakes),
          rules_followed:    JSON.stringify(rulesFollowed),
          rules_broken:      JSON.stringify(rulesBroken),
        }
      } else {
        payload = {
          ...data,
          entry_price:       Number(data.entry_price),
          exit_price:        data.exit_price ? Number(data.exit_price) : null,
          stop_loss:         data.stop_loss  ? Number(data.stop_loss)  : null,
          position_size:     Number(data.position_size),
          fees:              Number(data.fees || 0),
          strategy_id:       data.strategy_id || null,
          entry_mode:        'entry_exit',
          direct_pnl:        null,
          screenshot_path:   screenshots.length ? JSON.stringify(screenshots) : null,
          tags:              selectedTags,
          account_id:        selectedAccountIdForm || null,
          confidence:        confidence,
          emotion_intensity: emotionIntensity,
          emotions:          JSON.stringify(emotions),
          mistakes:          JSON.stringify(mistakes),
          rules_followed:    JSON.stringify(rulesFollowed),
          rules_broken:      JSON.stringify(rulesBroken),
        }
      }
      if (isEdit) {
        await tradesApi.update(id, payload)
      } else {
        await tradesApi.create(payload)
      }
      success = true
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err.message || 'Failed to save trade')
    } finally {
      setSubmitting(false)
    }
    if (success) {
      window.location.replace('/trades')
    }
  }

  function toggleTag(tagId) {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    )
  }

  if (loading) return <LoadingSpinner className="h-64" />

  return (
    <div>
      <div className="mb-6">
        <button
          type="button"
          onClick={() => flushSync(() => navigate(-1))}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Trades
        </button>
        <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Trade' : 'Log Trade'}</h1>
        <p className="text-sm text-gray-500 mt-1">{isEdit ? 'Update trade details' : 'Record a new trade'}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,_640px)_1fr] gap-6 items-start">
      <div className="space-y-6">
        {/* Core fields */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Trade Details</h2>
            {/* Entry mode toggle */}
            <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => switchEntryMode('entry_exit')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  entryMode === 'entry_exit'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Entry / Exit
              </button>
              <button
                type="button"
                onClick={() => switchEntryMode('direct_pnl')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  entryMode === 'direct_pnl'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Direct P&amp;L
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" error={errors.date?.message}>
              <input type="date" {...register('date', { required: 'Required' })} className={inputCls} />
            </Field>
            <Field label="Ticker / Symbol" error={errors.ticker?.message}>
              <input type="text" placeholder="AAPL" {...register('ticker', { required: 'Required' })}
                className={`${inputCls} uppercase`} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Direction" error={errors.direction?.message}>
              <select {...register('direction')} className={inputCls}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
            <Field label="Timeframe" optional>
              <select {...register('timeframe')} className={inputCls}>
                <option value="">Select...</option>
                {['1m','5m','15m','1h','4h','daily','weekly'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          {entryMode === 'entry_exit' ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Entry Price" error={errors.entry_price?.message}>
                  <input type="number" step="0.01" placeholder="0.00" {...register('entry_price', { required: 'Required', min: { value: 0.01, message: 'Must be > 0' } })} className={inputCls} />
                </Field>
                <Field label="Exit Price" optional>
                  <input type="number" step="0.01" placeholder="0.00" {...register('exit_price')} className={inputCls} />
                </Field>
                <Field label="Stop Loss" optional>
                  <input type="number" step="0.01" placeholder="0.00" {...register('stop_loss')} className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Position Size (shares/units)"
                  error={errors.position_size?.message}
                  headerAction={
                    <button
                      type="button"
                      onClick={() => setShowCalc(true)}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <Calculator className="w-4 h-4" />
                      Calc Size
                    </button>
                  }
                >
                  <input type="number" step="1" placeholder="100" {...register('position_size', { required: 'Required', min: { value: 0.001, message: 'Must be > 0' } })} className={inputCls} />
                </Field>
                <Field label="Fees / Commission" optional>
                  <input type="number" step="0.01" placeholder="0.00" {...register('fees')} className={inputCls} />
                </Field>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="P&L Amount ($)" error={errors.direct_pnl?.message}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 250.00 or -75.50"
                  {...register('direct_pnl', { required: 'Required' })}
                  className={inputCls}
                />
                <p className="text-xs text-gray-600 mt-1">Positive = profit, negative = loss</p>
              </Field>
              <Field label="Fees / Commission" optional>
                <input type="number" step="0.01" placeholder="0.00" {...register('fees')} className={inputCls} />
              </Field>
            </div>
          )}
        </div>

        {/* P&L Preview */}
        {previewPnl && (
          <div className={`rounded-xl border px-5 py-4 flex items-center gap-6
            ${previewPnl.pnl >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">
                {previewPnl.fees > 0 ? 'Net P&L (after fees)' : 'P&L'}
              </div>
              <div className={`text-xl font-bold font-mono ${previewPnl.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {previewPnl.pnl >= 0 ? '+' : ''}${previewPnl.pnl.toFixed(2)}
              </div>
              {previewPnl.fees > 0 && (
                <div className="text-xs text-gray-500 mt-0.5 font-mono">-${previewPnl.fees.toFixed(2)} fees</div>
              )}
            </div>
            {previewPnl.pct != null && (
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Return %</div>
                <div className={`text-sm font-mono ${previewPnl.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {previewPnl.pct >= 0 ? '+' : ''}{previewPnl.pct.toFixed(2)}%
                </div>
              </div>
            )}
            {previewPnl.r != null && (
              <div>
                <div className="text-xs text-gray-500 mb-0.5">R Multiple</div>
                <div className={`text-sm font-mono ${previewPnl.r >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {previewPnl.r.toFixed(2)}R
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optional fields */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">Optional Details</h2>

          {accounts.length > 0 && (
            <Field label="Account" optional>
              <select
                value={selectedAccountIdForm}
                onChange={e => setSelectedAccountIdForm(e.target.value)}
                className={inputCls}
              >
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}

          <Field label="Strategy" optional>
            <select {...register('strategy_id')} className={inputCls}>
              <option value="">None</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium">Tags <span className="text-gray-600 font-normal">(optional)</span></label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`transition-all ${selectedTags.includes(tag.id) ? 'opacity-100 scale-105' : 'opacity-50 hover:opacity-80'}`}
                >
                  <Badge color={tag.color}>{tag.name}</Badge>
                </button>
              ))}
            </div>
          </div>

          <Field label="Notes" optional>
            <textarea
              rows={4}
              placeholder="What was the setup? How did execution go?"
              {...register('notes')}
              className={`${inputCls} resize-none`}
            />
          </Field>
        </div>

        {/* Psychology section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-gray-300">Psychology <span className="text-gray-600 font-normal">(optional)</span></h2>
          </div>

          {/* Confidence + Intensity row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Setup Confidence</label>
              <StarRating value={confidence} onChange={setConfidence} />
              <p className="text-xs text-gray-600 mt-1">How confident were you in this setup?</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Emotion Intensity</label>
              <IntensityPicker value={emotionIntensity} onChange={setEmotionIntensity} />
              <p className="text-xs text-gray-600 mt-1">How strong were your emotions during this trade?</p>
            </div>
          </div>

          {/* Emotions */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium">Emotions Felt</label>
            <TagInput
              value={emotions}
              onChange={setEmotions}
              presets={EMOTION_PRESETS}
              placeholder="Type an emotion and press Enter..."
              colorClass="bg-purple-500/10 text-purple-300 border border-purple-500/20"
            />
          </div>

          {/* Mistakes */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium">Mistakes Made</label>
            <TagInput
              value={mistakes}
              onChange={setMistakes}
              presets={MISTAKE_PRESETS}
              placeholder="Type a mistake and press Enter..."
              colorClass="bg-red-500/10 text-red-300 border border-red-500/20"
            />
          </div>

          {/* Rules */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Rules Followed</label>
              <RuleInput
                value={rulesFollowed}
                onChange={setRulesFollowed}
                placeholder="e.g. Used stop loss..."
                colorClass="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Rules Broken</label>
              <RuleInput
                value={rulesBroken}
                onChange={setRulesBroken}
                placeholder="e.g. Moved stop loss..."
                colorClass="bg-orange-500/10 text-orange-300 border border-orange-500/20"
              />
            </div>
          </div>
        </div>

        {/* Position Calculator Modal */}
        {showCalc && entryMode === 'entry_exit' && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 overflow-y-auto">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCalc(false)} />
            <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Position Size Calculator</h3>
                <button
                  type="button"
                  onClick={() => setShowCalc(false)}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <PositionCalculator
                compact
                prefill={{
                  entry:     watchedValues[1],
                  stop:      watchedValues[5],
                  direction: watchedValues[0],
                }}
                onApplySize={(size) => {
                  setValue('position_size', Math.round(size * 100) / 100)
                  setShowCalc(false)
                }}
              />
            </div>
          </div>
        )}

      </div>

      {/* Right column — screenshots */}
      <ScreenshotPanel screenshots={screenshots} onChange={setScreenshots} />

      </div>

        {/* Actions */}
        {submitError && (
          <div className="px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400 mt-6">
            {submitError}
          </div>
        )}
        <div className="flex gap-3 justify-end mt-6">
          <button type="button" onClick={() => flushSync(() => navigate(-1))}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
            {submitting ? 'Saving...' : isEdit ? 'Update Trade' : 'Log Trade'}
          </button>
        </div>
      </form>
    </div>
  )
}
