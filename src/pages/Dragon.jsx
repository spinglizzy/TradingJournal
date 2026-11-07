import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, CalendarPlus, TriangleAlert, Trash2, Upload, Scale, FileText } from 'lucide-react'
import { dragonApi } from '../api/dragon.js'
import { replay, incomeByMonth, cashTotals, auFY, fyLabel, SHARES_PER_CONTRACT } from '../../server/lib/dragonEngine.js'
import Modal from '../components/ui/Modal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import TxForm from '../components/dragon/TxForm.jsx'
import DcaForm from '../components/dragon/DcaForm.jsx'
import HoldingDetail, { QuickActions } from '../components/dragon/HoldingDetail.jsx'
import ImportModal from '../components/dragon/ImportModal.jsx'
import Reconcile from '../components/dragon/Reconcile.jsx'
import TaxReport from '../components/dragon/TaxReport.jsx'
import { Field, ErrorBox, SummaryCard } from '../components/dragon/ui.jsx'
import { inputCls, btnPrimary, btnGhost, money, signed, pct, fmtShares, tone, todayStr, TYPE_LABEL } from '../components/dragon/format.js'

const btnHeader = 'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors'

export default function Dragon() {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [txForm, setTxForm]   = useState(null)   // { holding, type, tx? }
  const [showAdd, setShowAdd] = useState(false)
  const [showDca, setShowDca] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [panel, setPanel]     = useState(null)   // 'import' | 'reconcile' | 'tax'
  const [notice, setNotice]   = useState(null)

  const load = useCallback(() => dragonApi.all().then(
    d => { setData(d); setError(null) },
    err => setError(err?.message || 'Failed to load Dragon'),
  ), [])
  useEffect(() => { load() }, [load])

  // Everything below is derived from the ledger on every load — nothing is stored.
  const rows = useMemo(() => {
    if (!data) return []
    return data.holdings.map(h => {
      const ledger = data.transactions.filter(t => t.holding_id === h.id)
      let state, bad = null
      try { state = replay(ledger) } catch (e) { bad = e.message; state = replay([]) }
      const mv = h.current_price != null ? state.shares * h.current_price : null
      return { h, ledger, state, bad, mv, unreal: mv != null ? mv - state.totalCost : null }
    })
  }, [data])

  const totals = useMemo(() => {
    const year = String(new Date().getFullYear())
    const fy = auFY(todayStr())
    const income = rows.flatMap(r => r.state.events)
    const ytd = income.filter(i => i.date.startsWith(year))
    const cash = cashTotals(data?.transactions ?? [])
    const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0)
    const priced = rows.filter(r => r.mv != null)
    const pricedCost = sum(priced, r => r.state.totalCost)
    const unreal = sum(priced, r => r.unreal)
    return {
      mv: sum(rows, r => r.mv),
      cash: sum(rows, r => r.state.cashInvested),
      cost: sum(rows, r => r.state.totalCost),
      unreal, unrealPct: pricedCost > 0 ? unreal / pricedCost : null,
      unpriced: rows.filter(r => r.mv == null && r.state.shares > 0).length,
      div: sum(income, i => i.dividend), divYtd: sum(ytd, i => i.dividend),
      cc: sum(income, i => i.cc), ccYtd: sum(ytd, i => i.cc),
      realized: sum(rows, r => r.state.realized),
      fees: sum(income, i => i.fees), feesFy: sum(income.filter(i => auFY(i.date) === fy), i => i.fees), fy,
      netCash: cash.net, cashIn: cash.cashIn, cashOut: cash.cashOut,
      monthly: incomeByMonth(income),
    }
  }, [rows, data])

  const detail = rows.find(r => r.h.id === detailId)
  const saved = () => { setTxForm(null); setShowDca(false); load() }
  const openAction = (h, type) => setTxForm({ holding: h, type })
  const txState = txForm && rows.find(r => r.h.id === txForm.holding.id)

  async function runConfirm() {
    try { await confirm.run(); setConfirm(null); load() }
    catch (err) { setConfirm(null); setError(err?.message || 'Delete failed') }
  }

  if (!data && !error) return <LoadingSpinner className="h-64" />

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dragon</h1>
          <p className="text-sm text-gray-500 mt-1">
            Long-term dividend portfolio. Every figure is replayed from the ledger: dividends, DRIP and covered-call premium all pull the adjusted basis down.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPanel('import')} className={`${btnHeader} text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700`}>
            <Upload className="w-4 h-4" /> Import Schwab CSV
          </button>
          <button type="button" disabled={!rows.length} onClick={() => setPanel('reconcile')} className={`${btnHeader} text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40`}>
            <Scale className="w-4 h-4" /> Reconcile
          </button>
          <button type="button" disabled={!rows.length} onClick={() => setPanel('tax')} className={`${btnHeader} text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40`}>
            <FileText className="w-4 h-4" /> Tax year
          </button>
          <button type="button" disabled={!rows.length} onClick={() => setShowDca(true)}
            className={`${btnHeader} text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40`}>
            <CalendarPlus className="w-4 h-4" /> Monthly DCA
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className={`${btnHeader} text-white bg-indigo-600 hover:bg-indigo-700`}>
            <Plus className="w-4 h-4" /> Add holding
          </button>
        </div>
      </div>

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}
      {notice && (
        <div className="mb-5 px-4 py-3 bg-emerald-900/20 border border-emerald-800/40 rounded-lg text-sm text-emerald-400 flex justify-between gap-3">
          {notice}<button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-300">Dismiss</button>
        </div>
      )}

      {/* ── Totals ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <SummaryCard label="Market value" value={money(totals.mv)}
          sub={totals.unpriced ? `${totals.unpriced} holding(s) have no price` : undefined} />
        <SummaryCard label="Cash invested" value={money(totals.cash)} sub="Buys only, DRIP excluded" />
        <SummaryCard label="Adjusted cost" value={money(totals.cost)} />
        <SummaryCard label="Unrealised P/L" value={signed(totals.unreal)} sub={pct(totals.unrealPct)} valueCls={tone(totals.unreal)} />
        <SummaryCard label="Dividends earned" value={money(totals.div)} sub={`${money(totals.divYtd)} this year`} />
        <SummaryCard label="Net CC premium" value={signed(totals.cc)} sub={`${signed(totals.ccYtd)} this year`} valueCls={tone(totals.cc)} />
        <SummaryCard label="Realised P/L" value={signed(totals.realized)} valueCls={tone(totals.realized)} />
        <SummaryCard label="Fees paid" value={money(totals.fees)} sub={`${money(totals.feesFy)} in ${fyLabel(totals.fy)}`} />
        <SummaryCard label="Net cash contributed" value={money(totals.netCash)} sub={`in ${money(totals.cashIn)} · out ${money(totals.cashOut)}`} />
      </div>

      {/* ── Holdings ───────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Holdings</h2>
        {!rows.length ? (
          <div className="px-4 py-8 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-500 text-center">
            No holdings yet. Add one to start the ledger.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
                <th className="text-left font-medium px-4 py-2.5">Ticker</th>
                <th className="text-right font-medium px-3 py-2.5">Shares</th>
                <th className="text-right font-medium px-3 py-2.5">Adj. basis</th>
                <th className="text-right font-medium px-3 py-2.5">Price</th>
                <th className="text-right font-medium px-3 py-2.5">Value</th>
                <th className="text-right font-medium px-3 py-2.5">Unrealised</th>
                <th className="text-right font-medium px-3 py-2.5">Weight</th>
                <th className="text-right font-medium px-3 py-2.5">Dividends</th>
                <th className="text-right font-medium px-3 py-2.5">Net CC</th>
                <th className="text-left font-medium px-3 py-2.5">Contracts</th>
                <th className="text-left font-medium px-3 py-2.5">Add</th>
              </tr></thead>
              <tbody>
                {rows.map(({ h, state, bad, mv, unreal }) => (
                  <tr key={h.id} onClick={() => setDetailId(h.id)}
                    className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-white">{h.ticker}</div>
                      <div className="text-[11px] text-gray-500">
                        {h.name}{h.name && ' · '}{h.pays_dividend ? (h.drip ? 'DRIP' : 'Cash div') : 'No dividend'}
                      </div>
                      {bad && <div className="text-[11px] text-red-400 flex gap-1"><TriangleAlert className="w-3 h-3" />{bad}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{fmtShares(state.shares)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {state.basis != null && state.basis <= 0
                        ? <span className="text-emerald-400" title="Dividends and premium have covered the whole cost">{money(state.basis)} · paid off</span>
                        : <span className="text-gray-300">{money(state.basis)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <PriceCell key={h.current_price ?? 'none'} holding={h} onSaved={load} onError={setError} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{money(mv)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${tone(unreal)}`}>
                      {signed(unreal)}
                      {unreal != null && state.totalCost > 0 && <div className="text-[11px]">{pct(unreal / state.totalCost)}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{mv != null && totals.mv > 0 ? `${((mv / totals.mv) * 100).toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{h.pays_dividend || state.dividends ? money(state.dividends) : <span className="text-gray-600 font-sans text-xs">No dividend</span>}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${tone(state.ccNet)}`}>{state.ccNet ? signed(state.ccNet) : '—'}</td>
                    <td className="px-3 py-2.5 min-w-[130px]"><ContractMeter state={state} /></td>
                    <td className="px-3 py-2.5 min-w-[220px]"><QuickActions holding={h} state={state} onAction={openAction} size="xs" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Monthly income ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Monthly income</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {!totals.monthly.length ? <div className="h-32 flex items-center justify-center text-gray-600 text-sm">No dividends or premium yet</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={totals.monthly} stackOffset="sign" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => `$${v}`} />
                <Tooltip cursor={{ fill: '#1f2937' }} contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [money(v), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="dividend" name="Dividends" stackId="i" fill="#10b981" />
                <Bar dataKey="cc" name="Net CC premium" stackId="i" fill="#818cf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <Modal isOpen={!!detail} onClose={() => setDetailId(null)} size="xl"
        title={detail ? `${detail.h.ticker}${detail.h.name ? ` — ${detail.h.name}` : ''}` : ''}>
        {detail && (
          <>
            {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
            <HoldingSettings holding={detail.h} onSaved={load} onError={setError}
              onDelete={() => setConfirm({
                title: `Delete ${detail.h.ticker}?`,
                message: `This deletes the holding and all ${detail.ledger.length} ledger entries. It can't be undone.`,
                run: async () => { await dragonApi.deleteHolding(detail.h.id); setDetailId(null) },
              })} />
            <HoldingDetail holding={detail.h} state={detail.state} ledger={detail.ledger}
              onAction={openAction}
              onEdit={tx => setTxForm({ holding: detail.h, type: tx.type, tx })}
              onDelete={tx => setConfirm({
                title: `Delete this ${TYPE_LABEL[tx.type].toLowerCase()}?`,
                message: `${tx.date} — the basis will be recalculated from the remaining entries.`,
                run: () => dragonApi.deleteTx(tx.id),
              })} />
          </>
        )}
      </Modal>

      <Modal isOpen={!!txForm} onClose={() => setTxForm(null)} title={txForm ? `${txForm.tx ? 'Edit' : 'Log'} ${TYPE_LABEL[txForm.type]}` : ''}>
        {txForm && txState && (
          <TxForm key={`${txForm.holding.id}-${txForm.type}-${txForm.tx?.id ?? 'new'}`}
            holding={txState.h} state={txState.state} ledger={txState.ledger}
            type={txForm.type} tx={txForm.tx} onSaved={saved} onCancel={() => setTxForm(null)} />
        )}
      </Modal>

      <Modal isOpen={showDca} onClose={() => setShowDca(false)} title="Monthly DCA" size="lg">
        {showDca && <DcaForm holdings={data.holdings} onSaved={saved} onCancel={() => setShowDca(false)} />}
      </Modal>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add holding" size="sm">
        {showAdd && <AddHoldingForm onSaved={() => { setShowAdd(false); load() }} onCancel={() => setShowAdd(false)} />}
      </Modal>

      <Modal isOpen={panel === 'import'} onClose={() => setPanel(null)} title="Import Schwab CSV" size="xl">
        {panel === 'import' && <ImportModal onCancel={() => setPanel(null)} onDone={r => {
          setPanel(null)
          setNotice(`Imported ${r.added.length} row(s)${r.duplicates ? `, skipped ${r.duplicates} duplicate(s)` : ''}${r.review.length ? `, ${r.review.length} left for review` : ''}.`)
          load()
        }} />}
      </Modal>

      <Modal isOpen={panel === 'reconcile'} onClose={() => setPanel(null)} title="Reconcile with Schwab" size="xl">
        {panel === 'reconcile' && <Reconcile rows={rows} />}
      </Modal>

      <Modal isOpen={panel === 'tax'} onClose={() => setPanel(null)} title="Australian tax year" size="xl">
        {panel === 'tax' && <TaxReport rows={rows} />}
      </Modal>

      <ConfirmDialog isOpen={!!confirm} title={confirm?.title} message={confirm?.message}
        onConfirm={runConfirm} onCancel={() => setConfirm(null)} />
    </div>
  )
}

/** floor(shares ÷ 100) contracts, how many are free, and progress to the next one. */
function ContractMeter({ state }) {
  const into = SHARES_PER_CONTRACT - state.toNextContract
  return (
    <div title={`${fmtShares(state.toNextContract)} shares to contract #${state.contracts + 1}`}>
      <div className="text-xs font-mono text-gray-300">
        {state.contracts}{state.contracts > 0 && <span className="text-gray-500"> ({state.freeContracts} free)</span>}
      </div>
      <div className="h-1.5 mt-1 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (into / SHARES_PER_CONTRACT) * 100)}%` }} />
      </div>
      <div className="text-[10px] text-gray-600 mt-0.5 font-mono">{fmtShares(state.toNextContract)} to next</div>
    </div>
  )
}

/** Manual price, saved on blur / Enter. */
function PriceCell({ holding, onSaved, onError }) {
  const [v, setV] = useState(holding.current_price ?? '')  // parent keys this on the price, so a reload resets it
  async function save() {
    const next = v === '' ? null : Number(v)
    if (next === holding.current_price) return
    if (next != null && !(next >= 0)) return onError('Price must be a positive number')
    try { await dragonApi.updateHolding(holding.id, { current_price: next }); onSaved() }
    catch (err) { onError(err?.message || 'Failed to save price') }
  }
  return (
    <input type="number" step="0.01" min="0" inputMode="decimal" value={v} aria-label={`${holding.ticker} price`}
      title={holding.price_updated_at ? `Updated ${new Date(holding.price_updated_at).toLocaleString()}` : 'No price yet'}
      onChange={e => setV(e.target.value)} onBlur={save} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-24 bg-transparent border border-transparent hover:border-gray-700 focus:border-indigo-500 rounded-md px-2 py-1 text-right font-mono text-sm text-white focus:outline-none" />
  )
}

function AddHoldingForm({ onSaved, onCancel }) {
  const [f, setF] = useState({ ticker: '', name: '', pays_dividend: true, drip: true, current_price: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (p) => setF(prev => ({ ...prev, ...p }))
  async function submit(e) {
    e.preventDefault()
    setSaving(true); setError(null)
    try { await dragonApi.createHolding(f); onSaved() }
    catch (err) { setError(err?.message || 'Failed to add holding') }
    finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ticker"><input required value={f.ticker} onChange={e => set({ ticker: e.target.value })} className={`${inputCls} uppercase`} placeholder="SCHD" /></Field>
        <Field label="Current price"><input type="number" step="0.01" min="0" value={f.current_price} onChange={e => set({ current_price: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label="Name"><input value={f.name} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder="Optional" /></Field>
      <Toggles f={f} set={set} />
      <ErrorBox>{error}</ErrorBox>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Add holding'}</button>
      </div>
    </form>
  )
}

function Toggles({ f, set }) {
  return (
    <div className="flex gap-5 text-sm text-gray-300">
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.pays_dividend} onChange={e => set({ pays_dividend: e.target.checked })} /> Pays a dividend</label>
      <label className={`flex items-center gap-2 ${f.pays_dividend ? '' : 'opacity-40'}`}><input type="checkbox" disabled={!f.pays_dividend} checked={f.drip} onChange={e => set({ drip: e.target.checked })} /> DRIP</label>
    </div>
  )
}

/** Name + dividend flags, saved immediately on change; delete for the whole holding. */
function HoldingSettings({ holding, onSaved, onError, onDelete }) {
  const save = async (patch) => {
    try { await dragonApi.updateHolding(holding.id, patch); onSaved() }
    catch (err) { onError(err?.message || 'Failed to save') }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-gray-800">
      <Toggles f={holding} set={save} />
      <button type="button" onClick={onDelete} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400">
        <Trash2 className="w-3.5 h-3.5" /> Delete holding
      </button>
    </div>
  )
}
