import { format, parseISO } from 'date-fns'
import { DirectionBadge, PnlBadge, StatusBadge } from '../ui/Badge.jsx'
import Badge from '../ui/Badge.jsx'

const COLS = [
  { key: 'date',          label: 'Date',      sortable: true },
  { key: 'ticker',        label: 'Ticker',    sortable: true },
  { key: 'direction',     label: 'Dir',       sortable: false },
  { key: 'entry_price',   label: 'Entry',     sortable: false },
  { key: 'exit_price',    label: 'Exit',      sortable: false },
  { key: 'position_size', label: 'Size',      sortable: true },
  { key: 'pnl',           label: 'P&L',       sortable: true },
  { key: 'pnl_percent',   label: '%',         sortable: true },
  { key: 'r_multiple',    label: 'R',         sortable: true },
  { key: 'strategy_name', label: 'Strategy',  sortable: false },
  { key: 'status',        label: 'Status',    sortable: false },
  { key: '_actions',      label: '',          sortable: false },
]

function SortIcon({ active, dir }) {
  return (
    <span className="ml-1 inline-flex flex-col gap-px">
      <svg className={`w-2.5 h-2.5 ${active && dir === 'asc' ? 'text-indigo-400' : 'text-gray-600'}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 0L10 6H0L5 0z" />
      </svg>
      <svg className={`w-2.5 h-2.5 ${active && dir === 'desc' ? 'text-indigo-400' : 'text-gray-600'}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 6L0 0H10L5 6z" />
      </svg>
    </span>
  )
}

export default function TradeTable({ trades, sort, onSort, onEdit, onDelete, onView }) {
  if (!trades.length) return (
    <div className="text-center py-16 text-gray-600 border border-gray-800 rounded-xl">
      No trades found
    </div>
  )

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {COLS.map(col => (
                <th key={col.key}
                  className={`text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3
                    ${col.sortable ? 'cursor-pointer hover:text-gray-300 select-none' : ''}`}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <span className="flex items-center gap-0.5">
                    {col.label}
                    {col.sortable && <SortIcon active={sort.sort_by === col.key} dir={sort.sort_dir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {trades.map(trade => (
              <tr key={trade.id}
                className="hover:bg-gray-800/40 transition-colors group cursor-pointer"
                onClick={() => onView?.(trade.id)}
              >
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                  {format(parseISO(trade.date), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 font-semibold text-white">{trade.ticker}</td>
                <td className="px-4 py-3"><DirectionBadge direction={trade.direction} /></td>
                <td className="px-4 py-3 font-mono text-gray-300 text-xs">${trade.entry_price.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-gray-300 text-xs">
                  {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : <span className="text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-300">{trade.position_size}</td>
                <td className="px-4 py-3"><PnlBadge value={trade.pnl} /></td>
                <td className="px-4 py-3">
                  {trade.pnl_percent != null
                    ? <span className={`font-mono text-xs ${trade.pnl_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trade.pnl_percent >= 0 ? '+' : ''}{trade.pnl_percent.toFixed(2)}%
                      </span>
                    : <span className="text-gray-600">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {trade.r_multiple != null
                    ? <span className={`font-mono text-xs ${trade.r_multiple >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trade.r_multiple.toFixed(2)}R
                      </span>
                    : <span className="text-gray-600">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {trade.strategy_name
                    ? <span className="text-xs text-gray-400">{trade.strategy_name}</span>
                    : <span className="text-gray-700">—</span>
                  }
                </td>
                <td className="px-4 py-3"><StatusBadge status={trade.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(trade.id) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(trade.id) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
