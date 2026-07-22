import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import {
  Plus, Calculator, TriangleAlert, Info, Trash2, CircleDollarSign, ChevronRight, PackagePlus,
} from 'lucide-react'
import { wheelApi } from '../api/wheel.js'
import Modal from '../components/ui/Modal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import WheelCalendar from '../components/wheel/WheelCalendar.jsx'
import { LEG_STATUS, legLabel } from '../components/wheel/constants.js'
import StrikeCalculator from '../components/wheel/StrikeCalculator.jsx'
import LegForm from '../components/wheel/LegForm.jsx'
import SeedPositionForm from '../components/wheel/SeedPositionForm.jsx'
import LegActions, { SellSharesModal } from '../components/wheel/LegActions.jsx'
import { valueAtExpiry } from '../lib/strikeCalc.js'

const money  = (v, d = 2) => (v == null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(Number(v)).toFixed(d)}`)
const signed = (v, d = 2) => (v == null ? '—' : `${Number(v) >= 0 ? '+' : '-'}$${Math.abs(Number(v)).toFixed(d)}`)
const todayStr = () => new Date().toISOString().slice(0, 10)

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'calendar',  label: 'Calendar' },
  { key: 'holdings',  label: 'Holdings' },
  { key: 'history',   label: 'History' },
]

export default function Wheel() {
  const [tab, setTab]       = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  const [dashboard, setDashboard] = useState(null)
  const [cycles, setCycles]       = useState([])
  const [history, setHistory]     = useState(null)

  const [month, setMonth]               = useState(new Date())
  const [calendarLegs, setCalendarLegs] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)

  const [showLogLeg, setShowLogLeg] = useState(false)
  const [showSeed, setShowSeed]     = useState(false)
  const [legPrefill, setLegPrefill] = useState(null)
  const [calcCycle, setCalcCycle]   = useState(null)
  const [sellCycle, setSellCycle]   = useState(null)
  const [confirm, setConfirm]       = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [d, c, h] = await Promise.all([
        wheelApi.dashboard({ days: 7 }),
        wheelApi.cycles(),
        wheelApi.history(),
      ])
      setDashboard(d); setCycles(c); setHistory(h)
    } catch (err) {
      setError(err?.message || 'Failed to load wheel data')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCalendar = useCallback(async (m) => {
    try {
      const legs = await wheelApi.calendar({
        start: format(startOfMonth(m), 'yyyy-MM-dd'),
        end:   format(endOfMonth(m),   'yyyy-MM-dd'),
      })
      setCalendarLegs(legs)
    } catch (err) {
      setError(err?.message || 'Failed to load the calendar')
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCalendar(month) }, [month, loadCalendar])

  const refresh = useCallback(() => { load(); loadCalendar(month) }, [load, loadCalendar, month])

  const activeCycles = useMemo(() => cycles.filter(c => c.status === 'active'), [cycles])

  if (loading) return <LoadingSpinner className="h-64" />

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Wheel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cash-secured puts → assignment → covered calls → called away, with the basis that makes the
            next strike choice honest.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowSeed(true)}
            title="Already hold assigned shares whose put was never logged here?"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            <PackagePlus className="w-4 h-4" /> Add assigned shares
          </button>
          <button
            type="button"
            onClick={() => { setLegPrefill(null); setShowLogLeg(true) }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Log wheel leg
          </button>
        </div>
      </div>

      {error && (
        <div className="flex gap-2 mb-5 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.key === 'dashboard' && dashboard?.needs_attention?.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500/20 text-orange-400">
                {dashboard.needs_attention.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab
          dashboard={dashboard}
          onRefresh={refresh}
          onCalc={setCalcCycle}
          cycles={activeCycles}
        />
      )}

      {tab === 'calendar' && (
        <CalendarTab
          month={month} setMonth={setMonth}
          legs={calendarLegs}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          onRefresh={refresh}
        />
      )}

      {tab === 'holdings' && (
        <HoldingsTab
          cycles={activeCycles}
          onCalc={setCalcCycle}
          onSell={setSellCycle}
          onRefresh={refresh}
          onLog={(prefill) => { setLegPrefill(prefill); setShowLogLeg(true) }}
          onDeleteCycle={(cycle) => setConfirm(cycle)}
        />
      )}

      {tab === 'history' && <HistoryTab history={history} />}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showLogLeg}
        onClose={() => { setShowLogLeg(false); setLegPrefill(null) }}
        title="Log wheel leg"
        size="md"
      >
        <LegForm
          prefill={legPrefill ?? {}}
          lockTicker={!!legPrefill?.ticker}
          snapshot={legPrefill?.snapshot}
          onSaved={() => { setShowLogLeg(false); setLegPrefill(null); refresh() }}
          onCancel={() => { setShowLogLeg(false); setLegPrefill(null) }}
        />
      </Modal>

      <Modal
        isOpen={showSeed}
        onClose={() => setShowSeed(false)}
        title="Add already-assigned shares"
        size="md"
      >
        <SeedPositionForm
          onSaved={() => { setShowSeed(false); setTab('holdings'); refresh() }}
          onCancel={() => setShowSeed(false)}
        />
      </Modal>

      <Modal
        isOpen={!!calcCycle}
        onClose={() => setCalcCycle(null)}
        title={`Strike selection — ${calcCycle?.ticker ?? ''}`}
        size="xl"
      >
        {calcCycle && (
          <StrikeCalculator
            ticker={calcCycle.ticker}
            basis={calcCycle.basis}
            shares={calcCycle.shares}
            onWrite={(candidate, snapshot) => {
              setCalcCycle(null)
              setLegPrefill({
                ticker: calcCycle.ticker,
                option_type: 'call',
                strike: candidate.strike,
                premium: candidate.premium,
                expiry: candidate.expiry,
                contracts: candidate.contracts,
                snapshot,
              })
              setShowLogLeg(true)
            }}
          />
        )}
      </Modal>

      <SellSharesModal
        open={!!sellCycle} cycle={sellCycle}
        onClose={() => setSellCycle(null)}
        onDone={refresh}
      />

      <ConfirmDialog
        isOpen={!!confirm}
        title="Delete this cycle?"
        message={`This permanently removes the ${confirm?.ticker ?? ''} cycle and all ${confirm?.legs?.length ?? 0} of its legs, including any booked P&L. It cannot be undone.`}
        confirmLabel="Delete cycle"
        onConfirm={async () => {
          try { await wheelApi.deleteCycle(confirm.id); setConfirm(null); refresh() }
          catch (err) { setError(err?.message || 'Failed to delete the cycle'); setConfirm(null) }
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────
function DashboardTab({ dashboard, onRefresh, onCalc, cycles }) {
  const attention = dashboard?.needs_attention ?? []
  const positions = dashboard?.positions ?? []

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Needs attention</h2>
          <span className="text-xs text-gray-600">
            open legs expiring within {dashboard?.window_days ?? 7} days, plus anything flagged
          </span>
        </div>

        {attention.length === 0 ? (
          <div className="px-4 py-6 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-500 text-center">
            Nothing expiring soon and nothing flagged.
          </div>
        ) : (
          <div className="space-y-2">
            {attention.map(leg => (
              <div
                key={leg.id}
                className={`px-4 py-3 rounded-xl border ${
                  leg.dte != null && leg.dte < 0
                    ? 'border-orange-500/40 bg-orange-500/5'
                    : 'border-gray-800 bg-gray-900'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white font-mono">{legLabel(leg)}</span>
                      <span className="text-xs text-gray-500">
                        {leg.contracts}× · exp {leg.expiry}
                      </span>
                      {leg.needs_roll && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/30">
                          flagged
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {leg.reasons.join(' · ')}
                      {leg.basis != null && <> · basis {money(leg.basis)}</>}
                      {' · '}credit {signed(leg.premium)}
                    </p>
                  </div>
                  <LegActions leg={leg} onDone={onRefresh} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Open positions</h2>
        {positions.length === 0 ? (
          <div className="px-4 py-6 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-500 text-center">
            No active cycles. Log a cash-secured put to start one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {positions.map(p => (
              <PositionCard
                key={p.id} cycle={p}
                onCalc={() => onCalc(cycles.find(c => c.id === p.id) ?? p)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PositionCard({ cycle, onCalc }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-white">{cycle.ticker}</span>
        <span className="text-xs text-gray-500">since {cycle.opened_at}</span>
      </div>

      <div className="grid grid-cols-2 gap-y-2 text-sm">
        <Stat label="Shares" value={cycle.shares || '—'} />
        <Stat label="Avg assigned" value={cycle.shares > 0 ? money(cycle.avg_assigned_strike) : '—'} />
        <Stat label="Net premium" value={signed(cycle.net_premium)} />
        <Stat
          label="Effective basis"
          value={cycle.basis == null ? 'not assigned' : money(cycle.basis)}
          accent={cycle.basis != null}
        />
      </div>

      {cycle.legs?.length > 0 && (
        <div className="pt-2 border-t border-gray-800 space-y-1">
          {cycle.legs.map(l => (
            <div key={l.id} className="flex items-center justify-between text-xs">
              <span className="font-mono text-gray-400">{legLabel(l)}</span>
              <span className="text-gray-600">
                exp {l.expiry}{l.needs_roll && <span className="text-orange-400 ml-1.5">flagged</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {cycle.shares > 0 && (
        <button
          type="button" onClick={onCalc}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
            text-indigo-300 hover:text-white border border-indigo-500/40 hover:bg-indigo-600
            hover:border-indigo-600 rounded-lg transition-all"
        >
          <Calculator className="w-3.5 h-3.5" /> Strike calculator
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`font-mono ${accent ? 'text-emerald-400 font-semibold' : 'text-gray-200'}`}>{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar
// ─────────────────────────────────────────────────────────────────────────────
function CalendarTab({ month, setMonth, legs, selectedDate, setSelectedDate, onRefresh }) {
  const dayLegs = legs.filter(l => l.expiry === selectedDate)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
      <WheelCalendar
        month={month} onMonthChange={setMonth}
        legs={legs} selectedDate={selectedDate}
        onDayClick={setSelectedDate}
        today={todayStr()}
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">
          {selectedDate ? `Expiring ${selectedDate}` : 'Pick a day'}
        </h3>

        {!selectedDate ? (
          <p className="text-sm text-gray-500">
            Click a day to see the legs expiring on it and mark their outcomes.
          </p>
        ) : dayLegs.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing expires on this day.</p>
        ) : (
          <div className="space-y-3">
            {dayLegs.map(leg => (
              <div key={leg.id} className="pb-3 border-b border-gray-800 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-mono font-semibold text-white">{legLabel(leg)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
                    LEG_STATUS[leg.leg_status]?.chip ?? LEG_STATUS.open.chip
                  }`}>
                    {LEG_STATUS[leg.leg_status]?.label ?? leg.leg_status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {leg.contracts} contract{leg.contracts === 1 ? '' : 's'} · credit {signed(leg.premium)}
                  {leg.close_cost > 0 && <> · bought back {money(leg.close_cost)}</>}
                </p>
                <LegActions leg={leg} onDone={onRefresh} />
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 pt-3 border-t border-gray-800 text-[11px] text-gray-600 leading-relaxed">
          The calendar is the reminder surface — there are no push or email notifications in this version,
          and no earnings-week overlay.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings
// ─────────────────────────────────────────────────────────────────────────────
function HoldingsTab({ cycles, onCalc, onSell, onRefresh, onLog, onDeleteCycle }) {
  if (cycles.length === 0) {
    return (
      <div className="px-4 py-8 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-500 text-center">
        No active cycles. A cycle starts when you sell the first cash-secured put on a ticker you're flat on.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cycles.map(cycle => (
        <div key={cycle.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-800">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="text-lg font-bold text-white">{cycle.ticker}</span>
              <Stat label="Shares" value={cycle.shares || '—'} />
              <Stat label="Avg assigned strike" value={cycle.shares > 0 ? money(cycle.avg_assigned_strike) : '—'} />
              <Stat label="Net premium" value={signed(cycle.net_premium)} />
              <Stat
                label="Effective basis (B)"
                value={cycle.basis == null ? 'not assigned' : money(cycle.basis)}
                accent={cycle.basis != null}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {cycle.shares > 0 && (
                <>
                  <button
                    type="button" onClick={() => onCalc(cycle)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300
                      hover:text-white border border-indigo-500/40 hover:bg-indigo-600 hover:border-indigo-600
                      rounded-lg transition-all"
                  >
                    <Calculator className="w-3.5 h-3.5" /> Strike calculator
                  </button>
                  <button
                    type="button"
                    onClick={() => onLog({ ticker: cycle.ticker, option_type: 'call', contracts: Math.floor(cycle.shares / 100) || 1 })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400
                      hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Covered call
                  </button>
                  <button
                    type="button" onClick={() => onSell(cycle)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400
                      hover:text-red-400 border border-gray-700 hover:border-red-500/40 rounded-lg transition-all"
                  >
                    <CircleDollarSign className="w-3.5 h-3.5" /> Sell shares
                  </button>
                </>
              )}
              <button
                type="button" onClick={() => onDeleteCycle(cycle)}
                title="Delete this cycle and all its legs"
                className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {cycle.basis != null && (
            <p className="px-5 py-2 text-[11px] text-gray-500 border-b border-gray-800 font-mono">
              B = {money(cycle.avg_assigned_strike)} − {money(cycle.net_premium)} / {cycle.shares} = {money(cycle.basis)}
              <span className="font-sans ml-2 text-gray-600">— write calls above this line</span>
            </p>
          )}

          <div className="px-5 py-3">
            {cycle.legs.length === 0 ? (
              <p className="text-sm text-gray-500">No legs on this cycle yet.</p>
            ) : (
              <div className="space-y-2">
                {cycle.legs.map(leg => (
                  <div key={leg.id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-gray-800/60 last:border-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono text-white">{legLabel(leg)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          LEG_STATUS[leg.leg_status]?.chip ?? LEG_STATUS.open.chip
                        }`}>
                          {LEG_STATUS[leg.leg_status]?.label ?? leg.leg_status}
                        </span>
                        {leg.rolled_from_id && (
                          <span className="text-[10px] text-cyan-400/70">rolled from #{leg.rolled_from_id}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        exp {leg.expiry} · {leg.contracts}× · credit {signed(leg.premium)}
                        {leg.close_cost > 0 && <> · bought back {money(leg.close_cost)} · net {signed(Number(leg.premium) - Number(leg.close_cost))}</>}
                      </p>
                    </div>
                    <LegActions leg={leg} onDone={onRefresh} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  const [expanded, setExpanded] = useState(null)

  const banked   = Number(history?.banked_premium ?? 0)
  const lifetime = Number(history?.lifetime_total ?? history?.total ?? 0)
  const excluded = Number(history?.excluded_premium ?? 0)

  if (!history || (history.cycles.length === 0 && !banked)) {
    return (
      <div className="px-4 py-8 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-500 text-center">
        No closed cycles yet. A cycle books its P&amp;L when you're flat on the ticker again.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SummaryCard label="Lifetime realised P&L" value={signed(lifetime)} big
          positive={lifetime >= 0} />
        <SummaryCard label="Banked in open cycles" value={signed(banked)} />
        <SummaryCard label="Closed cycles" value={history.cycles.length} />
        <SummaryCard label="Tickers wheeled" value={history.by_ticker.length} />
      </div>

      <div className="flex gap-2 px-4 py-3 bg-gray-800/40 border border-gray-700 rounded-lg text-xs text-gray-400 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
        <span>
          These totals blend option premium with share gains — the number the broker never shows in one
          place. Your main dashboard P&amp;L counts the <strong>option premium only</strong>; the two differ
          by the share component shown below.
          {banked !== 0 && (
            <> <strong>{signed(banked)}</strong> of this is premium already settled on legs inside cycles
            that are still running, so it has no share P&amp;L against it yet.
            {excluded === 0 && <> Lifetime realised here matches the Playbook&apos;s{' '}
            <strong>Wheel Play</strong> total.</>}</>
          )}
          {excluded !== 0 && (
            <> <strong>{signed(excluded)}</strong> of the premium above sits on assignments you marked
            as already logged in your Trade Log, so the journal books it against that original trade
            instead. That is why this figure runs {signed(excluded)} ahead of the Playbook&apos;s{' '}
            <strong>Wheel Play</strong> total — the credit is counted once, not twice.</>
          )}
        </span>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Per ticker</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 border-b border-gray-800">
                <th className="text-left  font-medium px-4 py-2.5">Ticker</th>
                <th className="text-right font-medium px-4 py-2.5">Cycles</th>
                <th className="text-right font-medium px-4 py-2.5">Premium</th>
                <th className="text-right font-medium px-4 py-2.5">Share P&amp;L</th>
                <th className="text-right font-medium px-4 py-2.5" title="Premium settled on legs inside a cycle that is still running">
                  Banked (open)
                </th>
                <th className="text-right font-medium px-4 py-2.5">Lifetime</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {history.by_ticker.map(t => {
                const tickerBanked = Number(t.banked_premium ?? 0)
                const tickerTotal  = Number(t.realized_pnl) + tickerBanked
                return (
                  <tr key={t.ticker} className="border-b border-gray-800/60 last:border-0">
                    <td className="px-4 py-2.5 font-sans font-medium text-white">{t.ticker}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{t.cycles}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{signed(t.gross_premium)}</td>
                    <td className={`px-4 py-2.5 text-right ${t.share_pnl >= 0 ? 'text-gray-300' : 'text-red-400'}`}>
                      {signed(t.share_pnl)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {tickerBanked ? signed(tickerBanked) : <span className="text-gray-700">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${tickerTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {signed(tickerTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Closed cycles</h2>
        <div className="space-y-2">
          {history.cycles.map(cycle => (
            <div key={cycle.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(expanded === cycle.id ? null : cycle.id)}
                className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-gray-800/40 transition-colors"
              >
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="text-sm font-bold text-white">{cycle.ticker}</span>
                  <span className="text-xs text-gray-500">
                    {cycle.opened_at} → {cycle.closed_at ?? '—'}
                  </span>
                  {cycle.close_reason && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 border border-gray-700">
                      {cycle.close_reason === 'called_away' ? 'called away' : 'sold'}
                      {cycle.exit_price != null && ` @ ${money(cycle.exit_price)}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-5">
                  <span className="text-xs text-gray-500 font-mono">
                    premium {signed(cycle.gross_premium)} · shares {signed(cycle.share_pnl)}
                  </span>
                  <span className={`text-sm font-mono font-bold ${
                    cycle.realized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {signed(cycle.realized_pnl)}
                  </span>
                  <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${
                    expanded === cycle.id ? 'rotate-90' : ''
                  }`} />
                </div>
              </button>

              {expanded === cycle.id && (
                <div className="px-5 py-4 border-t border-gray-800 space-y-4">
                  <div className="space-y-1.5">
                    {cycle.legs.map(l => (
                      <div key={l.id} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-gray-300">{legLabel(l)}</span>
                        <span className="text-gray-500">
                          exp {l.expiry} · {LEG_STATUS[l.leg_status]?.label ?? l.leg_status} ·{' '}
                          {signed(Number(l.premium) - Number(l.close_cost ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {cycle.snapshots.map(s => (
                    <Retrospective key={s.leg_id} snapshot={s.snapshot} exitPrice={cycle.exit_price} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Retrospective on a recorded strike decision (spec §9.11).
 *
 * Not there to induce regret over near-EV-neutral choices — a single comparison
 * means nothing. It exists so that systematic bias becomes visible across many
 * cycles: consistently taking premium when the higher strike would have paid, or
 * the reverse.
 */
function Retrospective({ snapshot, exitPrice }) {
  if (!snapshot?.candidates?.length || exitPrice == null) return null

  const scored = snapshot.candidates.map(c => ({
    ...c,
    value: valueAtExpiry(Number(exitPrice), Number(c.strike), Number(c.premium)),
    chosen: Number(c.strike) === Number(snapshot.chosen),
  }))
  const best = scored.reduce((a, b) => (b.value > a.value ? b : a))
  const chosen = scored.find(c => c.chosen)
  const gap = chosen ? best.value - chosen.value : null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
      <div className="text-[11px] text-gray-400 font-medium mb-2">
        Strike decision, in hindsight — settled at {money(exitPrice)}
      </div>
      <div className="space-y-1">
        {scored.map(c => (
          <div key={c.strike} className="flex items-center justify-between text-xs font-mono">
            <span className={c.chosen ? 'text-white' : 'text-gray-500'}>
              ${Number(c.strike).toFixed(2)} @ {money(c.premium)}
              {c.chosen && <span className="ml-2 text-[10px] font-sans text-indigo-400">chosen</span>}
            </span>
            <span className={c.strike === best.strike ? 'text-emerald-400' : 'text-gray-500'}>
              {money(c.value)}/sh
            </span>
          </div>
        ))}
      </div>
      {gap != null && (
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          {gap === 0
            ? 'You picked the strike that paid best here.'
            : `The ${money(best.strike)} strike would have paid ${money(gap)}/share more. One cycle proves nothing — watch whether this leans the same way over many.`}
        </p>
      )}
    </div>
  )
}

function SummaryCard({ label, value, big, positive }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
      <div className="text-[11px] text-gray-500 mb-1">{label}</div>
      <div className={`font-mono font-bold ${big ? 'text-2xl' : 'text-xl'} ${
        big ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-white'
      }`}>
        {value}
      </div>
    </div>
  )
}
