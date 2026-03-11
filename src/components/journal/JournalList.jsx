import { format, parseISO } from 'date-fns'
import { ENTRY_TYPES } from './JournalCalendar.jsx'

const moodEmoji = { great: '😄', good: '🙂', neutral: '😐', bad: '😕', terrible: '😤' }

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function JournalList({ entries, selectedId, onSelect, onDelete, emptyMessage = 'No journal entries' }) {
  if (!entries.length) return (
    <div className="text-center py-12 text-gray-600 text-sm border border-gray-800 rounded-xl border-dashed">
      {emptyMessage}
    </div>
  )

  return (
    <div className="space-y-1.5">
      {entries.map(entry => {
        const typeCfg = ENTRY_TYPES[entry.entry_type] || ENTRY_TYPES.daily
        return (
          <div
            key={entry.id}
            onClick={() => onSelect(entry)}
            className={`group relative cursor-pointer rounded-xl border px-4 py-3 transition-all ${
              selectedId === entry.id
                ? 'border-indigo-500/50 bg-indigo-500/5'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Date + type + mood row */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-gray-500">
                    {format(parseISO(entry.date), 'MMM d, yyyy')}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${typeCfg.text} border-current border-opacity-30 bg-current bg-opacity-10`}
                    style={{ borderColor: 'currentColor', backgroundColor: 'transparent' }}>
                    <span className={typeCfg.text}>{typeCfg.label}</span>
                  </span>
                  {entry.mood && (
                    <span className="text-xs">{moodEmoji[entry.mood]}</span>
                  )}
                </div>

                {/* Title */}
                <div className="text-sm font-medium text-white truncate">
                  {entry.title || 'Untitled entry'}
                </div>

                {/* Preview */}
                <div className="text-xs text-gray-600 mt-0.5 line-clamp-1">
                  {stripHtml(entry.preview || entry.content).slice(0, 100) || '—'}
                </div>

                {/* Tags */}
                {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {entry.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete */}
              <button
                onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all shrink-0 mt-0.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
