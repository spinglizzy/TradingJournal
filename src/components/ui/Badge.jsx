import { TrendingUp, TrendingDown } from 'lucide-react'

export default function Badge({ children, color = '#6366f1', className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  )
}

export function PnlBadge({ value, className = '' }) {
  if (value == null) return <span className="text-gray-500 text-sm">—</span>
  const pos = value >= 0
  return (
    <span className={`font-mono font-medium text-sm ${pos ? 'text-emerald-400' : 'text-red-400'} ${className}`}>
      {pos ? '+' : ''}${value.toFixed(2)}
    </span>
  )
}

export function DirectionBadge({ direction }) {
  const isLong = direction === 'long'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide
      ${isLong ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
      {isLong
        ? <TrendingUp className="w-3 h-3" />
        : <TrendingDown className="w-3 h-3" />
      }
      {direction}
    </span>
  )
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
      ${status === 'open' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
      {status === 'open' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
      {status}
    </span>
  )
}
