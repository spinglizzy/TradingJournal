import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { accountsApi } from '../../api/accounts.js'

const CURRENCIES = ['USD', 'AUD', 'GBP', 'EUR', 'CAD', 'JPY', 'NZD', 'CHF', 'SGD', 'HKD']

const ONBOARDING_KEY = 'tradelog_onboarded'

export function markOnboarded() {
  localStorage.setItem(ONBOARDING_KEY, '1')
}

export function isOnboarded() {
  return localStorage.getItem(ONBOARDING_KEY) === '1'
}

export default function OnboardingModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm]     = useState({
    name: 'My Trading Account',
    broker_name: '',
    currency: 'USD',
    starting_balance: '',
  })
  const [error, setError] = useState('')

  if (!isOpen) return null

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  async function createAccount() {
    if (!form.name.trim()) { setError('Account name is required'); return }
    setSaving(true)
    try {
      await accountsApi.create({
        name: form.name.trim(),
        broker_name: form.broker_name.trim(),
        currency: form.currency,
        starting_balance: form.starting_balance ? parseFloat(form.starting_balance) : 0,
        commission_type: 'fixed',
        commission_value: 0,
        pnl_method: 'basic',
        is_default: 1,
      })
      setStep(1)
    } catch (e) {
      setError('Failed to create account. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function finish(action) {
    markOnboarded()
    onClose()
    if (action === 'trade') navigate('/trades/new')
    else if (action === 'import') navigate('/import-export')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md">

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 pt-6 pb-4">
          {[0, 1].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-indigo-500' : 'bg-gray-700'}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="px-6 pb-6">
            {/* Welcome header */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Welcome to TradeLog</h2>
              <p className="text-sm text-gray-400 mt-1">Let's set up your first trading account to get started.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Account Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="e.g. Main Account"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Broker (optional)</label>
                <input
                  type="text"
                  value={form.broker_name}
                  onChange={e => update('broker_name', e.target.value)}
                  placeholder="e.g. Interactive Brokers"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Currency</label>
                  <select
                    value={form.currency}
                    onChange={e => update('currency', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Starting Balance</label>
                  <input
                    type="number"
                    value={form.starting_balance}
                    onChange={e => update('starting_balance', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                onClick={createAccount}
                disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm rounded-lg transition-colors mt-2"
              >
                {saving ? 'Creating…' : 'Create Account →'}
              </button>

              <button
                onClick={() => { markOnboarded(); onClose() }}
                className="w-full py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                Skip setup
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="px-6 pb-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Account Created!</h2>
              <p className="text-sm text-gray-400 mt-1">How would you like to add your first trade?</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => finish('trade')}
                className="w-full p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500/50 rounded-xl transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-600/20 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Enter a trade manually</p>
                    <p className="text-xs text-gray-500 mt-0.5">Log a single trade with full details</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => finish('import')}
                className="w-full p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500/50 rounded-xl transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-600/20 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Import from CSV</p>
                    <p className="text-xs text-gray-500 mt-0.5">Upload a broker export or spreadsheet</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => finish('dashboard')}
                className="w-full py-2.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                Take me to the dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
