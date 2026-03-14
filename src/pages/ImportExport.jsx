import { useState, useRef, useCallback } from 'react'
import { importExportApi } from '../api/importexport.js'
import { useAccount } from '../contexts/AccountContext.jsx'
import { BROKER_TEMPLATES, JOURNAL_FIELDS } from '../components/import/BrokerTemplates.js'
import { Upload, Download, ChevronRight, Check, AlertCircle, RefreshCw, FileText, Database } from 'lucide-react'

const TEMPLATE_STORAGE_KEY = 'import_custom_templates'
const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

// ── CSV parser (client side) ──────────────────────────────────────────────────
function parseCSVClient(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    const fields = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    rows.push(fields)
  }
  return rows
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Upload', 'Map Columns', 'Defaults', 'Review & Import']
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            i + 1 === step ? 'bg-indigo-600 text-white' :
            i + 1 < step  ? 'text-emerald-400' : 'text-gray-600'
          }`}>
            {i + 1 < step ? <Check className="w-3.5 h-3.5" /> : <span className="text-xs">{i + 1}</span>}
            {s}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 text-gray-700 mx-1" />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────
function UploadStep({ onNext }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  function processFile(file) {
    if (!file) return
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a CSV file')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const rows = parseCSVClient(text)
      if (rows.length < 2) { setError('CSV has no data rows'); return }
      const headers = rows[0]
      const preview = rows.slice(1, 11)
      onNext({ csv: text, headers, preview, totalRows: rows.length - 1 })
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all ${
          dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/30'
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => processFile(e.target.files[0])} />
        <Upload className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-white font-medium mb-1">Drop your CSV file here</p>
        <p className="text-sm text-gray-500">or click to browse</p>
        <p className="text-xs text-gray-600 mt-2">Supports any CSV with a header row</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Quick tips */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
        <p className="text-xs font-medium text-gray-400 mb-2">Supported formats</p>
        <div className="flex flex-wrap gap-2">
          {BROKER_TEMPLATES.map(t => (
            <span key={t.id} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">{t.name}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Map Columns ───────────────────────────────────────────────────────
function MappingStep({ data, onNext, onBack }) {
  const { headers, preview } = data
  const [mappings, setMappings] = useState(data.mappings ?? {})
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [templateName, setTemplateName] = useState('')

  const allTemplates = [...BROKER_TEMPLATES, ...customTemplates.map(t => ({ ...t, custom: true }))]

  function applyTemplate(templateId) {
    const tmpl = allTemplates.find(t => t.id === templateId)
    if (!tmpl) return
    setSelectedTemplate(templateId)
    // Only set mappings where the CSV column actually exists
    const newMappings = {}
    for (const [field, col] of Object.entries(tmpl.mappings)) {
      if (headers.includes(col)) newMappings[field] = col
    }
    setMappings(newMappings)
  }

  function saveCustomTemplate() {
    if (!templateName.trim()) return
    const tmpl = {
      id: `custom_${Date.now()}`,
      name: templateName.trim(),
      description: 'Custom template',
      mappings: { ...mappings },
      transforms: {},
      custom: true,
    }
    const updated = [...customTemplates, tmpl]
    setCustomTemplates(updated)
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(updated))
    setTemplateName('')
  }

  function deleteCustomTemplate(id) {
    const updated = customTemplates.filter(t => t.id !== id)
    setCustomTemplates(updated)
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(updated))
  }

  // Build preview of mapped data
  const mappedPreview = preview.slice(0, 5).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    const mapped = {}
    for (const field of JOURNAL_FIELDS) {
      const col = mappings[field.key]
      mapped[field.key] = col ? obj[col] : ''
    }
    return mapped
  })

  const requiredMapped = JOURNAL_FIELDS.filter(f => f.required).every(f => mappings[f.key])

  return (
    <div className="space-y-5">
      {/* Template picker */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Broker Template</h3>
          <span className="text-xs text-gray-600">Pre-fill mappings automatically</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {allTemplates.map(t => (
            <div key={t.id} className="relative">
              <button
                onClick={() => applyTemplate(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedTemplate === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {t.name}
                {t.custom && ' *'}
              </button>
              {t.custom && (
                <button onClick={() => deleteCustomTemplate(t.id)}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-400">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Field mapping */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Column Mapping</h3>
        <div className="grid grid-cols-2 gap-3">
          {JOURNAL_FIELDS.map(field => (
            <div key={field.key} className="flex items-center gap-3">
              <div className="w-36 shrink-0">
                <span className="text-xs font-medium text-gray-300">{field.label}</span>
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
                <div className="text-[10px] text-gray-600">{field.hint}</div>
              </div>
              <select
                value={mappings[field.key] ?? ''}
                onChange={e => setMappings(m => ({ ...m, [field.key]: e.target.value || undefined }))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">— Not mapped —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Preview of mapped data */}
      {mappedPreview.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Mapped Data Preview (first 5 rows)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  {JOURNAL_FIELDS.filter(f => mappings[f.key]).map(f => (
                    <th key={f.key} className="pb-2 text-left text-gray-500 pr-4 whitespace-nowrap">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedPreview.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {JOURNAL_FIELDS.filter(f => mappings[f.key]).map(f => (
                      <td key={f.key} className="py-1.5 pr-4 text-gray-300 whitespace-nowrap max-w-[120px] truncate">
                        {row[f.key] || <span className="text-gray-700">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Save template */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 card-glow">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Save as Custom Template</h3>
        <div className="flex gap-2">
          <input className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            value={templateName} onChange={e => setTemplateName(e.target.value)}
            placeholder="Template name..." />
          <button onClick={saveCustomTemplate} disabled={!templateName.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors">
            Save
          </button>
        </div>
      </div>

      <div className="flex gap-3 justify-between">
        <button onClick={onBack}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          Back
        </button>
        <button onClick={() => onNext({ mappings })} disabled={!requiredMapped}
          className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors">
          Next: Set Defaults
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Defaults ──────────────────────────────────────────────────────────
function DefaultsStep({ data, onNext, onBack }) {
  const { accounts } = useAccount()
  const [defaults, setDefaults] = useState(data.defaults ?? {
    account_id: accounts[0]?.id ?? '',
    direction: 'long',
    setup: '',
  })

  function set(k, v) { setDefaults(d => ({ ...d, [k]: v })) }

  return (
    <div className="space-y-5">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Default Values for Unmapped Fields</h3>
        <p className="text-xs text-gray-500">These values will be used when the CSV doesn't have data for these fields.</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Account</label>
            <select className={inputCls} value={defaults.account_id ?? ''}
              onChange={e => set('account_id', e.target.value || null)}>
              <option value="">No account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Default Direction</label>
            <select className={inputCls} value={defaults.direction}
              onChange={e => set('direction', e.target.value)}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">Used if direction column is not mapped</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Default Setup</label>
            <input className={inputCls} value={defaults.setup ?? ''}
              onChange={e => set('setup', e.target.value)} placeholder="e.g. Breakout" />
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-between">
        <button onClick={onBack}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          Back
        </button>
        <button onClick={() => onNext({ defaults })}
          className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
          Next: Review
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Review & Import ────────────────────────────────────────────────────
function ReviewStep({ data, onBack, onDone }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runImport() {
    setLoading(true)
    setError('')
    try {
      const res = await importExportApi.run({
        csv: data.csv,
        mappings: data.mappings,
        defaults: data.defaults,
        account_id: data.defaults?.account_id || undefined,
      })
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Import Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold text-white">{data.totalRows}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total rows</div>
          </div>
          <div className="text-center p-3 bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold text-white">{Object.values(data.mappings).filter(Boolean).length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Fields mapped</div>
          </div>
          <div className="text-center p-3 bg-gray-800 rounded-lg">
            <div className="text-sm font-medium text-white">{data.defaults?.account_id ? 'Account set' : 'No account'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Account</div>
          </div>
        </div>

        {/* Mapping summary */}
        <div className="mt-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Column Mappings</h4>
          <div className="flex flex-wrap gap-1.5">
            {JOURNAL_FIELDS.filter(f => data.mappings[f.key]).map(f => (
              <span key={f.key} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">
                <span className="text-gray-300">{f.label}</span> ← {data.mappings[f.key]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Import result */}
      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow space-y-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-5 h-5" />
            <h3 className="text-sm font-semibold">Import Complete</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">{result.imported}</div>
              <div className="text-xs text-gray-500 mt-0.5">Imported</div>
            </div>
            <div className="text-center p-3 bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-gray-300">{result.skipped}</div>
              <div className="text-xs text-gray-500 mt-0.5">Skipped</div>
            </div>
            <div className="text-center p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <div className="text-2xl font-bold text-amber-400">{result.duplicates?.length ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5">Duplicates</div>
            </div>
          </div>

          {result.duplicates?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-amber-400 mb-1.5">Skipped Duplicates (already exist):</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.duplicates.map((d, i) => (
                  <div key={i} className="text-xs text-gray-500 px-2 py-1 bg-gray-800 rounded">
                    Row {d.row}: {d.ticker} on {d.date} (trade #{d.existing_id})
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-red-400 mb-1.5">Errors:</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-gray-500 px-2 py-1 bg-gray-800 rounded">
                    Row {e.row}: {e.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3 justify-between">
        {!result ? (
          <>
            <button onClick={onBack}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
              Back
            </button>
            <button onClick={runImport} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors">
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Importing...' : `Import ${data.totalRows} Trades`}
            </button>
          </>
        ) : (
          <button onClick={onDone}
            className="ml-auto px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
            Done
          </button>
        )}
      </div>
    </div>
  )
}

// ── Export Panel ──────────────────────────────────────────────────────────────
function ExportPanel() {
  const { accounts, selectedAccountId } = useAccount()
  const [csvParams, setCsvParams] = useState({ account_id: selectedAccountId ?? '', from: '', to: '', status: '' })

  function downloadCsv() {
    const url = importExportApi.exportCsvUrl(csvParams)
    window.open(url, '_blank')
  }

  function downloadJson() {
    window.open(importExportApi.exportJsonUrl(), '_blank')
  }

  return (
    <div className="space-y-4">
      {/* CSV Export */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Export Trades as CSV</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Account</label>
            <select className={inputCls} value={csvParams.account_id}
              onChange={e => setCsvParams(p => ({ ...p, account_id: e.target.value }))}>
              <option value="">All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select className={inputCls} value={csvParams.status}
              onChange={e => setCsvParams(p => ({ ...p, status: e.target.value }))}>
              <option value="">All (open + closed)</option>
              <option value="closed">Closed only</option>
              <option value="open">Open only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From Date</label>
            <input type="date" className={inputCls} value={csvParams.from}
              onChange={e => setCsvParams(p => ({ ...p, from: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To Date</label>
            <input type="date" className={inputCls} value={csvParams.to}
              onChange={e => setCsvParams(p => ({ ...p, to: e.target.value }))} />
          </div>
        </div>
        <button onClick={downloadCsv}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {/* JSON Backup */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Full Database Backup (JSON)</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Export everything — trades, journal entries, strategies, goals, accounts — as a single JSON file.
          Use this for backups or migrating to a new device.
        </p>
        <button onClick={downloadJson}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors">
          <Download className="w-4 h-4" />
          Download JSON Backup
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ImportExport() {
  const [activeTab, setActiveTab] = useState('import')
  const [step, setStep] = useState(1)
  const [importData, setImportData] = useState({})

  function resetImport() {
    setStep(1)
    setImportData({})
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Import / Export</h1>
        <p className="text-sm text-gray-500 mt-1">Import trades from CSV files or export your data</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'import' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'export' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {activeTab === 'import' && (
        <>
          <StepBar step={step} />
          {step === 1 && (
            <UploadStep onNext={parsed => { setImportData(d => ({ ...d, ...parsed })); setStep(2) }} />
          )}
          {step === 2 && (
            <MappingStep
              data={importData}
              onNext={d => { setImportData(prev => ({ ...prev, ...d })); setStep(3) }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <DefaultsStep
              data={importData}
              onNext={d => { setImportData(prev => ({ ...prev, ...d })); setStep(4) }}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <ReviewStep
              data={importData}
              onBack={() => setStep(3)}
              onDone={resetImport}
            />
          )}
        </>
      )}

      {activeTab === 'export' && <ExportPanel />}
    </div>
  )
}
