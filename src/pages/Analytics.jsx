import { useState, useMemo } from 'react'
import {
  BarChart2, Clock, Layers, CandlestickChart, Tag, Sliders, GitCompare, Save, Trash2, X
} from 'lucide-react'
import { statsApi } from '../api/stats.js'
import { useAccount } from '../contexts/AccountContext.jsx'
import { LocalDateFilter, fmt, fmtPnl, downloadCSV } from '../components/analytics/shared.jsx'
import { DatePicker } from '../components/ui/DatePicker.jsx'
import OverviewTab      from '../components/analytics/OverviewTab.jsx'
import ByTimeTab        from '../components/analytics/ByTimeTab.jsx'
import BySetupTab       from '../components/analytics/BySetupTab.jsx'
import ByInstrumentTab  from '../components/analytics/ByInstrumentTab.jsx'
import ByTagsTab        from '../components/analytics/ByTagsTab.jsx'
import CustomReportTab  from '../components/analytics/CustomReportTab.jsx'

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',     Icon: BarChart2 },
  { id: 'time',        label: 'By Time',      Icon: Clock },
  { id: 'setup',       label: 'By Setup',     Icon: Layers },
  { id: 'instrument',  label: 'By Instrument',Icon: CandlestickChart },
  { id: 'tags',        label: 'By Tags',      Icon: Tag },
  { id: 'custom',      label: 'Custom Report',Icon: Sliders },
]

// ── Preset storage for comparison mode ────────────────────────────────────────
const COMPARE_PRESET_KEY = 'analytics_compare_presets'

function loadComparePresets() {
  try { return JSON.parse(localStorage.getItem(COMPARE_PRESET_KEY) ?? '[]') } catch { return [] }
}
function saveComparePresets(presets) {
  localStorage.setItem(COMPARE_PRESET_KEY, JSON.stringify(presets))
}

// ── Comparison panel ───────────────────────────────────────────────────────────
function ComparisonPanel({ onClose }) {
  const [presets, setPresets]     = useState(loadComparePresets)
  const [presetAId, setPresetAId] = useState(presets[0]?.id ?? null)
  const [presetBId, setPresetBId] = useState(presets[1]?.id ?? null)
  const [results, setResults]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [newName, setNewName]     = useState('')
  const [newFrom, setNewFrom]     = useState('')
  const [newTo, setNewTo]         = useState('')

  function addPreset() {
    if (!newName.trim()) return
    const p = { id: Date.now(), name: newName.trim(), from: newFrom || null, to: newTo || null }
    const updated = [...presets, p]
    setPresets(updated)
    saveComparePresets(updated)
    setNewName(''); setNewFrom(''); setNewTo('')
  }

  function deletePreset(id) {
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    saveComparePresets(updated)
    if (presetAId === id) setPresetAId(null)
    if (presetBId === id) setPresetBId(null)
  }

  async function compare() {
    const a = presets.find(p => p.id === Number(presetAId))
    const b = presets.find(p => p.id === Number(presetBId))
    if (!a || !b) return
    setLoading(true)
    try {
      const [sumA, sumB, strA, strB] = await Promise.all([
        statsApi.summary({ from: a.from, to: a.to }),
        statsApi.summary({ from: b.from, to: b.to }),
        statsApi.streaks({ from: a.from, to: a.to }),
        statsApi.streaks({ from: b.from, to: b.to }),
      ])
      setResults({ a: { ...sumA, ...strA, name: a.name }, b: { ...sumB, ...strB, name: b.name } })
    } finally {
      setLoading(false)
    }
  }

  const COMPARE_METRICS = [
    { key: 'total_pnl',      label: 'Total P&L',      fmt: fmtPnl,                       color: v => v >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { key: 'win_rate',       label: 'Win Rate',        fmt: v => v != null ? `${fmt(v,1)}%` : '—', color: v => v >= 50 ? 'text-emerald-400' : 'text-red-400' },
    { key: 'profit_factor',  label: 'Profit Factor',   fmt: v => v != null ? fmt(v) : '—', color: v => v >= 1 ? 'text-emerald-400' : 'text-red-400' },
    { key: 'expectancy',     label: 'Expectancy',      fmt: fmtPnl,                       color: v => v >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { key: 'closed_trades',  label: 'Closed Trades',   fmt: v => v ?? '0',                color: () => 'text-white' },
    { key: 'avg_win',        label: 'Avg Winner',      fmt: fmtPnl,                       color: () => 'text-emerald-400' },
    { key: 'avg_loss',       label: 'Avg Loser',       fmt: fmtPnl,                       color: () => 'text-red-400' },
    { key: 'best_pnl',       label: 'Best Trade',      fmt: fmtPnl,                       color: () => 'text-emerald-400' },
    { key: 'worst_pnl',      label: 'Worst Trade',     fmt: fmtPnl,                       color: () => 'text-red-400' },
    { key: 'longest_win',    label: 'Best Streak',     fmt: v => v > 0 ? `${v} Win${v === 1 ? '' : 's'}` : '—',   color: () => 'text-emerald-400' },
    { key: 'longest_loss',   label: 'Worst Streak',    fmt: v => v > 0 ? `${v} Loss${v === 1 ? '' : 'es'}` : '—', color: () => 'text-red-400' },
  ]

  return (
    <div className="bg-gray-900 border border-indigo-500/20 rounded-2xl p-6 mb-6 relative">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">Comparison Mode</h2>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Preset management */}
      <div className="mb-5 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
        <div className="text-xs font-medium text-gray-400 mb-3">Saved filter presets</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map(p => (
            <div key={p.id} className="flex items-center gap-1 bg-gray-700 border border-gray-600 rounded-full pl-3 pr-1 py-1">
              <span className="text-xs text-gray-200">{p.name}</span>
              {p.from && <span className="text-xs text-gray-500 ml-1">{p.from}{p.to ? `→${p.to}` : ''}</span>}
              <button onClick={() => deletePreset(p.id)} className="text-gray-500 hover:text-red-400 transition-colors p-0.5">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {!presets.length && <span className="text-xs text-gray-600">No presets yet</span>}
        </div>
        {/* Add preset form */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Preset name…"
              onKeyDown={e => e.key === 'Enter' && addPreset()}
              className="bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500 w-36" />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-36"><DatePicker value={newFrom} onChange={setNewFrom} placeholder="From" /></div>
            <span className="text-gray-600 text-xs">→</span>
            <div className="w-36"><DatePicker value={newTo} onChange={setNewTo} placeholder="To" /></div>
          </div>
          <button onClick={addPreset}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors">
            <Save className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Compare selector */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Preset A</label>
          <select value={presetAId ?? ''} onChange={e => setPresetAId(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500 min-w-[160px]">
            <option value="">Select preset…</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Preset B</label>
          <select value={presetBId ?? ''} onChange={e => setPresetBId(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500 min-w-[160px]">
            <option value="">Select preset…</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button
          onClick={compare}
          disabled={!presetAId || !presetBId || presetAId === presetBId || loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
        >
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2 pr-6 w-40">Metric</th>
                <th className="text-left text-xs font-medium text-indigo-400 uppercase tracking-wide py-2 pr-6">{results.a.name}</th>
                <th className="text-left text-xs font-medium text-purple-400 uppercase tracking-wide py-2 pr-6">{results.b.name}</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-2">Δ Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {COMPARE_METRICS.map(m => {
                const vA = results.a[m.key]
                const vB = results.b[m.key]
                const diff = (typeof vA === 'number' && typeof vB === 'number') ? vA - vB : null
                return (
                  <tr key={m.key} className="hover:bg-gray-800/20">
                    <td className="py-2.5 pr-6 text-gray-400">{m.label}</td>
                    <td className={`py-2.5 pr-6 font-mono font-medium ${m.color(vA)}`}>
                      {m.fmt(vA)}
                    </td>
                    <td className={`py-2.5 pr-6 font-mono font-medium ${m.color(vB)}`}>
                      {m.fmt(vB)}
                    </td>
                    <td className={`py-2.5 font-mono text-xs ${diff == null ? 'text-gray-600' : diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {diff != null
                        ? `${diff > 0 ? '+' : ''}${['total_pnl','expectancy','avg_win','avg_loss','best_pnl','worst_pnl'].includes(m.key) ? fmtPnl(diff) : fmt(diff, 1)}`
                        : '—'
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => downloadCSV(COMPARE_METRICS.map(m => ({
                metric: m.label,
                [results.a.name]: m.fmt(results.a[m.key]),
                [results.b.name]: m.fmt(results.b[m.key]),
              })), 'comparison.csv')}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Analytics page ────────────────────────────────────────────────────────
export default function Analytics() {
  const { selectedAccountId } = useAccount()
  const [activeTab,   setActiveTab]   = useState('overview')
  const [dateRange,   setDateRange]   = useState({ from: null, to: null })
  const [comparing,   setComparing]   = useState(false)

  // apiParams includes both date range and account filter
  const apiParams = useMemo(() => ({
    ...dateRange,
    ...(selectedAccountId != null ? { account_id: selectedAccountId } : {}),
  }), [dateRange, selectedAccountId])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Deep dive into your trading performance</p>
        </div>
        <div className="flex items-center gap-3">
          <LocalDateFilter value={dateRange} onChange={setDateRange} />
          <button
            onClick={() => setComparing(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
              comparing
                ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            Compare
          </button>
        </div>
      </div>

      {/* Comparison panel */}
      {comparing && <ComparisonPanel onClose={() => setComparing(false)} />}

      {/* Tab nav */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            data-testid={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              activeTab === id
                ? 'tab-active'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview'   && <OverviewTab     dateRange={apiParams} />}
        {activeTab === 'time'       && <ByTimeTab        dateRange={apiParams} />}
        {activeTab === 'setup'      && <BySetupTab       dateRange={apiParams} />}
        {activeTab === 'instrument' && <ByInstrumentTab  dateRange={apiParams} />}
        {activeTab === 'tags'       && <ByTagsTab        dateRange={apiParams} />}
        {activeTab === 'custom'     && <CustomReportTab  dateRange={apiParams} />}
      </div>
    </div>
  )
}
