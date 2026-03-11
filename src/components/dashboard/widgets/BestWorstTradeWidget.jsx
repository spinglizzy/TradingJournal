import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { statsApi } from '../../../api/stats.js'
import { useDashboard } from '../../../contexts/DashboardContext.jsx'

export default function BestWorstTradeWidget({ config }) {
  const { dateRange, apiParams } = useDashboard()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.summary(apiParams)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [apiParams.from, apiParams.to, apiParams.account_id])

  if (loading) return <WidgetSkeleton />

  const best  = data?.best_trade
  const worst = data?.worst_trade

  return (
    <div className="flex flex-col gap-2 h-full">
      <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Best / Worst Trade</span>
      <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
        <TradeSlot label="Best" trade={best}  color="emerald" />
        <TradeSlot label="Worst" trade={worst} color="red" />
      </div>
    </div>
  )
}

function TradeSlot({ label, trade, color }) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    red:     { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20'     },
  }
  const c = colorMap[color]

  if (!trade) return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3 flex flex-col gap-1`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-600 text-xs">No data</div>
    </div>
  )

  const pnl = trade.pnl ?? 0

  return (
    <Link
      to={`/trades/${trade.id}`}
      className={`rounded-lg border ${c.border} ${c.bg} p-3 flex flex-col gap-1 hover:opacity-80 transition-opacity`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-bold font-mono ${c.text}`}>
        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
      </div>
      <div className="text-xs text-gray-400 truncate">{trade.ticker}</div>
      <div className="text-xs text-gray-600">{trade.date}</div>
    </Link>
  )
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-2 h-full animate-pulse">
      <div className="h-3 bg-gray-800 rounded w-32" />
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div className="bg-gray-800 rounded-lg" />
        <div className="bg-gray-800 rounded-lg" />
      </div>
    </div>
  )
}
