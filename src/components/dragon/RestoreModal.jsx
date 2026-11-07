import { useState } from 'react'
import { Upload, TriangleAlert } from 'lucide-react'
import { dragonApi } from '../../api/dragon.js'
import { validateBackup } from '../../../server/lib/dragonBackup.js'
import { ErrorBox } from './ui.jsx'
import { btnGhost, btnPrimary } from './format.js'

/**
 * Restore a Dragon ledger from an "Export ledger" JSON file. Into an empty ledger
 * it just restores; over existing data it needs an explicit wipe confirmation,
 * and the server refuses (409) without it.
 */
export default function RestoreModal({ current, onDone, onCancel }) {
  const [backup, setBackup] = useState(null)
  const [name, setName]     = useState('')
  const [wipe, setWipe]     = useState(false)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)
  const hasData = current.holdings + current.transactions > 0

  async function pick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setBackup(null); setName(file.name)
    try {
      const b = JSON.parse(await file.text())
      validateBackup(b)
      setBackup(b)
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message)
    }
  }

  async function restore() {
    setBusy(true); setError(null)
    try { onDone(await dragonApi.restore({ backup, wipe })) }
    catch (err) { setError(err?.message || 'Restore failed — nothing was changed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl cursor-pointer text-sm text-gray-400 transition-colors">
        <Upload className="w-4 h-4" />
        {name || 'Choose a dragon-ledger-….json backup'}
        <input type="file" accept=".json,application/json" onChange={pick} className="sr-only" />
      </label>

      {backup && (
        <p className="text-sm text-gray-300">
          Backup from {new Date(backup.exported_at).toLocaleString()}: {backup.holdings.length} holding(s), {backup.transactions.length} transaction(s).
        </p>
      )}

      {backup && hasData && (
        <div className="px-4 py-3 bg-red-900/15 border border-red-800/40 rounded-lg space-y-2">
          <p className="text-xs text-red-400 flex gap-1.5"><TriangleAlert className="w-4 h-4 shrink-0" />
            Your Dragon ledger isn’t empty ({current.holdings} holding(s), {current.transactions} transaction(s)). Restoring replaces all of it.</p>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} />
            Wipe my current Dragon ledger and restore this backup
          </label>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      <p className="text-[11px] text-gray-500">All or nothing: if anything in the backup doesn’t check out, nothing changes.</p>

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        <button type="button" disabled={busy || !backup || (hasData && !wipe)} onClick={restore} className={btnPrimary}>
          {busy ? 'Restoring…' : hasData ? 'Wipe and restore' : 'Restore'}
        </button>
      </div>
    </div>
  )
}
