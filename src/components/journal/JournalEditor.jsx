import { useState } from 'react'
import MDEditor from '@uiw/react-md-editor'

const moods = [
  { value: 'great',    label: '😄 Great' },
  { value: 'good',     label: '🙂 Good' },
  { value: 'neutral',  label: '😐 Neutral' },
  { value: 'bad',      label: '😕 Bad' },
  { value: 'terrible', label: '😤 Terrible' },
]

export default function JournalEditor({ entry, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]       = useState(entry?.date ?? today)
  const [title, setTitle]     = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [mood, setMood]       = useState(entry?.mood ?? 'neutral')
  const [saving, setSaving]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    try {
      await onSave({ date, title, content, mood })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4" data-color-mode="dark">
      {/* Date + mood row */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Mood</label>
          <select
            value={mood}
            onChange={e => setMood(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {moods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Solid session, stuck to the plan"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Notes (Markdown supported)</label>
        <MDEditor
          value={content}
          onChange={setContent}
          height={320}
          preview="edit"
          style={{ background: '#111827', border: '1px solid #374151', borderRadius: '0.5rem' }}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving || !content.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
          {saving ? 'Saving...' : 'Save Entry'}
        </button>
      </div>
    </form>
  )
}
