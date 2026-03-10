import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { tradesApi } from '../api/trades.js'
import { strategiesApi } from '../api/strategies.js'
import { tagsApi } from '../api/tags.js'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import Badge from '../components/ui/Badge.jsx'

function Field({ label, error, children, optional }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-xs text-gray-400 mb-1.5 font-medium">
        {label}
        {optional && <span className="text-gray-600 font-normal">(optional)</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
  placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

export default function TradeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [strategies, setStrategies] = useState([])
  const [tags, setTags]             = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [loading, setLoading]       = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [previewPnl, setPreviewPnl] = useState(null)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      direction: 'long',
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
      setLoading(false)
    })
  }, [id, isEdit, reset])

  async function onSubmit(data) {
    setSubmitting(true)
    try {
      const payload = {
        ...data,
        entry_price:   Number(data.entry_price),
        exit_price:    data.exit_price ? Number(data.exit_price) : null,
        stop_loss:     data.stop_loss  ? Number(data.stop_loss)  : null,
        position_size: Number(data.position_size),
        fees:          Number(data.fees || 0),
        strategy_id:   data.strategy_id || null,
        tags:          selectedTags,
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
            <Field label="Position Size (shares/units)" error={errors.position_size?.message}>
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
