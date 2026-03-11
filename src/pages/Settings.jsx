import { useState, useRef } from 'react'
import { importExportApi } from '../api/importexport.js'
import { markOnboarded } from '../components/onboarding/OnboardingModal.jsx'
import ThemeEditor from '../components/ui/ThemeEditor.jsx'

function Section({ title, description, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  )
}

const TABS = ['Appearance', 'Backup & Data', 'Advanced']

export default function Settings() {
  const fileRef = useRef(null)
  const [activeTab, setActiveTab] = useState('Appearance')
  const [restoreMode, setRestoreMode] = useState('merge')
  const [restoreStatus, setRestoreStatus] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)

  function handleExportJson() {
    setExportLoading(true)
    window.open(importExportApi.exportJsonUrl(), '_blank')
    setTimeout(() => setExportLoading(false), 1000)
  }

  function handleExportCsv() {
    window.open(importExportApi.exportCsvUrl(), '_blank')
  }

  async function handleRestoreFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setRestoreStatus('loading')
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await importExportApi.restore(data, restoreMode)
      setRestoreStatus({ success: true, stats: result.stats })
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to restore backup'
      setRestoreStatus({ success: false, error: msg })
    }
  }

  function clearCache() {
    const keys = ['dashboard_layout', 'dashboard_presets', 'import_custom_templates', 'journal_templates_v2']
    keys.forEach(k => localStorage.removeItem(k))
    alert('Local cache cleared. The page will reload.')
    window.location.reload()
  }

  function resetOnboarding() {
    localStorage.removeItem('tradelog_onboarded')
    window.location.reload()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your TradeLog data and preferences.</p>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-gray-800">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Appearance tab */}
      {activeTab === 'Appearance' && (
        <Section title="Theme" description="Choose a preset or build your own colour theme.">
          <ThemeEditor />
        </Section>
      )}

      {activeTab === 'Backup & Data' && <>
      {/* Backup & Export */}
      <Section
        title="Backup & Export"
        description="Download your data as a backup or export trades to a spreadsheet."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <div>
              <p className="text-sm font-medium text-white">Full JSON Backup</p>
              <p className="text-xs text-gray-500 mt-0.5">All trades, journal entries, goals, and account data</p>
            </div>
            <button
              onClick={handleExportJson}
              disabled={exportLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download .json
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <div>
              <p className="text-sm font-medium text-white">Export Trades as CSV</p>
              <p className="text-xs text-gray-500 mt-0.5">All closed trades in spreadsheet format</p>
            </div>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download .csv
            </button>
          </div>
        </div>
      </Section>

      {/* Restore */}
      <Section
        title="Restore from Backup"
        description="Import a previously downloaded JSON backup file."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Import mode:</span>
            <div className="flex items-center gap-3">
              {[
                { value: 'merge', label: 'Merge', desc: 'Keep existing data, add new records' },
                { value: 'replace', label: 'Replace', desc: 'Delete all data first, then restore' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    value={opt.value}
                    checked={restoreMode === opt.value}
                    onChange={() => setRestoreMode(opt.value)}
                    className="accent-indigo-500"
                  />
                  <span className="text-sm text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {restoreMode === 'replace' && (
            <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-red-400">Replace mode will permanently delete all existing trades, journal entries, and goals before restoring. This cannot be undone.</p>
            </div>
          )}

          {restoreStatus === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Restoring backup…
            </div>
          )}

          {restoreStatus && restoreStatus !== 'loading' && (
            <div className={`p-3 rounded-lg border text-sm ${
              restoreStatus.success
                ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400'
                : 'bg-red-900/20 border-red-800/40 text-red-400'
            }`}>
              {restoreStatus.success ? (
                <div>
                  <p className="font-medium">Backup restored successfully!</p>
                  {restoreStatus.stats && (
                    <p className="mt-1 text-xs opacity-80">
                      {Object.entries(restoreStatus.stats)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => `${v} ${k}`)
                        .join(', ')} imported
                    </p>
                  )}
                </div>
              ) : (
                <p>{restoreStatus.error}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
            <button
              onClick={() => { setRestoreStatus(null); fileRef.current?.click() }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choose Backup File
            </button>
            <span className="text-xs text-gray-600">Accepts .json backup files only</span>
          </div>
        </div>
      </Section>

      </>}

      {activeTab === 'Advanced' && <>
      {/* Keyboard Shortcuts Quick Reference */}
      <Section
        title="Keyboard Shortcuts"
        description="Use keyboard shortcuts to navigate quickly."
      >
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['?', 'Show shortcuts help'],
            ['n', 'New trade'],
            ['Ctrl + B', 'Toggle sidebar'],
            ['g → h', 'Dashboard'],
            ['g → t', 'Trade Log'],
            ['g → a', 'Analytics'],
            ['g → j', 'Journal'],
            ['g → p', 'Playbook'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between gap-2 py-1.5 px-3 bg-gray-800/50 rounded-lg">
              <span className="text-gray-400">{desc}</span>
              <kbd className="text-xs bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-gray-300 font-mono">{key}</kbd>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Advanced Options">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <div>
              <p className="text-sm font-medium text-white">Clear Local Cache</p>
              <p className="text-xs text-gray-500 mt-0.5">Resets dashboard layout, presets, and import templates</p>
            </div>
            <button
              onClick={clearCache}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              Clear Cache
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <div>
              <p className="text-sm font-medium text-white">Reset Welcome Tour</p>
              <p className="text-xs text-gray-500 mt-0.5">Show the onboarding flow again on next page load</p>
            </div>
            <button
              onClick={resetOnboarding}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              Reset Tour
            </button>
          </div>
        </div>
      </Section>
      </>}

      {/* About */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-600">TradeLog v1.0 · Built with React + Express + SQLite</p>
        <p className="text-xs text-gray-700 mt-1">Your data is stored locally — no cloud, no subscriptions.</p>
      </div>
    </div>
  )
}
