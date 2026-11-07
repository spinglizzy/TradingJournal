import { TriangleAlert } from 'lucide-react'

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 font-medium mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ children }) {
  if (!children) return null
  return (
    <div className="flex gap-2 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{children}
    </div>
  )
}

export function SummaryCard({ label, value, sub, valueCls = 'text-white' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
      <div className="text-[11px] text-gray-500 mb-1">{label}</div>
      <div className={`font-mono font-bold text-xl ${valueCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-1 font-mono">{sub}</div>}
    </div>
  )
}
