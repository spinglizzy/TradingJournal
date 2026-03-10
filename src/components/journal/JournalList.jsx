import { format, parseISO } from 'date-fns'

const moodColors = {
  great:   'text-emerald-400',
  good:    'text-green-400',
  neutral: 'text-gray-400',
  bad:     'text-orange-400',
  terrible:'text-red-400',
}

const moodEmoji = { great: '😄', good: '🙂', neutral: '😐', bad: '😕', terrible: '😤' }

export default function JournalList({ entries, selected, onSelect, onDelete }) {
  if (!entries.length) return (
    <div className="text-center py-12 text-gray-600 text-sm border border-gray-800 rounded-xl border-dashed">
      No journal entries yet
    </div>
  )

  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <div
          key={entry.id}
          onClick={() => onSelect(entry)}
          className={`group relative cursor-pointer rounded-xl border px-4 py-3 transition-all
            ${selected?.id === entry.id
              ? 'border-indigo-500/50 bg-indigo-500/5'
              : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500">
                  {format(parseISO(entry.date), 'MMM d, yyyy')}
                </span>
                {entry.mood && (
                  <span className={`text-xs ${moodColors[entry.mood]}`}>
                    {moodEmoji[entry.mood]}
                  </span>
                )}
              </div>
              <div className="text-sm font-medium text-white truncate">
                {entry.title || 'Untitled entry'}
              </div>
              <div className="text-xs text-gray-600 mt-0.5 line-clamp-1">
                {entry.content.replace(/[#*`]/g, '').slice(0, 80)}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(entry.id) }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
