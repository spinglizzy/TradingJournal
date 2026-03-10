import LoadingSpinner from './LoadingSpinner.jsx'

export default function StatCard({ title, value, sub, icon: Icon, positive, negative, loading }) {
  const colored = positive != null
    ? positive ? 'text-emerald-400' : 'text-red-400'
    : 'text-white'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400 font-medium">{title}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
            <Icon className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>
      {loading ? (
        <LoadingSpinner size="sm" />
      ) : (
        <>
          <span className={`text-2xl font-bold font-mono ${colored}`}>{value ?? '—'}</span>
          {sub && <span className="text-xs text-gray-500">{sub}</span>}
        </>
      )}
    </div>
  )
}
