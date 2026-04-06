import { useState, useRef, useEffect } from 'react'
import {
  Download, Upload, AlertTriangle,
  Link2, Unlink, RefreshCw,
  Lock, Mail, Smartphone, CheckCircle, Eye, EyeOff, Shield, Monitor, LogOut,
} from 'lucide-react'
import { BouncingDots } from '../components/ui/BouncingDots.jsx'
import { importExportApi } from '../api/importexport.js'
import { markOnboarded } from '../components/onboarding/OnboardingModal.jsx'
import { brokersApi } from '../api/brokers.js'
import { supabase } from '../lib/supabase.js'

function Section({ title, description, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 card-glow">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function StatusBanner({ status }) {
  if (!status || status === 'loading') return null
  return (
    <div className={`p-3 rounded-lg border text-sm ${
      status.success
        ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400'
        : 'bg-red-900/20 border-red-800/40 text-red-400'
    }`}>
      {status.text || status.error}
    </div>
  )
}

const TABS = ['Backup & Data', 'Brokers', 'Security', 'Advanced']

const BROKER_LABELS = {
  alpaca: 'Alpaca', tradier: 'Tradier', schwab: 'Schwab',
  tradestation: 'TradeStation', etrade: 'E*TRADE', tradovate: 'Tradovate',
}

function BrokerCard({ label, type, note, comingSoon, status, loading, syncing, msg, onConnect, onSync, onDisconnect, children }) {
  const connected = status?.connected
  return (
    <div className="p-4 bg-gray-800/60 rounded-lg border border-gray-700/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{label}</p>
          {comingSoon && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-500 font-medium">Soon</span>}
          {connected && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${status.is_paper ? 'bg-amber-900/40 text-amber-400' : 'bg-emerald-900/40 text-emerald-400'}`}>
              {status.is_paper ? 'Paper' : 'Live'}
            </span>
          )}
        </div>
        {connected && (
          <div className="flex items-center gap-2">
            <button onClick={onSync} disabled={syncing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button onClick={onDisconnect} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-red-900/50 hover:text-red-400 text-gray-400 text-xs font-medium rounded-lg transition-colors">
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        )}
      </div>
      {connected && (
        <p className="text-xs text-gray-500">
          {status.last_sync_at ? `Last synced ${new Date(status.last_sync_at).toLocaleString()}` : 'Never synced'}
        </p>
      )}
      <StatusBanner status={msg} />
      {!connected && (
        <>
          {note && <p className="text-xs text-gray-500">{note}</p>}
          {!comingSoon && type === 'oauth' && (
            <button onClick={onConnect} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? <BouncingDots size="sm" /> : <Link2 className="w-4 h-4" />}
              {loading ? 'Redirecting…' : `Connect ${label}`}
            </button>
          )}
          {!comingSoon && type === 'credentials' && children}
        </>
      )}
    </div>
  )
}

export default function Settings() {
  const fileRef = useRef(null)
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.has('connected') || params.get('tab') === 'Brokers' ? 'Brokers' : 'Backup & Data'
  })

  // ── Backup & Data ────────────────────────────────────────────────────────────
  const [restoreMode, setRestoreMode] = useState('merge')
  const [restoreStatus, setRestoreStatus] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)

  // ── Brokers ──────────────────────────────────────────────────────────────────
  const [brokerStatuses, setBrokerStatuses] = useState(null) // null = loading
  const [brokerLoading, setBrokerLoading] = useState({})     // { alpaca: true }
  const [syncLoading, setSyncLoading] = useState({})         // { tradier: true }
  const [brokerMsg, setBrokerMsg] = useState({})             // { alpaca: { success, text } }
  const [alpacaForm, setAlpacaForm] = useState({ api_key: '', api_secret: '', is_paper: true })
  const [showSecret, setShowSecret] = useState(false)

  // ── Security ─────────────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' })
  const [pwStatus, setPwStatus] = useState(null)
  const [emailForm, setEmailForm] = useState({ email: '' })
  const [emailStatus, setEmailStatus] = useState(null)
  const [mfaFactors, setMfaFactors] = useState([])
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaData, setMfaData] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaStatus, setMfaStatus] = useState(null)
  const [sessionStatus, setSessionStatus] = useState(null)

  useEffect(() => {
    if (activeTab === 'Brokers') {
      loadBrokerStatuses()
      const params = new URLSearchParams(window.location.search)
      const justConnected = params.get('connected')
      const errorMsg = params.get('error')
      if (justConnected) {
        setBrokerMsg(m => ({ ...m, [justConnected]: { success: true, text: `${BROKER_LABELS[justConnected] || justConnected} connected successfully.` } }))
        window.history.replaceState({}, '', '/settings?tab=Brokers')
      }
      if (errorMsg) {
        setBrokerMsg(m => ({ ...m, _global: { success: false, error: decodeURIComponent(errorMsg) } }))
        window.history.replaceState({}, '', '/settings?tab=Brokers')
      }
    }
    if (activeTab === 'Security') loadMfaFactors()
  }, [activeTab])

  async function loadBrokerStatuses() {
    try {
      const data = await brokersApi.allStatus()
      setBrokerStatuses(data)
    } catch {
      setBrokerStatuses({})
    }
  }

  async function handleOAuthConnect(broker) {
    setBrokerLoading(l => ({ ...l, [broker]: true }))
    setBrokerMsg(m => ({ ...m, [broker]: null }))
    try {
      const { url } = await brokersApi.authorizeUrl(broker)
      window.location.href = url
    } catch (err) {
      setBrokerMsg(m => ({ ...m, [broker]: { success: false, error: err.message || 'Failed to initiate connection.' } }))
      setBrokerLoading(l => ({ ...l, [broker]: false }))
    }
  }

  async function handleSync(broker) {
    setSyncLoading(l => ({ ...l, [broker]: true }))
    setBrokerMsg(m => ({ ...m, [broker]: null }))
    try {
      const { imported, skipped } = await brokersApi.sync(broker)
      await loadBrokerStatuses()
      setBrokerMsg(m => ({ ...m, [broker]: { success: true, text: `Sync complete: ${imported} imported, ${skipped} skipped.` } }))
    } catch (err) {
      setBrokerMsg(m => ({ ...m, [broker]: { success: false, error: err.message || 'Sync failed.' } }))
    } finally {
      setSyncLoading(l => ({ ...l, [broker]: false }))
    }
  }

  async function handleDisconnect(broker) {
    const label = BROKER_LABELS[broker] || broker
    if (!confirm(`Remove ${label} connection? Your existing trades will not be deleted.`)) return
    setBrokerLoading(l => ({ ...l, [broker]: true }))
    setBrokerMsg(m => ({ ...m, [broker]: null }))
    try {
      await brokersApi.disconnect(broker)
      await loadBrokerStatuses()
      setBrokerMsg(m => ({ ...m, [broker]: { success: true, text: `${label} disconnected.` } }))
    } catch (err) {
      setBrokerMsg(m => ({ ...m, [broker]: { success: false, error: err.message || 'Failed to disconnect.' } }))
    } finally {
      setBrokerLoading(l => ({ ...l, [broker]: false }))
    }
  }

  async function loadMfaFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (!error) setMfaFactors(data?.totp ?? [])
  }

  // ── Backup handlers ───────────────────────────────────────────────────────────
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

  // ── Alpaca connect (credential-based) ────────────────────────────────────────
  async function handleAlpacaConnect(e) {
    e.preventDefault()
    if (!alpacaForm.api_key || !alpacaForm.api_secret) return
    setBrokerLoading(l => ({ ...l, alpaca: true }))
    setBrokerMsg(m => ({ ...m, alpaca: null }))
    try {
      await brokersApi.connect('alpaca', alpacaForm)
      await loadBrokerStatuses()
      setAlpacaForm({ api_key: '', api_secret: '', is_paper: true })
      setBrokerMsg(m => ({ ...m, alpaca: { success: true, text: 'Alpaca connected successfully.' } }))
    } catch (err) {
      setBrokerMsg(m => ({ ...m, alpaca: { success: false, error: err.message || 'Connection failed.' } }))
    } finally {
      setBrokerLoading(l => ({ ...l, alpaca: false }))
    }
  }

  // ── Security handlers ─────────────────────────────────────────────────────────
  async function handleChangePassword(e) {
    e.preventDefault()
    if (pwForm.password !== pwForm.confirm) {
      return setPwStatus({ success: false, error: 'Passwords do not match.' })
    }
    if (pwForm.password.length < 8) {
      return setPwStatus({ success: false, error: 'Password must be at least 8 characters.' })
    }
    setPwStatus('loading')
    const { error } = await supabase.auth.updateUser({ password: pwForm.password })
    if (error) {
      setPwStatus({ success: false, error: error.message })
    } else {
      setPwStatus({ success: true, text: 'Password updated successfully.' })
      setPwForm({ password: '', confirm: '' })
    }
  }

  async function handleChangeEmail(e) {
    e.preventDefault()
    if (!emailForm.email) return
    setEmailStatus('loading')
    const { error } = await supabase.auth.updateUser({ email: emailForm.email })
    if (error) {
      setEmailStatus({ success: false, error: error.message })
    } else {
      setEmailStatus({ success: true, text: 'Confirmation sent to both addresses. Check your inbox.' })
      setEmailForm({ email: '' })
    }
  }

  async function handleMfaEnroll() {
    setMfaLoading(true)
    setMfaStatus(null)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setMfaLoading(false)
    if (error) return setMfaStatus({ success: false, error: error.message })
    setMfaData({ id: data.id, totp: data.totp })
    setMfaEnrolling(true)
  }

  async function handleMfaVerify() {
    if (!mfaCode || !mfaData) return
    setMfaLoading(true)
    setMfaStatus(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaData.id,
      code: mfaCode,
    })
    setMfaLoading(false)
    if (error) {
      setMfaStatus({ success: false, error: error.message })
    } else {
      setMfaEnrolling(false)
      setMfaData(null)
      setMfaCode('')
      await loadMfaFactors()
      setMfaStatus({ success: true, text: '2FA enabled successfully.' })
    }
  }

  async function handleMfaUnenroll(factorId) {
    if (!confirm('Remove 2FA from your account?')) return
    setMfaLoading(true)
    setMfaStatus(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    setMfaLoading(false)
    if (error) {
      setMfaStatus({ success: false, error: error.message })
    } else {
      setMfaEnrolling(false)
      setMfaData(null)
      await loadMfaFactors()
      setMfaStatus({ success: true, text: '2FA removed from your account.' })
    }
  }

  async function handleSignOutOthers() {
    setSessionStatus('loading')
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) {
      setSessionStatus({ success: false, error: error.message })
    } else {
      setSessionStatus({ success: true, text: 'All other devices have been signed out.' })
    }
  }

  const activeFactor = mfaFactors.find(f => f.status === 'verified')

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your PulseJournal data and preferences.</p>
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

      {/* ── BACKUP & DATA ──────────────────────────────────────────────────────── */}
      {activeTab === 'Backup & Data' && <>
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
                <Download className="w-3.5 h-3.5" />
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
                <Download className="w-3.5 h-3.5" />
                Download .csv
              </button>
            </div>
          </div>
        </Section>

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
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400">Replace mode will permanently delete all existing trades, journal entries, and goals before restoring. This cannot be undone.</p>
              </div>
            )}

            {restoreStatus === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <BouncingDots size="sm" />
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
                <Upload className="w-4 h-4" />
                Choose Backup File
              </button>
              <span className="text-xs text-gray-600">Accepts .json backup files only</span>
            </div>
          </div>
        </Section>
      </>}

      {/* ── BROKERS ────────────────────────────────────────────────────────────── */}
      {activeTab === 'Brokers' && (
        <Section
          title="Broker Connections"
          description="Connect brokers to automatically sync your filled orders as trades."
        >
          {brokerStatuses === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <BouncingDots size="sm" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              <StatusBanner status={brokerMsg._global} />

              {/* Alpaca */}
              <BrokerCard label="Alpaca" type="credentials"
                note="Get API keys from alpaca.markets → Your Account → API Keys."
                status={brokerStatuses.alpaca} loading={brokerLoading.alpaca}
                syncing={syncLoading.alpaca} msg={brokerMsg.alpaca}
                onSync={() => handleSync('alpaca')} onDisconnect={() => handleDisconnect('alpaca')}
              >
                <form onSubmit={handleAlpacaConnect} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">API Key ID</label>
                    <input type="text" value={alpacaForm.api_key}
                      onChange={e => setAlpacaForm(f => ({ ...f, api_key: e.target.value }))}
                      placeholder="PKXXXXXXXXXXXXXXXXXX"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">API Secret Key</label>
                    <div className="relative">
                      <input type={showSecret ? 'text' : 'password'} value={alpacaForm.api_secret}
                        onChange={e => setAlpacaForm(f => ({ ...f, api_secret: e.target.value }))}
                        placeholder="••••••••••••••••••••"
                        className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                      />
                      <button type="button" onClick={() => setShowSecret(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">Account type:</span>
                    {[{ value: true, label: 'Paper' }, { value: false, label: 'Live' }].map(opt => (
                      <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="alpacaMode" checked={alpacaForm.is_paper === opt.value}
                          onChange={() => setAlpacaForm(f => ({ ...f, is_paper: opt.value }))}
                          className="accent-indigo-500" />
                        <span className="text-sm text-gray-300">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <button type="submit" disabled={brokerLoading.alpaca || !alpacaForm.api_key || !alpacaForm.api_secret}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                    {brokerLoading.alpaca ? <BouncingDots size="sm" /> : <Link2 className="w-4 h-4" />}
                    {brokerLoading.alpaca ? 'Connecting…' : 'Connect Alpaca'}
                  </button>
                </form>
              </BrokerCard>

              {/* Tradier */}
              <BrokerCard label="Tradier" type="oauth"
                note="Connect via Tradier OAuth. Supports sandbox (paper) and live accounts."
                status={brokerStatuses.tradier} loading={brokerLoading.tradier}
                syncing={syncLoading.tradier} msg={brokerMsg.tradier}
                onConnect={() => handleOAuthConnect('tradier')}
                onSync={() => handleSync('tradier')} onDisconnect={() => handleDisconnect('tradier')}
              />

              {/* Schwab */}
              <BrokerCard label="Schwab" type="oauth"
                note="Connect via Schwab OAuth. Requires a registered app at developer.schwab.com."
                status={brokerStatuses.schwab} loading={brokerLoading.schwab}
                syncing={syncLoading.schwab} msg={brokerMsg.schwab}
                onConnect={() => handleOAuthConnect('schwab')}
                onSync={() => handleSync('schwab')} onDisconnect={() => handleDisconnect('schwab')}
              />

              {/* TradeStation */}
              <BrokerCard label="TradeStation" type="oauth"
                note="Connect via TradeStation OAuth."
                status={brokerStatuses.tradestation} loading={brokerLoading.tradestation}
                syncing={syncLoading.tradestation} msg={brokerMsg.tradestation}
                onConnect={() => handleOAuthConnect('tradestation')}
                onSync={() => handleSync('tradestation')} onDisconnect={() => handleDisconnect('tradestation')}
              />

              {/* E*TRADE — coming soon */}
              <BrokerCard label="E*TRADE" type="oauth" comingSoon
                note="OAuth 1.0a integration — coming soon."
                status={brokerStatuses.etrade}
              />

              {/* Tradovate — coming soon */}
              <BrokerCard label="Tradovate" type="credentials" comingSoon
                note="Futures (CME). Credential-based integration — coming soon."
                status={brokerStatuses.tradovate}
              />
            </div>
          )}
        </Section>
      )}

      {/* ── SECURITY ───────────────────────────────────────────────────────────── */}
      {activeTab === 'Security' && <>
        {/* Change Password */}
        <Section
          title="Change Password"
          description="Update the password for your PulseJournal account."
        >
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">New Password</label>
              <div className="relative">
                <input
                  type="password"
                  value={pwForm.password}
                  onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Repeat new password"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {pwStatus === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <BouncingDots size="sm" /> Updating…
              </div>
            )}
            <StatusBanner status={pwStatus} />
            <button
              type="submit"
              disabled={pwStatus === 'loading' || !pwForm.password || !pwForm.confirm}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Lock className="w-4 h-4" />
              Update Password
            </button>
          </form>
        </Section>

        {/* Change Email */}
        <Section
          title="Change Email"
          description="Update your login email address. Supabase will send a confirmation to both addresses."
        >
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">New Email Address</label>
              <input
                type="email"
                value={emailForm.email}
                onChange={e => setEmailForm({ email: e.target.value })}
                placeholder="new@email.com"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {emailStatus === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <BouncingDots size="sm" /> Sending confirmation…
              </div>
            )}
            <StatusBanner status={emailStatus} />
            <button
              type="submit"
              disabled={emailStatus === 'loading' || !emailForm.email}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Mail className="w-4 h-4" />
              Update Email
            </button>
          </form>
        </Section>

        {/* Two-Factor Authentication */}
        <Section
          title="Two-Factor Authentication"
          description="Add an extra layer of security with an authenticator app (Google Authenticator, Authy, etc)."
        >
          <div className="space-y-4">
            {activeFactor && !mfaEnrolling ? (
              // 2FA active
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-800/40 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-400">2FA is active</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Your account is protected with TOTP authentication.</p>
                  </div>
                </div>
                <StatusBanner status={mfaStatus} />
                <button
                  onClick={() => handleMfaUnenroll(activeFactor.id)}
                  disabled={mfaLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-red-900/40 hover:text-red-400 border border-gray-700 text-gray-400 text-sm font-medium rounded-lg transition-colors"
                >
                  {mfaLoading ? <BouncingDots size="sm" /> : <Smartphone className="w-4 h-4" />}
                  Remove 2FA
                </button>
              </div>
            ) : mfaEnrolling && mfaData ? (
              // QR code / verify flow
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Scan the QR code in your authenticator app, then enter the 6-digit code to activate.</p>
                {mfaData.totp?.qr_code && (
                  <div className="flex justify-center p-4 bg-white rounded-xl w-fit">
                    <img src={mfaData.totp.qr_code} alt="2FA QR code" className="w-40 h-40" />
                  </div>
                )}
                {mfaData.totp?.secret && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Manual entry code</p>
                    <code className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 font-mono break-all">
                      {mfaData.totp.secret}
                    </code>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-36 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 tracking-widest text-center"
                  />
                </div>
                <StatusBanner status={mfaStatus} />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMfaVerify}
                    disabled={mfaLoading || mfaCode.length < 6}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {mfaLoading ? <BouncingDots size="sm" /> : <Shield className="w-4 h-4" />}
                    Activate 2FA
                  </button>
                  <button
                    onClick={() => { setMfaEnrolling(false); setMfaData(null); setMfaCode(''); setMfaStatus(null) }}
                    className="px-4 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Not enrolled
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
                  <Smartphone className="w-5 h-5 text-gray-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">2FA not enabled</p>
                    <p className="text-xs text-gray-500 mt-0.5">Enable two-factor authentication to secure your account.</p>
                  </div>
                </div>
                <StatusBanner status={mfaStatus} />
                <button
                  onClick={handleMfaEnroll}
                  disabled={mfaLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {mfaLoading ? <BouncingDots size="sm" /> : <Shield className="w-4 h-4" />}
                  Enable 2FA
                </button>
              </div>
            )}
          </div>
        </Section>

        {/* Active Sessions */}
        <Section
          title="Active Sessions"
          description="Sign out all other devices where your account is currently logged in."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
              <Monitor className="w-5 h-5 text-gray-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Other devices</p>
                <p className="text-xs text-gray-500 mt-0.5">Any browser or device with an active session will be signed out immediately.</p>
              </div>
            </div>
            <StatusBanner status={sessionStatus} />
            <button
              onClick={handleSignOutOthers}
              disabled={sessionStatus === 'loading' || sessionStatus?.success}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-red-900/40 hover:text-red-400 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {sessionStatus === 'loading' ? <BouncingDots size="sm" /> : <LogOut className="w-4 h-4" />}
              Sign out other devices
            </button>
          </div>
        </Section>
      </>}

      {/* ── ADVANCED ───────────────────────────────────────────────────────────── */}
      {activeTab === 'Advanced' && <>
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
        <p className="text-xs text-gray-600">PulseJournal v1.0 · Built with React + Express + SQLite</p>
        <p className="text-xs text-gray-700 mt-1">Your data is stored locally — no cloud, no subscriptions.</p>
      </div>
    </div>
  )
}
