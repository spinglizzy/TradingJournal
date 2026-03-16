import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2, ChevronUp, ChevronDown, X, Plus, Image } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { playbookApi } from '../api/playbook.js'
import { strategiesApi } from '../api/strategies.js'
import TipTapEditor from '../components/journal/TipTapEditor.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import Modal from '../components/ui/Modal.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEFRAMES = ['', '1m', '5m', '15m', '30m', '1h', '4h', 'daily', 'weekly', 'swing']

const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
  text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

const CONFIDENCE_COLORS = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-lime-400', 'text-emerald-400']

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt$(n, sign = true) {
  if (n == null) return '—'
  const prefix = sign ? (n >= 0 ? '+$' : '-$') : '$'
  return prefix + Math.abs(n).toFixed(2)
}
function fmtPct(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%' }
function fmtR(n)   { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + 'R' }
function pnlCls(v) { return v == null ? 'text-gray-400' : v >= 0 ? 'text-emerald-400' : 'text-red-400' }
function calcRR(entry, stop, target, dir = 'long') {
  if (!entry || !stop || !target) return null
  const e = Number(entry), s = Number(stop), t = Number(target)
  const risk   = Math.abs(e - s)
  const reward = Math.abs(t - e)
  return risk > 0 ? reward / risk : null
}

// ── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({ data, height = 40 }) {
  if (!data?.length) return (
    <div className="flex items-center justify-center h-10 text-xs text-gray-700">No data</div>
  )
  const vals = data.map(d => d.cumulative)
  const min = Math.min(0, ...vals)
  const max = Math.max(0, ...vals)
  const range = max - min || 1
  const W = 120, H = height, pad = 3
  const pts = vals.map((v, i) => [
    (i / Math.max(vals.length - 1, 1)) * W,
    H - pad - ((v - min) / range) * (H - pad * 2),
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const zeroY = H - pad - ((0 - min) / range) * (H - pad * 2)
  const lastVal = vals[vals.length - 1]
  const color = lastVal >= 0 ? '#10b981' : '#ef4444'

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1="0" y1={zeroY.toFixed(1)} x2={W} y2={zeroY.toFixed(1)} stroke="#374151" strokeWidth="0.5" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function Chip({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold font-mono ${valueClass}`}>{value ?? '—'}</span>
    </div>
  )
}

// ── Setup card ────────────────────────────────────────────────────────────────

function SetupCard({ setup, selected, onClick, onEdit, onDelete }) {
  const s = setup.stats ?? {}
  const winRate = s.win_rate?.toFixed(0)
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer rounded-xl border p-4 transition-all card-glow ${
        selected
          ? 'border-indigo-500/60 bg-indigo-500/5'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700'
      }`}
    >
      {/* Actions */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Header */}
      <div className="mb-3 pr-16">
        <h3 className="font-semibold text-white text-sm">{setup.name}</h3>
        {setup.timeframe && (
          <span className="text-xs text-gray-500">{setup.timeframe}</span>
        )}
        {setup.description && (
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{setup.description}</p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Chip label="Win Rate" value={winRate != null ? `${winRate}%` : '—'}
          valueClass={winRate >= 50 ? 'text-emerald-400' : winRate != null ? 'text-red-400' : 'text-gray-400'} />
        <Chip label="P&L" value={fmt$(s.total_pnl)} valueClass={pnlCls(s.total_pnl)} />
        <Chip label="Trades" value={s.total_trades ?? 0} />
      </div>

      {/* Sparkline */}
      <div className="h-10">
        <Sparkline data={setup.equity_curve} height={40} />
      </div>
    </div>
  )
}

// ── Checklist editor ──────────────────────────────────────────────────────────

function ChecklistEditor({ items, onChange }) {
  const [newItem, setNewItem] = useState('')

  function addItem() {
    const t = newItem.trim()
    if (!t) return
    onChange([...items, { id: Date.now(), text: t }])
    setNewItem('')
  }

  function removeItem(id) { onChange(items.filter(i => i.id !== id)) }

  function moveUp(idx) {
    if (idx === 0) return
    const a = [...items]
    ;[a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]
    onChange(a)
  }

  function moveDown(idx) {
    if (idx === items.length - 1) return
    const a = [...items]
    ;[a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]
    onChange(a)
  }

  function updateText(id, text) { onChange(items.map(i => i.id === id ? { ...i, text } : i)) }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0}
              className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors leading-none">
              <ChevronUp className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => moveDown(idx)} disabled={idx === items.length - 1}
              className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors leading-none">
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <span className="text-xs text-gray-500 w-5 shrink-0 text-right">{idx + 1}.</span>
          <input
            value={item.text}
            onChange={e => updateText(item.id, e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          <button type="button" onClick={() => removeItem(item.id)}
            className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
          placeholder="Add checklist item…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <button type="button" onClick={addItem}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">
          Add
        </button>
      </div>
    </div>
  )
}

// ── Setup editor panel ────────────────────────────────────────────────────────

function SetupEditorPanel({ setup, onSave, onClose, isSaving }) {
  const isNew = !setup

  const [editorTab, setEditorTab] = useState('overview')
  const [name,             setName]            = useState(setup?.name             ?? '')
  const [description,      setDescription]     = useState(setup?.description      ?? '')
  const [timeframe,        setTimeframe]        = useState(setup?.timeframe        ?? '')
  const [richDescription,  setRichDescription] = useState(setup?.rich_description  ?? '')
  const [entryRules,       setEntryRules]      = useState(setup?.entry_rules       ?? '')
  const [exitRules,        setExitRules]       = useState(setup?.exit_rules        ?? '')
  const [marketConditions, setMarketConditions]= useState(setup?.market_conditions ?? '')
  const [checklist,        setChecklist]       = useState(setup?.checklist         ?? [])
  const [defaultDirection, setDefaultDirection]= useState(setup?.default_fields?.direction ?? '')
  const [defaultTimeframe, setDefaultTimeframe]= useState(setup?.default_fields?.timeframe ?? '')
  const [screenshot,       setScreenshot]      = useState(setup?.screenshot_path  ?? null)
  const fileRef = useRef(null)

  async function handleScreenshotUpload(file) {
    if (!file) return
    const form = new FormData()
    form.append('screenshot', file)
    // Auth header — get current Supabase session token
    const { supabase } = await import('../lib/supabase.js')
    const { data: { session } } = await supabase.auth.getSession()
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
    const res = await fetch('/api/upload', { method: 'POST', headers, body: form })
    const { path } = await res.json()
    setScreenshot(path)
  }

  function handleSave() {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      description,
      rich_description:  richDescription,
      entry_rules:       entryRules,
      exit_rules:        exitRules,
      market_conditions: marketConditions,
      timeframe,
      checklist,
      default_fields: {
        direction: defaultDirection || undefined,
        timeframe: defaultTimeframe || undefined,
      },
      screenshot_path: screenshot ?? null,
    })
  }

  const editorTabs = [
    { id: 'overview',  label: 'Overview'  },
    { id: 'rules',     label: 'Rules'     },
    { id: 'checklist', label: 'Checklist' },
    { id: 'defaults',  label: 'Defaults'  },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
        <h2 className="font-semibold text-white text-sm">{isNew ? 'New Setup' : `Edit: ${setup.name}`}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Editor tabs */}
      <div className="flex gap-0 border-b border-gray-800 px-4 shrink-0">
        {editorTabs.map(t => (
          <button key={t.id} onClick={() => setEditorTab(t.id)}
            className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              editorTab === t.id
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {editorTab === 'overview' && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Setup Name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Breakout, Bull Flag, VWAP Reclaim"
                className={inputCls} />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Short Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)}
                placeholder="One-line summary shown on the card"
                className={inputCls} />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Timeframe</label>
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className={inputCls}>
                {TIMEFRAMES.map(t => <option key={t} value={t}>{t || 'Any / Multiple'}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Full Description</label>
              <TipTapEditor content={richDescription} onChange={setRichDescription}
                placeholder="Describe this setup in detail — what it looks like, why it works…" minHeight={200} />
            </div>

            {/* Screenshot */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Reference Screenshot / Diagram</label>
              {screenshot ? (
                <div className="relative group inline-block">
                  <img src={screenshot}
                    alt="setup diagram" className="max-w-full max-h-48 rounded-lg border border-gray-700 object-contain" />
                  <button onClick={() => setScreenshot(null)}
                    className="absolute top-1 right-1 bg-gray-900/80 text-gray-400 hover:text-red-400 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-3 border border-dashed border-gray-700 rounded-xl text-sm text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors w-full justify-center">
                  <Image className="w-4 h-4" />
                  Upload diagram or screenshot
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleScreenshotUpload(e.target.files[0]) }} />
            </div>
          </>
        )}

        {editorTab === 'rules' && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Entry Rules</label>
              <TipTapEditor content={entryRules} onChange={setEntryRules}
                placeholder="Conditions that must be met to enter this trade…" minHeight={180} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Exit Rules</label>
              <TipTapEditor content={exitRules} onChange={setExitRules}
                placeholder="When to take profit and when to cut losses…" minHeight={180} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Ideal Market Conditions</label>
              <textarea value={marketConditions} onChange={e => setMarketConditions(e.target.value)}
                rows={4} placeholder="Market environment where this setup performs best…"
                className={`${inputCls} resize-none`} />
            </div>
          </>
        )}

        {editorTab === 'checklist' && (
          <div>
            <p className="text-xs text-gray-500 mb-4">Add criteria to check before entering a trade with this setup. Items are shown in the trade entry form.</p>
            <ChecklistEditor items={checklist} onChange={setChecklist} />
          </div>
        )}

        {editorTab === 'defaults' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">These values will be pre-filled in the trade form when this setup is selected via "Start Trade".</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Default Direction</label>
              <select value={defaultDirection} onChange={e => setDefaultDirection(e.target.value)} className={inputCls}>
                <option value="">None (leave as is)</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Default Timeframe</label>
              <select value={defaultTimeframe} onChange={e => setDefaultTimeframe(e.target.value)} className={inputCls}>
                {TIMEFRAMES.map(t => <option key={t} value={t}>{t || 'None'}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={isSaving || !name.trim()}
          className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors font-medium">
          {isSaving ? 'Saving…' : isNew ? 'Create Setup' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ── Setup detail view ─────────────────────────────────────────────────────────

function SetupDetailPanel({ setupId, allSetups, onClose, onEdit }) {
  const navigate = useNavigate()
  const [detail,  setDetail]  = useState(null)
  const [trades,  setTrades]  = useState([])
  const [tab,     setTab]     = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!setupId) return
    setLoading(true)
    Promise.all([
      playbookApi.setupDetail(setupId),
      playbookApi.setupTrades(setupId),
    ]).then(([d, t]) => {
      setDetail(d)
      setTrades(t)
    }).finally(() => setLoading(false))
  }, [setupId])

  if (loading) return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <span className="text-sm text-gray-400">Loading…</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <LoadingSpinner className="flex-1" />
    </div>
  )

  if (!detail) return null

  const s = detail.stats ?? {}
  const setup = allSetups.find(x => x.id === setupId) ?? detail

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-800 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-white text-base">{detail.name}</h2>
            {detail.timeframe && <span className="text-xs text-gray-500">{detail.timeframe}</span>}
            {detail.description && <p className="text-xs text-gray-500 mt-0.5">{detail.description}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => navigate('/trades/new', {
                state: {
                  strategy_id: detail.id,
                  direction:   detail.default_fields?.direction,
                  timeframe:   detail.default_fields?.timeframe ?? detail.timeframe,
                }
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Start Trade
            </button>
            <button onClick={onEdit}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary stats row */}
        <div className="grid grid-cols-5 gap-2">
          <Chip label="Win Rate" value={s.win_rate != null ? `${s.win_rate.toFixed(0)}%` : '—'}
            valueClass={s.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'} />
          <Chip label="P&L" value={fmt$(s.total_pnl)} valueClass={pnlCls(s.total_pnl)} />
          <Chip label="Trades" value={s.total_trades ?? 0} />
          <Chip label="Avg R" value={fmtR(s.avg_r)} valueClass={pnlCls(s.avg_r)} />
          <Chip label="P-Factor" value={s.profit_factor?.toFixed(2) ?? '—'}
            valueClass={s.profit_factor >= 1 ? 'text-emerald-400' : 'text-red-400'} />
        </div>

        {/* Detail tabs */}
        <div className="flex gap-0">
          {['overview', 'performance', 'trades'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">

        {tab === 'overview' && (
          <div className="space-y-5">
            {detail.rich_description && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Description</h3>
                <div className="prose-sm text-gray-300 text-sm leading-relaxed bg-gray-800/30 border border-gray-800 rounded-xl p-4"
                  dangerouslySetInnerHTML={{ __html: detail.rich_description }} />
              </div>
            )}

            {detail.entry_rules && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Entry Rules</h3>
                <div className="text-sm text-gray-300 leading-relaxed bg-gray-800/30 border border-gray-800 rounded-xl p-4"
                  dangerouslySetInnerHTML={{ __html: detail.entry_rules }} />
              </div>
            )}

            {detail.exit_rules && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Exit Rules</h3>
                <div className="text-sm text-gray-300 leading-relaxed bg-gray-800/30 border border-gray-800 rounded-xl p-4"
                  dangerouslySetInnerHTML={{ __html: detail.exit_rules }} />
              </div>
            )}

            {detail.market_conditions && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Ideal Market Conditions</h3>
                <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/30 border border-gray-800 rounded-xl p-4">{detail.market_conditions}</p>
              </div>
            )}

            {detail.checklist?.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Entry Checklist</h3>
                <div className="space-y-1.5">
                  {detail.checklist.map((item, i) => (
                    <div key={item.id ?? i} className="flex items-center gap-2.5 text-sm text-gray-300">
                      <div className="w-4 h-4 rounded border border-gray-600 shrink-0 flex items-center justify-center">
                        <span className="text-xs text-gray-600">{i + 1}</span>
                      </div>
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.screenshot_path && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Reference Diagram</h3>
                <img
                  src={detail.screenshot_path}
                  alt="setup diagram"
                  className="max-w-full rounded-xl border border-gray-700 object-contain max-h-72"
                />
              </div>
            )}

            {!detail.rich_description && !detail.entry_rules && !detail.exit_rules && !detail.checklist?.length && (
              <div className="py-12 text-center text-gray-600 text-sm">
                No content yet — click <button onClick={onEdit} className="text-indigo-400 hover:text-indigo-300">Edit</button> to add setup details.
              </div>
            )}
          </div>
        )}

        {tab === 'performance' && (
          <div className="space-y-5">
            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Expectancy', value: fmt$(s.expectancy), cls: pnlCls(s.expectancy) },
                { label: 'Avg Win', value: fmt$(s.avg_win), cls: 'text-emerald-400' },
                { label: 'Avg Loss', value: fmt$(s.avg_loss), cls: 'text-red-400' },
                { label: 'Avg R', value: fmtR(s.avg_r), cls: pnlCls(s.avg_r) },
              ].map(m => (
                <div key={m.label} className="bg-gray-800/50 border border-gray-800 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">{m.label}</div>
                  <div className={`text-lg font-bold font-mono ${m.cls}`}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Best / Worst trade */}
            {(s.best_trade || s.worst_trade) && (
              <div className="grid grid-cols-2 gap-3">
                {s.best_trade && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Best Trade</div>
                    <div className="text-emerald-400 font-bold">{s.best_trade.ticker}</div>
                    <div className="text-emerald-400 font-mono text-sm">{fmt$(s.best_trade.pnl)}</div>
                    <div className="text-xs text-gray-600">{s.best_trade.date}</div>
                  </div>
                )}
                {s.worst_trade && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Worst Trade</div>
                    <div className="text-red-400 font-bold">{s.worst_trade.ticker}</div>
                    <div className="text-red-400 font-mono text-sm">{fmt$(s.worst_trade.pnl)}</div>
                    <div className="text-xs text-gray-600">{s.worst_trade.date}</div>
                  </div>
                )}
              </div>
            )}

            {/* Equity curve */}
            {detail.equity_curve?.length > 1 && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Equity Curve</h3>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={detail.equity_curve}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#9ca3af', fontSize: '11px' }}
                      formatter={(v) => [`$${v.toFixed(2)}`, 'Cumulative']}
                    />
                    <Line type="monotone" dataKey="cumulative" stroke="#6366f1" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* By weekday */}
            {detail.by_weekday?.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">P&L by Day of Week</h3>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={detail.by_weekday}>
                    <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v) => [`$${v.toFixed(2)}`, 'P&L']}
                    />
                    <Bar dataKey="total_pnl" radius={[3, 3, 0, 0]}>
                      {detail.by_weekday.map((entry, i) => (
                        <Cell key={i} fill={entry.total_pnl >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* By ticker */}
            {detail.by_ticker?.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Performance by Ticker</h3>
                <div className="space-y-1.5">
                  {detail.by_ticker.map(t => (
                    <div key={t.ticker} className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-white w-16 shrink-0">{t.ticker}</span>
                      <span className="text-gray-500 text-xs w-16 shrink-0">{t.trades} trades</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-1.5 min-w-0">
                        <div
                          className={`h-full rounded-full ${t.total_pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, Math.abs(t.total_pnl) / 10)}%` }}
                        />
                      </div>
                      <span className={`font-mono text-xs w-20 text-right shrink-0 ${pnlCls(t.total_pnl)}`}>
                        {fmt$(t.total_pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.total_trades === 0 && (
              <div className="py-12 text-center text-gray-600 text-sm">No trades recorded with this setup yet.</div>
            )}
          </div>
        )}

        {tab === 'trades' && (
          <div>
            {trades.length === 0 ? (
              <div className="py-12 text-center text-gray-600 text-sm">No trades with this setup yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Date', 'Ticker', 'Dir', 'Entry', 'Exit', 'P&L', 'R'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {trades.map(t => (
                      <tr key={t.id}
                        onClick={() => navigate(`/trades/${t.id}`)}
                        className="hover:bg-gray-800/30 cursor-pointer transition-colors">
                        <td className="px-2 py-2 text-xs text-gray-500 font-mono">{t.date}</td>
                        <td className="px-2 py-2 font-semibold text-white">{t.ticker}</td>
                        <td className="px-2 py-2">
                          <span className={`text-xs font-medium ${t.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs font-mono text-gray-300">${t.entry_price}</td>
                        <td className="px-2 py-2 text-xs font-mono text-gray-300">{t.exit_price ? `$${t.exit_price}` : '—'}</td>
                        <td className={`px-2 py-2 text-xs font-mono font-semibold ${pnlCls(t.pnl)}`}>{fmt$(t.pnl)}</td>
                        <td className={`px-2 py-2 text-xs font-mono ${pnlCls(t.r_multiple)}`}>{fmtR(t.r_multiple)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Compare view ──────────────────────────────────────────────────────────────

function CompareView({ allSetups }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [compareData, setCompareData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedIds.length < 2) { setCompareData([]); return }
    setLoading(true)
    playbookApi.compare(selectedIds)
      .then(setCompareData)
      .finally(() => setLoading(false))
  }, [selectedIds])

  function toggleSetup(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 3))
  }

  const METRICS = [
    { key: 'win_rate',       label: 'Win Rate',       fmt: v => v != null ? `${v.toFixed(1)}%` : '—', higher: true  },
    { key: 'total_pnl',      label: 'Total P&L',      fmt: v => fmt$(v),                              higher: true  },
    { key: 'profit_factor',  label: 'Profit Factor',  fmt: v => v?.toFixed(2) ?? '—',                 higher: true  },
    { key: 'expectancy',     label: 'Expectancy',     fmt: v => fmt$(v),                              higher: true  },
    { key: 'avg_r',          label: 'Avg R',          fmt: v => fmtR(v),                              higher: true  },
    { key: 'total_trades',   label: 'Total Trades',   fmt: v => v ?? 0,                               higher: false },
    { key: 'closed_trades',  label: 'Closed Trades',  fmt: v => v ?? 0,                               higher: false },
    { key: 'wins',           label: 'Wins',           fmt: v => v ?? 0,                               higher: true  },
    { key: 'losses',         label: 'Losses',         fmt: v => v ?? 0,                               higher: false },
    { key: 'avg_win',        label: 'Avg Win $',      fmt: v => fmt$(v),                              higher: true  },
    { key: 'avg_loss',       label: 'Avg Loss $',     fmt: v => fmt$(v),                              higher: false },
    { key: 'best_pnl',       label: 'Best Trade',     fmt: v => fmt$(v),                              higher: true  },
    { key: 'worst_pnl',      label: 'Worst Trade',    fmt: v => fmt$(v),                              higher: true  },
  ]

  return (
    <div className="space-y-5">
      {/* Setup selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Select 2–3 setups to compare</h3>
        <div className="flex flex-wrap gap-2">
          {allSetups.map(setup => (
            <button key={setup.id} onClick={() => toggleSetup(setup.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-medium ${
                selectedIds.includes(setup.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}>
              {setup.name}
            </button>
          ))}
        </div>
        {allSetups.length === 0 && <p className="text-sm text-gray-600">No setups yet. Create some in the Setups tab.</p>}
      </div>

      {loading && <LoadingSpinner className="h-40" />}

      {!loading && compareData.length >= 2 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-glow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Metric</th>
                {compareData.map(s => (
                  <th key={s.id} className="text-center px-4 py-3 text-xs font-medium text-white uppercase tracking-wide">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {METRICS.map(m => {
                const vals = compareData.map(s => s.stats?.[m.key])
                const numVals = vals.filter(v => v != null)
                const best = numVals.length > 0
                  ? m.higher ? Math.max(...numVals) : Math.min(...numVals)
                  : null

                return (
                  <tr key={m.key} className="hover:bg-gray-800/20">
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">{m.label}</td>
                    {compareData.map((s, i) => {
                      const v = s.stats?.[m.key]
                      const isBest = v != null && v === best && numVals.length > 1
                      return (
                        <td key={s.id} className={`px-4 py-2.5 text-center font-mono text-xs font-semibold ${
                          isBest ? 'text-emerald-400' : 'text-gray-300'
                        }`}>
                          {m.fmt(v)}
                          {isBest && <span className="ml-1 text-emerald-500">★</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {/* Sparklines row */}
              <tr className="hover:bg-gray-800/20">
                <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">Equity Curve</td>
                {compareData.map(s => (
                  <td key={s.id} className="px-4 py-2">
                    <Sparkline data={s.equity_curve} height={44} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && selectedIds.length < 2 && allSetups.length > 0 && (
        <div className="text-center py-12 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
          Select at least 2 setups above to compare them
        </div>
      )}
    </div>
  )
}

// ── Planned trade form ────────────────────────────────────────────────────────

function PlanForm({ plan, setups, onSave, onCancel }) {
  const [ticker,  setTicker]  = useState(plan?.ticker        ?? '')
  const [setupId, setSetupId] = useState(plan?.strategy_id   ?? '')
  const [dir,     setDir]     = useState(plan?.direction      ?? 'long')
  const [entry,   setEntry]   = useState(plan?.planned_entry  ?? '')
  const [stop,    setStop]    = useState(plan?.stop_loss      ?? '')
  const [target,  setTarget]  = useState(plan?.target_price   ?? '')
  const [notes,   setNotes]   = useState(plan?.notes          ?? '')
  const [conf,    setConf]    = useState(plan?.confidence     ?? null)
  const [status,  setStatus]  = useState(plan?.status         ?? 'active')

  const rr = calcRR(entry, stop, target, dir)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Ticker *</label>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL" className={`${inputCls} uppercase`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Setup</label>
          <select value={setupId} onChange={e => setSetupId(e.target.value)} className={inputCls}>
            <option value="">None</option>
            {setups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Direction</label>
          <select value={dir} onChange={e => setDir(e.target.value)} className={inputCls}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Planned Entry</label>
          <input type="number" step="0.01" value={entry} onChange={e => setEntry(e.target.value)}
            placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Stop Loss</label>
          <input type="number" step="0.01" value={stop} onChange={e => setStop(e.target.value)}
            placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Target</label>
          <input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)}
            placeholder="0.00" className={inputCls} />
        </div>
      </div>

      {/* R:R preview */}
      {rr != null && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
          rr >= 2 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-gray-800/50 border-gray-700 text-gray-400'
        }`}>
          <span className="font-mono font-bold">{rr.toFixed(2)}:1</span>
          <span className="text-xs">Risk/Reward</span>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Confidence (1–5)</label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setConf(conf === n ? null : n)}
              className={`w-9 h-9 rounded-lg text-sm font-bold border transition-colors ${
                conf >= n ? `${CONFIDENCE_COLORS[n]} border-current bg-current/10` : 'border-gray-700 text-gray-600 hover:border-gray-500'
              }`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Why this setup? What are you waiting for?"
          className={`${inputCls} resize-none`} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
        <button
          onClick={() => onSave({ ticker, strategy_id: setupId || null, direction: dir,
            planned_entry: entry || null, stop_loss: stop || null, target_price: target || null,
            notes, confidence: conf, status })}
          disabled={!ticker.trim()}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors">
          {plan ? 'Save' : 'Add to Pipeline'}
        </button>
      </div>
    </div>
  )
}

// ── Execute planned trade modal ───────────────────────────────────────────────

function ExecuteModal({ plan, onExecute, onClose }) {
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0])
  const [entry,    setEntry]    = useState(plan?.planned_entry ?? '')
  const [size,     setSize]     = useState(100)
  const [fees,     setFees]     = useState(0)
  const [timeframe,setTimeframe]= useState('')
  const [notes,    setNotes]    = useState(plan?.notes ?? '')

  return (
    <Modal isOpen onClose={onClose} title={`Execute: ${plan.ticker}`} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-gray-400">This will create a new open trade pre-filled with your planned details.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Actual Entry</label>
            <input type="number" step="0.01" value={entry} onChange={e => setEntry(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Position Size</label>
            <input type="number" step="1" value={size} onChange={e => setSize(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fees</label>
            <input type="number" step="0.01" value={fees} onChange={e => setFees(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            onClick={() => onExecute({ date, entry_price: Number(entry) || null, position_size: Number(size), fees: Number(fees), timeframe, notes })}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
            Create Trade
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Pipeline section ──────────────────────────────────────────────────────────

function PipelineSection({ setups }) {
  const navigate = useNavigate()
  const [plans,     setPlans]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editPlan,  setEditPlan]  = useState(null)
  const [execPlan,  setExecPlan]  = useState(null)
  const [deleteId,  setDeleteId]  = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')

  const load = useCallback(() => {
    setLoading(true)
    playbookApi.planned({ status: statusFilter || undefined })
      .then(setPlans)
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    if (editPlan) {
      await playbookApi.updatePlanned(editPlan.id, data)
    } else {
      await playbookApi.createPlanned(data)
    }
    setShowForm(false)
    setEditPlan(null)
    load()
  }

  async function handleDelete() {
    await playbookApi.deletePlanned(deleteId)
    setDeleteId(null)
    load()
  }

  async function handleExecute(data) {
    const { trade_id } = await playbookApi.executePlanned(execPlan.id, data)
    setExecPlan(null)
    load()
    navigate(`/trades/${trade_id}`)
  }

  const STATUS_CLS = {
    active:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    executed:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
    cancelled: 'text-gray-500 bg-gray-700/30 border-gray-700',
    expired:   'text-orange-400 bg-orange-500/10 border-orange-500/20',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-900 border border-gray-800 p-0.5">
            {['', 'active', 'executed', 'cancelled', 'expired'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  statusFilter === s ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}>
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { setEditPlan(null); setShowForm(true) }}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Add to Pipeline
        </button>
      </div>

      {/* Inline form */}
      {(showForm || editPlan) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
          <h3 className="text-sm font-medium text-white mb-4">{editPlan ? 'Edit Planned Trade' : 'New Planned Trade'}</h3>
          <PlanForm
            plan={editPlan}
            setups={setups}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditPlan(null) }}
          />
        </div>
      )}

      {loading ? <LoadingSpinner className="h-40" /> : plans.length === 0 ? (
        <div className="py-16 text-center text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
          No {statusFilter} trades in your pipeline
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map(plan => {
            const rr = calcRR(plan.planned_entry, plan.stop_loss, plan.target_price, plan.direction)
            return (
              <div key={plan.id} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 transition-colors card-glow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Ticker + direction */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{plan.ticker}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          plan.direction === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {plan.direction.toUpperCase()}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_CLS[plan.status] ?? STATUS_CLS.active}`}>
                          {plan.status}
                        </span>
                      </div>
                      {plan.strategy_name && (
                        <div className="text-xs text-gray-500 mt-0.5">{plan.strategy_name}</div>
                      )}
                    </div>

                    {/* Prices */}
                    <div className="flex gap-3 text-xs flex-wrap ml-2">
                      {plan.planned_entry && (
                        <div><span className="text-gray-600">Entry </span><span className="text-gray-300 font-mono">${plan.planned_entry}</span></div>
                      )}
                      {plan.stop_loss && (
                        <div><span className="text-gray-600">Stop </span><span className="text-red-400 font-mono">${plan.stop_loss}</span></div>
                      )}
                      {plan.target_price && (
                        <div><span className="text-gray-600">Target </span><span className="text-emerald-400 font-mono">${plan.target_price}</span></div>
                      )}
                      {rr != null && (
                        <div className={`font-mono font-semibold ${rr >= 2 ? 'text-emerald-400' : 'text-gray-400'}`}>
                          {rr.toFixed(2)}:1
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {plan.notes && (
                      <p className="text-xs text-gray-600 truncate max-w-xs ml-auto">{plan.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {plan.status === 'active' && (
                      <button onClick={() => setExecPlan(plan)}
                        className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium">
                        Execute
                      </button>
                    )}
                    {plan.status === 'executed' && plan.trade_id && (
                      <button onClick={() => navigate(`/trades/${plan.trade_id}`)}
                        className="px-2.5 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition-colors">
                        View Trade
                      </button>
                    )}
                    <button onClick={() => { setEditPlan(plan); setShowForm(false) }}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(plan.id)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {execPlan && (
        <ExecuteModal plan={execPlan} onExecute={handleExecute} onClose={() => setExecPlan(null)} />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Planned Trade"
        message="This planned trade will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

// ── Missed trade form ─────────────────────────────────────────────────────────

function MissedForm({ trade, setups, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [date,   setDate]   = useState(trade?.date                  ?? today)
  const [ticker, setTicker] = useState(trade?.ticker                ?? '')
  const [setupId,setSetupId]= useState(trade?.strategy_id           ?? '')
  const [dir,    setDir]    = useState(trade?.direction              ?? 'long')
  const [entry,  setEntry]  = useState(trade?.entry_would_have_been  ?? '')
  const [exit,   setExit]   = useState(trade?.exit_would_have_been   ?? '')
  const [size,   setSize]   = useState(trade?.position_size          ?? 100)
  const [simPnl, setSimPnl] = useState(trade?.simulated_pnl         ?? '')
  const [reason, setReason] = useState(trade?.reason_missed          ?? '')
  const [notes,  setNotes]  = useState(trade?.notes                  ?? '')

  // Auto-calculate simulated P&L
  useEffect(() => {
    if (!entry || !exit || !size) return
    const mult = dir === 'long' ? 1 : -1
    const pnl = mult * (Number(exit) - Number(entry)) * Number(size)
    setSimPnl(pnl.toFixed(2))
  }, [entry, exit, size, dir])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Ticker *</label>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL" className={`${inputCls} uppercase`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Setup</label>
          <select value={setupId} onChange={e => setSetupId(e.target.value)} className={inputCls}>
            <option value="">None</option>
            {setups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Direction</label>
          <select value={dir} onChange={e => setDir(e.target.value)} className={inputCls}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Would-have Entry</label>
          <input type="number" step="0.01" value={entry} onChange={e => setEntry(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Would-have Exit</label>
          <input type="number" step="0.01" value={exit} onChange={e => setExit(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Size</label>
          <input type="number" step="1" value={size} onChange={e => setSize(e.target.value)} className={inputCls} />
        </div>
      </div>

      {simPnl !== '' && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono font-bold ${
          Number(simPnl) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          Simulated P&L: {fmt$(Number(simPnl))}
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Reason Missed</label>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Was distracted, Didn't take the setup, Fear of loss"
          className={inputCls} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className={`${inputCls} resize-none`} />
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

// ── Missed section ────────────────────────────────────────────────────────────

function MissedSection({ setups }) {
  const [missed,   setMissed]   = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([playbookApi.missed(), playbookApi.missedSummary()])
      .then(([m, s]) => { setMissed(m); setSummary(s) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    if (editItem) {
      await playbookApi.updateMissed(editItem.id, data)
    } else {
      await playbookApi.createMissed(data)
    }
    setShowForm(false)
    setEditItem(null)
    load()
  }

  async function handleDelete() {
    await playbookApi.deleteMissed(deleteId)
    setDeleteId(null)
    load()
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`bg-gray-900 border rounded-xl p-4 card-glow ${summary.total_missed >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
            <div className="text-xs text-gray-500 mb-1">Total P&L Left on Table</div>
            <div className={`text-2xl font-bold font-mono ${pnlCls(summary.total_missed)}`}>
              {fmt$(summary.total_missed)}
            </div>
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Missed Trades Log</h3>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Log Missed Trade
        </button>
      </div>

      {/* Inline form */}
      {(showForm || editItem) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
          <h3 className="text-sm font-medium text-white mb-4">{editItem ? 'Edit' : 'Log Missed Trade'}</h3>
          <MissedForm
            trade={editItem}
            setups={setups}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditItem(null) }}
          />
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
                {['Date', 'Ticker', 'Dir', 'Setup', 'Entry', 'Exit', 'Sim P&L', 'Reason', ''].map(h => (
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
                      {t.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{t.strategy_name || '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-gray-400">
                    {t.entry_would_have_been ? `$${t.entry_would_have_been}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-gray-400">
                    {t.exit_would_have_been ? `$${t.exit_would_have_been}` : '—'}
                  </td>
                  <td className={`px-3 py-2.5 text-xs font-mono font-semibold ${pnlCls(t.simulated_pnl)}`}>
                    {fmt$(t.simulated_pnl)}
                  </td>
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

export default function Playbook() {
  const [tab,           setTab]           = useState('setups')
  const [setups,        setSetups]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selectedId,    setSelectedId]    = useState(null)   // for detail panel
  const [editingSetup,  setEditingSetup]  = useState(null)   // null = new, setup = edit
  const [isEditorOpen,  setIsEditorOpen]  = useState(false)
  const [isSaving,      setIsSaving]      = useState(false)
  const [deleteId,      setDeleteId]      = useState(null)

  const loadSetups = useCallback(() => {
    playbookApi.setups().then(setSetups).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSetups() }, [loadSetups])

  async function handleSaveSetup(data) {
    setIsSaving(true)
    try {
      if (editingSetup) {
        await strategiesApi.update(editingSetup.id, data)
      } else {
        await strategiesApi.create(data)
      }
      setIsEditorOpen(false)
      setEditingSetup(null)
      loadSetups()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteSetup() {
    await strategiesApi.delete(deleteId)
    setDeleteId(null)
    if (selectedId === deleteId) setSelectedId(null)
    loadSetups()
  }

  function openNew() { setEditingSetup(null); setIsEditorOpen(true) }
  function openEdit(setup) { setEditingSetup(setup); setIsEditorOpen(true) }
  function closeEditor() { setIsEditorOpen(false); setEditingSetup(null) }

  const TABS = [
    { id: 'setups',   label: 'Setups'        },
    { id: 'compare',  label: 'Compare'       },
    { id: 'pipeline', label: 'Pipeline'      },
    { id: 'missed',   label: 'Missed Trades' },
  ]

  // Determine layout for setups tab
  const showDetail  = tab === 'setups' && selectedId != null && !isEditorOpen
  const showEditor  = isEditorOpen

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Playbook</h1>
          <p className="text-sm text-gray-500 mt-0.5">Trading setups, pipeline &amp; opportunity tracking</p>
        </div>
        {tab === 'setups' && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            New Setup
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              tab === t.id
                ? 'tab-active'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Setups tab ── */}
      {tab === 'setups' && (
        loading ? <LoadingSpinner className="h-64" /> : (
          <div className={`grid gap-5 ${(showDetail || showEditor) ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>

            {/* Left: setup grid */}
            <div className={(showDetail || showEditor) ? 'lg:col-span-2' : ''}>
              {setups.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-gray-800 rounded-xl">
                  <div className="text-gray-500 text-sm mb-3">No setups yet</div>
                  <button onClick={openNew}
                    className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                    + Create your first setup
                  </button>
                </div>
              ) : (
                <div className={`grid gap-3 ${(showDetail || showEditor) ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                  {setups.map(setup => (
                    <SetupCard
                      key={setup.id}
                      setup={setup}
                      selected={selectedId === setup.id}
                      onClick={() => setSelectedId(prev => prev === setup.id ? null : setup.id)}
                      onEdit={() => openEdit(setup)}
                      onDelete={() => setDeleteId(setup.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: detail or editor panel */}
            {(showDetail || showEditor) && (
              <div className="hidden lg:block lg:col-span-3">
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col card-glow" style={{ minHeight: '600px' }}>
                  {showEditor ? (
                    <SetupEditorPanel
                      key={editingSetup?.id ?? 'new'}
                      setup={editingSetup}
                      onSave={handleSaveSetup}
                      onClose={closeEditor}
                      isSaving={isSaving}
                    />
                  ) : (
                    <SetupDetailPanel
                      key={selectedId}
                      setupId={selectedId}
                      allSetups={setups}
                      onClose={() => setSelectedId(null)}
                      onEdit={() => openEdit(setups.find(s => s.id === selectedId))}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Mobile overlay for setup detail / editor */}
      {tab === 'setups' && (showDetail || showEditor) && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/50" onClick={() => { closeEditor(); setSelectedId(null) }} />
          <div className="w-full max-w-lg bg-gray-950 border-l border-gray-800 h-full overflow-y-auto shadow-2xl">
            {showEditor ? (
              <SetupEditorPanel
                key={`m-${editingSetup?.id ?? 'new'}`}
                setup={editingSetup}
                onSave={handleSaveSetup}
                onClose={closeEditor}
                isSaving={isSaving}
              />
            ) : (
              <SetupDetailPanel
                key={`m-${selectedId}`}
                setupId={selectedId}
                allSetups={setups}
                onClose={() => setSelectedId(null)}
                onEdit={() => openEdit(setups.find(s => s.id === selectedId))}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Compare tab ── */}
      {tab === 'compare' && <CompareView allSetups={setups} />}

      {/* ── Pipeline tab ── */}
      {tab === 'pipeline' && <PipelineSection setups={setups} />}

      {/* ── Missed tab ── */}
      {tab === 'missed' && <MissedSection setups={setups} />}

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Setup"
        message="This setup will be permanently deleted. Trades linked to it will lose the strategy reference."
        confirmLabel="Delete Setup"
        onConfirm={handleDeleteSetup}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
