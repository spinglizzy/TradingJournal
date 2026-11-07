import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { daysTo } from '../../../server/lib/dragonEngine.js'
import { callLabel, money, signed, fmtShares, tone, TYPE_LABEL } from './format.js'

/** Quick-add buttons for one holding. Disabled states mirror the engine's rules. */
export function QuickActions({ holding, state, onAction, size = 'sm' }) {
  const noCalls = state.openCalls.length === 0
  const actions = [
    ['BUY'],
    ...(holding.pays_dividend ? [['DIVIDEND'], ['DRIP']] : []),
    ['SELL', state.shares <= 0 && 'No shares to sell'],
    ['CC_OPEN', state.freeContracts < 1 && (state.contracts < 1 ? 'Needs 100 shares per contract' : 'All shares already covered')],
    ['CC_CLOSE', noCalls && 'No open calls'],
    ['CC_ROLL', noCalls && 'No open calls'],
    ['CC_EXPIRE', noCalls && 'No open calls'],
  ]
  const cls = size === 'xs' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
  return (
    <div className="flex flex-wrap gap-1">
      {actions.map(([type, why]) => (
        <button
          key={type} type="button" disabled={!!why} title={why || undefined}
          onClick={(e) => { e.stopPropagation(); onAction(holding, type) }}
          className={`${cls} font-medium rounded-md border border-gray-700 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-35 disabled:cursor-not-allowed transition-colors`}
        >
          {TYPE_LABEL[type]}
        </button>
      ))}
    </div>
  )
}

const describe = (t) => {
  switch (t.type) {
    case 'BUY': case 'DRIP': case 'SELL': return `${fmtShares(t.shares)} @ ${money(t.price)}`
    case 'CC_OPEN': return `${callLabel(t)} @ ${money(t.premium)}`
    case 'CC_ROLL': return `→ ${callLabel(t)} @ ${signed(Number(t.premium))} net`
    case 'CC_CLOSE': return `@ ${money(t.premium)}`
    default: return ''
  }
}
/** Cash effect on the cost basis, signed as money in (+) / out (−) of your pocket. */
const cashFlow = (t) => ({
  BUY: -t.amount, DRIP: 0, SELL: t.amount, DIVIDEND: t.amount,
  CC_OPEN: t.amount, CC_CLOSE: -t.amount, CC_ROLL: t.amount, CC_EXPIRE: 0,
}[t.type])

export default function HoldingDetail({ holding, state, ledger, onAction, onEdit, onDelete }) {
  const price = holding.current_price
  const chart = state.timeline.filter(p => p.basis != null).map(p => ({ date: p.date, basis: Math.round(p.basis * 100) / 100 }))
  const byId = new Map(ledger.map(t => [t.id, t]))

  return (
    <div className="space-y-6">
      <QuickActions holding={holding} state={state} onAction={onAction} />

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Open calls</h3>
        {state.openCalls.length === 0 ? (
          <p className="text-xs text-gray-600">None open.</p>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
                <th className="text-left font-medium px-4 py-2">Strike</th>
                <th className="text-left font-medium px-4 py-2">Expiry</th>
                <th className="text-right font-medium px-4 py-2">DTE</th>
                <th className="text-right font-medium px-4 py-2">Contracts</th>
                <th className="text-right font-medium px-4 py-2">Premium</th>
                <th className="text-right font-medium px-4 py-2">vs price</th>
              </tr></thead>
              <tbody className="font-mono">
                {state.openCalls.map(c => {
                  const itm = price != null && price > c.strike
                  return (
                    <tr key={c.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-4 py-2 text-white">{money(c.strike)}</td>
                      <td className="px-4 py-2 text-gray-300">{c.expiry}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{daysTo(c.expiry)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{c.contracts}</td>
                      <td className={`px-4 py-2 text-right ${tone(c.amount)}`}>{signed(c.amount)}</td>
                      <td className="px-4 py-2 text-right font-sans">
                        {price == null ? <span className="text-gray-600">no price</span>
                          : itm ? <span className="inline-flex items-center gap-1 text-amber-400"><TriangleAlert className="w-3.5 h-3.5" />Above strike</span>
                          : <span className="text-gray-400">Below strike</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Adjusted basis over time</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          {chart.length < 2 ? <p className="text-xs text-gray-600 p-4">Needs at least two entries.</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => `$${v}`} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} formatter={v => [money(v), 'Basis / share']} />
                {chart.some(p => p.basis <= 0) && <ReferenceLine y={0} stroke="#10b981" strokeDasharray="4 4" />}
                <Line type="stepAfter" dataKey="basis" stroke="#818cf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Ledger</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-800">
              <th className="text-left font-medium px-4 py-2">Date</th>
              <th className="text-left font-medium px-4 py-2">Type</th>
              <th className="text-left font-medium px-4 py-2">Detail</th>
              <th className="text-right font-medium px-4 py-2">Cash</th>
              <th className="text-right font-medium px-4 py-2">Shares after</th>
              <th className="text-right font-medium px-4 py-2">Basis after</th>
              <th className="px-2" />
            </tr></thead>
            <tbody>
              {[...state.timeline].reverse().map(p => {
                const t = byId.get(p.id)
                const flow = cashFlow(t)
                return (
                  <tr key={t.id} className="border-b border-gray-800/60 last:border-0 group">
                    <td className="px-4 py-2 font-mono text-gray-400">{t.date}</td>
                    <td className="px-4 py-2 text-white">{TYPE_LABEL[t.type]}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                      {describe(t)}
                      {t.ref_id && byId.get(t.ref_id) && <span className="text-gray-600"> · ends {callLabel(byId.get(t.ref_id))}</span>}
                      {t.notes && <div className="font-sans text-gray-600">{t.notes}</div>}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${tone(flow)}`}>{flow ? signed(flow) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-300">{fmtShares(p.shares)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${p.basis != null && p.basis <= 0 ? 'text-emerald-400' : 'text-gray-300'}`}>{money(p.basis)}</td>
                    <td className="px-2 whitespace-nowrap">
                      <button type="button" onClick={() => onEdit(t)} aria-label="Edit" className="p-1 text-gray-500 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => onDelete(t)} aria-label="Delete" className="p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
