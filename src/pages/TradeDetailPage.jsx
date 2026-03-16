import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2, ZoomIn, Plus, X } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { tradesApi } from '../api/trades.js'
import Badge, { DirectionBadge, StatusBadge } from '../components/ui/Badge.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n, decimals = 2) {
  if (n == null) return '—'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(decimals)
}

function fmtPct(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function fmtR(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + 'R'
}

function fmtPrice(n) {
  if (n == null) return '—'
  return '$' + Number(n).toFixed(2)
}

function pnlColor(v) {
  if (v == null) return 'text-gray-400'
  return v >= 0 ? 'text-emerald-400' : 'text-red-400'
}

function calcPnlFrontend(direction, entry, exit, size, fees = 0, stop = null) {
  if (!exit) return null
  const mult = direction === 'long' ? 1 : -1
  const pnl = mult * (exit - entry) * size - fees
  const pct = (pnl / (entry * size)) * 100
  let r = null
  if (stop != null) {
    const risk = Math.abs(entry - stop) * size
    if (risk > 0) r = pnl / risk
  }
  return { pnl, pct, r }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children, action }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-glow">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function MetricItem({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-bold font-mono ${valueClass}`}>{value ?? '—'}</span>
    </div>
  )
}

// ── Stars display ─────────────────────────────────────────────────────────────
function Stars({ value, max = 5 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <svg key={i} className={`w-4 h-4 ${i < (value ?? 0) ? 'text-amber-400' : 'text-gray-700'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <img src={src} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" alt="screenshot" />
      <button className="absolute top-4 right-4 text-gray-400 hover:text-white"
        onClick={onClose}>
        <X className="w-8 h-8" />
      </button>
    </div>
  )
}

// ── MFE/MAE bar ───────────────────────────────────────────────────────────────
function ExcursionBar({ trade }) {
  const { direction, entry_price, exit_price, mfe, mae } = trade
  if (!exit_price) return <p className="text-sm text-gray-600 italic">Trade is still open</p>
  if (!mfe && !mae) return <p className="text-sm text-gray-600 italic">MFE/MAE not recorded. Edit trade to add values.</p>

  const mult = direction === 'long' ? 1 : -1
  const maePrice = mae ?? entry_price
  const mfePrice = mfe ?? entry_price

  // Normalize all to dollar moves from entry
  const maeMove  = mult * (maePrice - entry_price)   // should be negative for adverse
  const entryMove = 0
  const exitMove  = mult * (exit_price - entry_price)
  const mfeMove   = mult * (mfePrice - entry_price)    // should be positive for favorable

  const all = [maeMove, entryMove, exitMove, mfeMove]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1

  const toPos = (v) => ((v - min) / range) * 100

  const maePos    = toPos(maeMove)
  const entryPos  = toPos(entryMove)
  const exitPos   = toPos(exitMove)
  const mfePos    = toPos(mfeMove)

  const posSize = trade.position_size
  const maeDollar = maeMove * posSize
  const mfeDollar = mfeMove * posSize
  const exitDollar = exitMove * posSize - (trade.fees ?? 0)

  const exitEff = mfeDollar > 0 ? (exitDollar / mfeDollar) * 100 : null

  return (
    <div className="space-y-4">
      {/* Bar */}
      <div className="relative h-10 mx-4">
        {/* Track */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-2 bg-gray-800 rounded-full" />
        </div>
        {/* Filled zone: entry to exit */}
        <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
          style={{
            left: `${Math.min(entryPos, exitPos)}%`,
            width: `${Math.abs(exitPos - entryPos)}%`,
            backgroundColor: exitDollar >= 0 ? '#10b981' : '#ef4444',
          }}
        />
        {/* MAE marker */}
        {mae != null && (
          <div className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${maePos}%`, transform: 'translateX(-50%)' }}>
            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-gray-900 mt-3.5" />
            <span className="text-xs text-red-400 mt-0.5 whitespace-nowrap">MAE</span>
          </div>
        )}
        {/* Entry marker */}
        <div className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${entryPos}%`, transform: 'translateX(-50%)' }}>
          <div className="w-3 h-3 rounded-full bg-gray-300 border-2 border-gray-900 mt-3.5" />
          <span className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">Entry</span>
        </div>
        {/* Exit marker */}
        <div className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${exitPos}%`, transform: 'translateX(-50%)' }}>
          <div className={`w-3 h-3 rounded-full border-2 border-gray-900 mt-3.5 ${exitDollar >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">Exit</span>
        </div>
        {/* MFE marker */}
        {mfe != null && (
          <div className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${mfePos}%`, transform: 'translateX(-50%)' }}>
            <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-gray-900 mt-3.5" />
            <span className="text-xs text-emerald-400 mt-0.5 whitespace-nowrap">MFE</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        {mae != null && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Max Adverse (MAE)</div>
            <div className="text-sm font-mono text-red-400 font-semibold">{fmtPrice(mae)}</div>
            <div className="text-xs text-red-400/70 font-mono">{fmt$(maeDollar)}</div>
          </div>
        )}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Actual P&L</div>
          <div className={`text-sm font-mono font-semibold ${pnlColor(trade.pnl)}`}>{fmt$(trade.pnl)}</div>
          {exitEff != null && (
            <div className="text-xs text-gray-500 mt-1">
              {exitEff.toFixed(0)}% of MFE captured
            </div>
          )}
        </div>
        {mfe != null && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Max Favorable (MFE)</div>
            <div className="text-sm font-mono text-emerald-400 font-semibold">{fmtPrice(mfe)}</div>
            <div className="text-xs text-emerald-400/70 font-mono">{fmt$(mfeDollar)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Simple price visual (no OHLC) ─────────────────────────────────────────────
function PriceVisual({ trade }) {
  const { direction, entry_price, exit_price, stop_loss, mfe, mae } = trade
  if (!exit_price) {
    return (
      <div className="flex items-center gap-6 py-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Entry</div>
          <div className="text-xl font-mono font-bold text-white">{fmtPrice(entry_price)}</div>
        </div>
        {stop_loss && (
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">Stop Loss</div>
            <div className="text-lg font-mono text-red-400">{fmtPrice(stop_loss)}</div>
          </div>
        )}
        <div className="flex items-center gap-2 text-blue-400 text-sm italic">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Trade open
        </div>
      </div>
    )
  }

  const mult = direction === 'long' ? 1 : -1
  const prices = [
    stop_loss, mae, entry_price, exit_price, mfe,
  ].filter(p => p != null)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const range = maxP - minP || 1
  const toY = (p) => 100 - ((p - minP) / range) * 85 - 7.5  // 7.5% padding

  const profitable = mult * (exit_price - entry_price) > 0

  const svgPoints = [entry_price, exit_price]
  const lineY1 = toY(entry_price)
  const lineY2 = toY(exit_price)

  return (
    <div className="space-y-2">
      <svg viewBox="0 0 300 120" className="w-full h-36" preserveAspectRatio="none">
        {/* Background zones */}
        {stop_loss && (
          <rect x="0" y={`${toY(stop_loss)}%`} width="300" height={`${100 - toY(stop_loss)}%`}
            fill="#ef444408" />
        )}
        {/* Entry to Exit line */}
        <line x1="80" y1={`${lineY1}%`} x2="220" y2={`${lineY2}%`}
          stroke={profitable ? '#10b981' : '#ef4444'} strokeWidth="2"
          strokeDasharray={profitable ? '0' : '6 3'} />
        {/* Stop Loss horizontal */}
        {stop_loss && (
          <>
            <line x1="0" y1={`${toY(stop_loss)}%`} x2="300" y2={`${toY(stop_loss)}%`}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
            <text x="4" y={`${toY(stop_loss) - 1}%`} fill="#ef4444" fontSize="8" opacity="0.7">SL {fmtPrice(stop_loss)}</text>
          </>
        )}
        {/* MFE horizontal */}
        {mfe && (
          <>
            <line x1="0" y1={`${toY(mfe)}%`} x2="300" y2={`${toY(mfe)}%`}
              stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
            <text x="4" y={`${toY(mfe) - 1}%`} fill="#10b981" fontSize="8" opacity="0.7">MFE {fmtPrice(mfe)}</text>
          </>
        )}
        {/* Entry dot */}
        <circle cx="80" cy={`${lineY1}%`} r="5" fill="#e5e7eb" />
        <text x="80" y={`${lineY1 - 4}%`} fill="#e5e7eb" fontSize="8" textAnchor="middle">{fmtPrice(entry_price)}</text>
        {/* Exit dot */}
        <circle cx="220" cy={`${lineY2}%`} r="5" fill={profitable ? '#10b981' : '#ef4444'} />
        <text x="220" y={`${lineY2 + 10}%`} fill={profitable ? '#10b981' : '#ef4444'} fontSize="8" textAnchor="middle">{fmtPrice(exit_price)}</text>
      </svg>
      <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block"/>Entry</span>
        <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full inline-block ${profitable ? 'bg-emerald-400' : 'bg-red-400'}`}/>Exit</span>
        {stop_loss && <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-red-500 inline-block"/>Stop</span>}
        {mfe && <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-emerald-500 inline-block"/>MFE</span>}
      </div>
    </div>
  )
}

// ── What-If Simulator ─────────────────────────────────────────────────────────
function WhatIfSimulator({ trade }) {
  const [altExit,  setAltExit]  = useState(trade.exit_price ?? '')
  const [altStop,  setAltStop]  = useState(trade.stop_loss ?? '')
  const [altSize,  setAltSize]  = useState(trade.position_size)
  const [altFees,  setAltFees]  = useState(trade.fees ?? 0)

  const actual = calcPnlFrontend(trade.direction, trade.entry_price, trade.exit_price,
    trade.position_size, trade.fees ?? 0, trade.stop_loss)

  const simulated = calcPnlFrontend(
    trade.direction,
    trade.entry_price,
    altExit ? Number(altExit) : null,
    Number(altSize) || trade.position_size,
    Number(altFees) || 0,
    altStop ? Number(altStop) : null,
  )

  const diff = simulated && actual ? simulated.pnl - actual.pnl : null

  const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
    text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Alt. Exit Price</label>
          <input type="number" step="0.01" value={altExit} onChange={e => setAltExit(e.target.value)}
            placeholder={fmtPrice(trade.exit_price)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Alt. Stop Loss</label>
          <input type="number" step="0.01" value={altStop} onChange={e => setAltStop(e.target.value)}
            placeholder={fmtPrice(trade.stop_loss)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Alt. Position Size</label>
          <input type="number" step="1" value={altSize} onChange={e => setAltSize(e.target.value)}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Alt. Fees</label>
          <input type="number" step="0.01" value={altFees} onChange={e => setAltFees(e.target.value)}
            className={inputCls} />
        </div>
      </div>

      {simulated && (
        <div className="grid grid-cols-3 gap-4">
          {/* Actual */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-2 font-medium">Actual</div>
            <div className={`text-xl font-bold font-mono ${pnlColor(actual?.pnl)}`}>{fmt$(actual?.pnl)}</div>
            <div className={`text-xs font-mono mt-0.5 ${pnlColor(actual?.pct)}`}>{fmtPct(actual?.pct)}</div>
            {actual?.r != null && <div className={`text-xs font-mono mt-0.5 ${pnlColor(actual.r)}`}>{fmtR(actual.r)}</div>}
          </div>
          {/* Simulated */}
          <div className={`rounded-lg p-4 border ${simulated.pnl >= 0 ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-red-500/5 border-red-500/30'}`}>
            <div className="text-xs text-gray-500 mb-2 font-medium">Simulated</div>
            <div className={`text-xl font-bold font-mono ${pnlColor(simulated.pnl)}`}>{fmt$(simulated.pnl)}</div>
            <div className={`text-xs font-mono mt-0.5 ${pnlColor(simulated.pct)}`}>{fmtPct(simulated.pct)}</div>
            {simulated.r != null && <div className={`text-xs font-mono mt-0.5 ${pnlColor(simulated.r)}`}>{fmtR(simulated.r)}</div>}
          </div>
          {/* Difference */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-2 font-medium">Difference</div>
            <div className={`text-xl font-bold font-mono ${pnlColor(diff)}`}>{fmt$(diff)}</div>
            <div className="text-xs text-gray-600 mt-1">vs actual result</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Execution Table ───────────────────────────────────────────────────────────
function ExecutionTable({ trade, executions }) {
  // If no custom executions, synthesize from main trade fields
  const rows = executions.length > 0 ? executions : [
    {
      id: 'entry-synthetic',
      type: 'entry',
      price: trade.entry_price,
      quantity: trade.position_size,
      fees: 0,
      executed_at: trade.date,
      notes: null,
    },
    ...(trade.exit_price ? [{
      id: 'exit-synthetic',
      type: 'exit',
      price: trade.exit_price,
      quantity: trade.position_size,
      fees: trade.fees ?? 0,
      executed_at: trade.exit_date ?? trade.date,
      notes: null,
    }] : []),
  ]

  let runningAvgEntry = null
  let remainingSize = 0

  const rowsWithPnl = rows.map(row => {
    if (row.type === 'entry') {
      if (runningAvgEntry == null) {
        runningAvgEntry = row.price
        remainingSize = row.quantity
      } else {
        const totalCost = runningAvgEntry * remainingSize + row.price * row.quantity
        remainingSize += row.quantity
        runningAvgEntry = totalCost / remainingSize
      }
      return { ...row, leg_pnl: null }
    } else {
      const mult = trade.direction === 'long' ? 1 : -1
      const legPnl = runningAvgEntry != null
        ? mult * (row.price - runningAvgEntry) * row.quantity - (row.fees ?? 0)
        : null
      remainingSize -= row.quantity
      return { ...row, leg_pnl: legPnl }
    }
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {['Type', 'Date', 'Price', 'Qty', 'Fees', 'Leg P&L', 'Notes'].map(h => (
              <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {rowsWithPnl.map(row => (
            <tr key={row.id} className="hover:bg-gray-800/30">
              <td className="px-3 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide
                  ${row.type === 'entry' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                  {row.type}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-400 text-xs font-mono">{row.executed_at}</td>
              <td className="px-3 py-2.5 text-gray-200 font-mono text-xs">{fmtPrice(row.price)}</td>
              <td className="px-3 py-2.5 text-gray-300">{row.quantity}</td>
              <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{row.fees ? `$${Number(row.fees).toFixed(2)}` : '—'}</td>
              <td className="px-3 py-2.5">
                {row.leg_pnl != null
                  ? <span className={`font-mono text-xs font-semibold ${pnlColor(row.leg_pnl)}`}>{fmt$(row.leg_pnl)}</span>
                  : <span className="text-gray-600">—</span>
                }
              </td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{row.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TradeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [trade,      setTrade]      = useState(null)
  const [executions, setExecutions] = useState([])
  const [linked,     setLinked]     = useState([])
  const [neighbors,  setNeighbors]  = useState({ prev: null, next: null })
  const [loading,    setLoading]    = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [lightbox,   setLightbox]   = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      tradesApi.get(id),
      tradesApi.executions(id),
      tradesApi.journal(id),
      tradesApi.neighbors(id),
    ]).then(([t, execs, journal, nb]) => {
      setTrade(t)
      setExecutions(execs)
      setLinked(journal)
      setNeighbors(nb)
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    await tradesApi.delete(id)
    navigate('/trades')
  }

  if (loading) return <LoadingSpinner className="h-64" />
  if (!trade)  return <div className="text-gray-500 py-16 text-center">Trade not found</div>

  const holdDays = trade.exit_date
    ? differenceInCalendarDays(parseISO(trade.exit_date), parseISO(trade.date))
    : trade.exit_price
      ? differenceInCalendarDays(new Date(), parseISO(trade.date))
      : null

  const riskPerUnit = trade.stop_loss != null ? Math.abs(trade.entry_price - trade.stop_loss) : null
  const riskTotal   = riskPerUnit != null ? riskPerUnit * trade.position_size : null
  const rewardPerUnit = trade.exit_price != null ? Math.abs(trade.exit_price - trade.entry_price) : null
  const rrRatio = riskPerUnit && rewardPerUnit ? (rewardPerUnit / riskPerUnit).toFixed(2) : null
  const positionValue = trade.entry_price * trade.position_size

  const emotions  = trade.emotions  ? JSON.parse(trade.emotions)  : []
  const mistakes  = trade.mistakes  ? JSON.parse(trade.mistakes)  : []

  const moodColors = { great: '#10b981', good: '#6ee7b7', neutral: '#9ca3af', bad: '#f97316', terrible: '#ef4444' }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* ── Navigation bar ── */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/trades')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Trade Log
        </button>
        <div className="flex items-center gap-2">
          <button
            disabled={!neighbors.prev}
            onClick={() => navigate(`/trades/${neighbors.prev}`)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-300"
          >
            ← Prev
          </button>
          <button
            disabled={!neighbors.next}
            onClick={() => navigate(`/trades/${neighbors.next}`)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-300"
          >
            Next →
          </button>
        </div>
      </div>

      {/* ── Trade Summary Header ── */}
      <div className={`rounded-xl border p-6 card-glow ${trade.pnl >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : trade.pnl != null ? 'border-red-500/30 bg-red-500/5' : 'border-gray-800 bg-gray-900'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: ticker + meta */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-white tracking-tight">{trade.ticker}</h1>
              <DirectionBadge direction={trade.direction} />
              <StatusBadge status={trade.status} />
              {trade.timeframe && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">{trade.timeframe}</span>
              )}
              {trade.setup && (
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{trade.setup}</span>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-400 flex-wrap">
              <span>{format(parseISO(trade.date), 'MMMM d, yyyy')}</span>
              {trade.exit_date && trade.exit_date !== trade.date && (
                <span>→ {format(parseISO(trade.exit_date), 'MMMM d, yyyy')}</span>
              )}
              {holdDays != null && (
                <span className="text-gray-500">{holdDays === 0 ? 'Same day' : `${holdDays}d hold`}</span>
              )}
              {trade.strategy_name && (
                <span className="text-indigo-400">{trade.strategy_name}</span>
              )}
            </div>

            {/* Tags */}
            {trade.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {trade.tags.map(tag => (
                  <Badge key={tag.id} color={tag.color}>{tag.name}</Badge>
                ))}
              </div>
            )}

            {/* Confidence */}
            {trade.confidence != null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Confidence</span>
                <Stars value={trade.confidence} />
              </div>
            )}
          </div>

          {/* Right: P&L + actions */}
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <div className={`text-4xl font-bold font-mono ${pnlColor(trade.pnl)}`}>
                {trade.pnl != null ? (trade.pnl >= 0 ? '+' : '') + '$' + Math.abs(trade.pnl).toFixed(2) : '—'}
              </div>
              <div className="flex items-center justify-end gap-3 mt-1">
                {trade.pnl_percent != null && (
                  <span className={`font-mono text-sm ${pnlColor(trade.pnl_percent)}`}>{fmtPct(trade.pnl_percent)}</span>
                )}
                {trade.r_multiple != null && (
                  <span className={`font-mono text-sm ${pnlColor(trade.r_multiple)}`}>{fmtR(trade.r_multiple)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/trades/${id}/edit`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="mt-5 pt-4 border-t border-gray-700/50 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricItem label="Entry" value={fmtPrice(trade.entry_price)} />
          <MetricItem label="Exit" value={fmtPrice(trade.exit_price)} />
          {trade.stop_loss != null && <MetricItem label="Stop Loss" value={fmtPrice(trade.stop_loss)} valueClass="text-red-400" />}
          <MetricItem label="Position Size" value={trade.position_size} />
          <MetricItem label="Position Value" value={`$${positionValue.toFixed(0)}`} />
          {trade.fees > 0 && <MetricItem label="Fees" value={`$${trade.fees.toFixed(2)}`} valueClass="text-gray-400" />}
          {riskTotal != null && <MetricItem label="Risk ($)" value={`$${riskTotal.toFixed(2)}`} valueClass="text-red-400" />}
          {rrRatio != null && <MetricItem label="R:R Ratio" value={`${rrRatio}:1`} valueClass={trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />}
          {holdDays != null && <MetricItem label="Hold Duration" value={holdDays === 0 ? 'Intraday' : `${holdDays}d`} />}
        </div>
      </div>

      {/* ── Two column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Price Visual / Chart ── */}
        <Section title="Price Visualization">
          <PriceVisual trade={trade} />
        </Section>

        {/* ── Executions ── */}
        <Section title="Executions">
          <ExecutionTable trade={trade} executions={executions} />
        </Section>
      </div>

      {/* ── MFE / MAE ── */}
      <Section title="Excursion Analysis — MFE / MAE">
        <ExcursionBar trade={trade} />
      </Section>

      {/* ── What-If Simulator ── */}
      <Section title="What-If Simulator">
        <WhatIfSimulator trade={trade} />
      </Section>

      {/* ── Psychology ── */}
      {(emotions.length > 0 || mistakes.length > 0 || trade.confidence != null) && (
        <Section title="Psychology">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {trade.confidence != null && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Confidence</div>
                <Stars value={trade.confidence} />
                <div className="text-xs text-gray-600 mt-1">{trade.confidence} / 5</div>
              </div>
            )}
            {emotions.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Emotions</div>
                <div className="flex flex-wrap gap-1.5">
                  {emotions.map(e => (
                    <span key={e} className="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20">{e}</span>
                  ))}
                </div>
              </div>
            )}
            {mistakes.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Mistakes</div>
                <div className="flex flex-wrap gap-1.5">
                  {mistakes.map(m => (
                    <span key={m} className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Notes & Screenshots ── */}
      {(trade.notes || trade.screenshot_path) && (
        <Section title="Notes & Screenshots">
          <div className="space-y-4">
            {trade.notes && (
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-800/40 rounded-lg p-4 border border-gray-800">
                {trade.notes}
              </div>
            )}
            {trade.screenshot_path && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Screenshots</div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setLightbox(trade.screenshot_path)}
                    className="relative group rounded-lg overflow-hidden border border-gray-700 hover:border-indigo-500 transition-colors"
                  >
                    <img
                      src={trade.screenshot_path}
                      alt="Trade screenshot"
                      className="w-48 h-32 object-cover"
                      onError={e => { e.target.parentElement.style.display = 'none' }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white" />
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Linked Journal Entries ── */}
      <Section
        title="Linked Journal Entries"
        action={
          <button
            onClick={() => navigate(`/journal?trade_id=${id}`)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            New Entry
          </button>
        }
      >
        {linked.length === 0 ? (
          <p className="text-sm text-gray-600 italic">No journal entries linked to this trade.</p>
        ) : (
          <div className="space-y-2">
            {linked.map(entry => (
              <button
                key={entry.id}
                onClick={() => navigate(`/journal?entry=${entry.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors text-left"
              >
                {entry.mood && (
                  <span className="text-sm" style={{ color: moodColors[entry.mood] }}>●</span>
                )}
                <span className="text-sm font-medium text-gray-300">{entry.title || 'Journal Entry'}</span>
                <span className="text-xs text-gray-600 ml-auto">{entry.date}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete Trade"
        message="This will permanently remove this trade and all associated data. This cannot be undone."
        confirmLabel="Delete Trade"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* ── Lightbox ── */}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
