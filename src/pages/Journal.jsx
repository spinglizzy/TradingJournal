import { useEffect, useState } from 'react'
import { journalApi } from '../api/journal.js'
import JournalList from '../components/journal/JournalList.jsx'
import JournalEditor from '../components/journal/JournalEditor.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'

export default function Journal() {
  const [entries, setEntries]     = useState([])
  const [selected, setSelected]   = useState(null)
  const [isNew, setIsNew]         = useState(false)
  const [loading, setLoading]     = useState(true)
  const [deleteId, setDeleteId]   = useState(null)

  function fetchEntries() {
    setLoading(true)
    journalApi.list()
      .then(setEntries)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEntries() }, [])

  async function handleSave(data) {
    if (selected && !isNew) {
      await journalApi.update(selected.id, data)
    } else {
      await journalApi.create(data)
    }
    setIsNew(false)
    setSelected(null)
    fetchEntries()
  }

  async function handleDelete() {
    await journalApi.delete(deleteId)
    setDeleteId(null)
    if (selected?.id === deleteId) setSelected(null)
    fetchEntries()
  }

  function handleSelect(entry) {
    setIsNew(false)
    setSelected(entry)
  }

  function handleNew() {
    setIsNew(true)
    setSelected(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal</h1>
          <p className="text-sm text-gray-500 mt-1">Daily trading reflections</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Entry
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          {loading
            ? <LoadingSpinner className="h-48" />
            : <JournalList entries={entries} selected={selected} onSelect={handleSelect} onDelete={(id) => setDeleteId(id)} />
          }
        </div>
        <div className="lg:col-span-2">
          {(selected || isNew)
            ? <JournalEditor
                key={selected?.id ?? 'new'}
                entry={isNew ? null : selected}
                onSave={handleSave}
                onCancel={() => { setSelected(null); setIsNew(false) }}
              />
            : (
              <div className="h-64 flex items-center justify-center text-gray-600 border border-gray-800 rounded-xl border-dashed">
                Select an entry or create a new one
              </div>
            )
          }
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Journal Entry"
        message="This journal entry will be permanently deleted."
        confirmLabel="Delete Entry"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
