import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { tradesApi } from '../api/trades.js'
import { strategiesApi } from '../api/strategies.js'
import { tagsApi } from '../api/tags.js'
import { useAccount } from '../contexts/AccountContext.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import Badge from '../components/ui/Badge.jsx'
import PositionCalculator from '../components/calculator/PositionCalculator.jsx'

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
            n <= (value ?? 0)
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
  const [previewPnl, setPreviewPnl] = useState(null)

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
    }
  })

  const watchedValues = watch(['direction', 'entry_price', 'exit_price', 'position_size', 'fees', 'stop_loss'])

  // Live P&L preview
  useEffect(() => {
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
    setPreviewPnl({ pnl, pct, r })
  }, [watchedValues])

  useEffect(() => {
    strategiesApi.list().then(setStrategies)
    tagsApi.list().then(setTags)
  }, [])

  useEffect(() => {
    if (!isEdit) return
    tradesApi.get(id).then(trade => {
      reset({
        date:           trade.date,
        ticker:         trade.ticker,
        direction:      trade.direction,
        entry_price:    trade.entry_price,
        exit_price:     trade.exit_price ?? '',
        stop_loss:      trade.stop_loss ?? '',
        position_size:  trade.position_size,
        fees:           trade.fees,
        strategy_id:    trade.strategy_id ?? '',
        timeframe:      trade.timeframe ?? '',
        notes:          trade.notes ?? '',
      })
      setSelectedTags(trade.tags.map(t => t.id))
      setSelectedAccountIdForm(trade.account_id ?? '')
      // Restore psychology fields
      setConfidence(trade.confidence ?? null)
      setEmotionIntensity(trade.emotion_intensity ?? null)
      try { setEmotions(JSON.parse(trade.emotions || '[]')) } catch { setEmotions([]) }
      try { setMistakes(JSON.parse(trade.mistakes || '[]')) } catch { setMistakes([]) }
      try { setRulesFollowed(JSON.parse(trade.rules_followed || '[]')) } catch { setRulesFollowed([]) }
      try { setRulesBroken(JSON.parse(trade.rules_broken || '[]')) } catch { setRulesBroken([]) }
      setLoading(false)
    })
  }, [id, isEdit, reset])

  async function onSubmit(data) {
    setSubmitting(true)
    try {
      const payload = {
        ...data,
        entry_price:       Number(data.entry_price),
        exit_price:        data.exit_price ? Number(data.exit_price) : null,
        stop_loss:         data.stop_loss  ? Number(data.stop_loss)  : null,
        position_size:     Number(data.position_size),
        fees:              Number(data.fees || 0),
        strategy_id:       data.strategy_id || null,
        tags:              selectedTags,
        account_id:        selectedAccountIdForm || null,
        confidence:        confidence,
        emotion_intensity: emotionIntensity,
        emotions:          JSON.stringify(emotions),
        mistakes:          JSON.stringify(mistakes),
        rules_followed:    JSON.stringify(rulesFollowed),
        rules_broken:      JSON.stringify(rulesBroken),
      }
      if (isEdit) {
        await tradesApi.update(id, payload)
      } else {
        await tradesApi.create(payload)
      }
      navigate('/trades')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleTag(tagId) {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    )
  }

  if (loading) return <LoadingSpinner className="h-64" />

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Trade' : 'Log Trade'}</h1>
        <p className="text-sm text-gray-500 mt-1">{isEdit ? 'Update trade details' : 'Record a new trade'}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Core fields */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">Trade Details</h2>

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
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
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
        </div>

        {/* P&L Preview */}
        {previewPnl && (
          <div className={`rounded-xl border px-5 py-4 flex items-center gap-6
            ${previewPnl.pnl >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Estimated P&L</div>
              <div className={`text-xl font-bold font-mono ${previewPnl.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {previewPnl.pnl >= 0 ? '+' : ''}${previewPnl.pnl.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Return %</div>
              <div className={`text-sm font-mono ${previewPnl.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {previewPnl.pct >= 0 ? '+' : ''}{previewPnl.pct.toFixed(2)}%
              </div>
            </div>
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
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
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
        {showCalc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCalc(false)} />
            <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Position Size Calculator</h3>
                <button
                  type="button"
                  onClick={() => setShowCalc(false)}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
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

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => navigate(-1)}
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
