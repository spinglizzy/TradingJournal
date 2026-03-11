import { useState, useCallback, useEffect } from 'react'

const PROFILES_KEY = 'tradelog_risk_profiles'

const DEFAULT_PROFILES = [
  { id: 'conservative', name: 'Conservative', balance: 10000, riskPercent: 1 },
  { id: 'moderate',     name: 'Moderate',     balance: 10000, riskPercent: 2 },
  { id: 'aggressive',   name: 'Aggressive',   balance: 10000, riskPercent: 3 },
]

function loadProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? 'null')
    return saved ?? DEFAULT_PROFILES
  } catch { return DEFAULT_PROFILES }
}

function saveProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

// ── Calculation engine ────────────────────────────────────────────────────────
function calculate({ balance, riskPercent, entry, stop, direction }) {
  const b  = parseFloat(balance)
  const rp = parseFloat(riskPercent)
  const e  = parseFloat(entry)
  const s  = parseFloat(stop)

  if (!b || !rp || !e || !s || b <= 0 || rp <= 0 || e <= 0 || s <= 0) return null
  if (e === s) return null

  const dollarRisk = b * (rp / 100)
  const stopDist   = Math.abs(e - s)
  const size       = dollarRisk / stopDist
  const posValue   = size * e
  const leverage   = posValue / b

  // Auto-detect direction from stop position if not provided
  const dir = direction || (s < e ? 'long' : 'short')
  const dirMult = dir === 'long' ? 1 : -1

  const targets = [1, 1.5, 2, 3, 5].map(r => {
    const targetPrice = e + dirMult * stopDist * r
    const pnl         = dirMult * (targetPrice - e) * size
    return { r, targetPrice, pnl }
  })

  return { dollarRisk, stopDist, size, posValue, leverage, dir, targets }
}

// ── Profile modal ─────────────────────────────────────────────────────────────
function ProfileModal({ onClose, onApply }) {
  const [profiles, setProfiles]   = useState(loadProfiles)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState({ name: '', balance: '', riskPercent: '' })

  function saveProfile() {
    if (!form.name.trim() || !form.balance || !form.riskPercent) return
    let updated
    if (editId) {
      updated = profiles.map(p => p.id === editId
        ? { ...p, name: form.name.trim(), balance: +form.balance, riskPercent: +form.riskPercent }
        : p
      )
    } else {
      updated = [...profiles, {
        id: `p-${Date.now()}`,
        name: form.name.trim(),
        balance: +form.balance,
        riskPercent: +form.riskPercent,
      }]
    }
    setProfiles(updated)
    saveProfiles(updated)
    setForm({ name: '', balance: '', riskPercent: '' })
    setEditId(null)
  }

  function deleteProfile(id) {
    const updated = profiles.filter(p => p.id !== id)
    setProfiles(updated)
    saveProfiles(updated)
  }

  function startEdit(p) {
    setEditId(p.id)
    setForm({ name: p.name, balance: String(p.balance), riskPercent: String(p.riskPercent) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Risk Profiles</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Profile list */}
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-800/60 rounded-lg border border-gray-700/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-gray-500">${p.balance.toLocaleString()} · {p.riskPercent}% risk</p>
                </div>
                <button
                  onClick={() => onApply(p)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors"
                >
                  Use
                </button>
                <button onClick={() => startEdit(p)} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => deleteProfile(p.id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Add/edit form */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 mb-3">{editId ? 'Edit profile' : 'New profile'}</p>
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="col-span-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="number" placeholder="Balance" value={form.balance}
                onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="number" placeholder="Risk %" step="0.1" value={form.riskPercent}
                onChange={e => setForm(f => ({ ...f, riskPercent: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={saveProfile}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg px-3 py-2 transition-colors"
              >
                {editId ? 'Save' : 'Add'}
              </button>
            </div>
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ name:'',balance:'',riskPercent:'' }) }} className="text-xs text-gray-500 hover:text-gray-300 mt-2">
                Cancel edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Calculator ───────────────────────────────────────────────────────────
export default function PositionCalculator({ prefill, onApplySize, compact = false }) {
  const [balance,     setBalance]     = useState(prefill?.balance     ?? '10000')
  const [riskPercent, setRiskPercent] = useState(prefill?.riskPercent ?? '1')
  const [entry,       setEntry]       = useState(prefill?.entry       ?? '')
  const [stop,        setStop]        = useState(prefill?.stop        ?? '')
  const [direction,   setDirection]   = useState(prefill?.direction   ?? 'long')
  const [showProfiles, setShowProfiles] = useState(false)

  // Update when prefill changes (from TradeForm integration)
  useEffect(() => {
    if (prefill?.entry)     setEntry(String(prefill.entry))
    if (prefill?.stop)      setStop(String(prefill.stop))
    if (prefill?.direction) setDirection(prefill.direction)
  }, [prefill?.entry, prefill?.stop, prefill?.direction])

  const result = calculate({ balance, riskPercent, entry, stop, direction })

  function applyProfile(p) {
    setBalance(String(p.balance))
    setRiskPercent(String(p.riskPercent))
    setShowProfiles(false)
  }

  const inp = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

  return (
    <div className="space-y-5">
      {/* Header with profile selector */}
      <div className="flex items-center justify-between">
        {!compact && (
          <h2 className="text-lg font-semibold text-white">Position Size Calculator</h2>
        )}
        <button
          onClick={() => setShowProfiles(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs font-medium rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
          Profiles
        </button>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Account Balance ($)</label>
          <input type="number" value={balance} onChange={e => setBalance(e.target.value)}
            placeholder="10000" min="0" step="100" className={inp} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Risk Per Trade (%)</label>
          <input type="number" value={riskPercent} onChange={e => setRiskPercent(e.target.value)}
            placeholder="1" min="0.1" max="100" step="0.1" className={inp} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Entry Price</label>
          <input type="number" value={entry} onChange={e => setEntry(e.target.value)}
            placeholder="0.00" min="0" step="any" className={inp} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Stop Loss Price</label>
          <input type="number" value={stop} onChange={e => setStop(e.target.value)}
            placeholder="0.00" min="0" step="any" className={inp} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Direction</label>
          <div className="flex gap-2">
            {['long', 'short'].map(d => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${
                  direction === d
                    ? d === 'long'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {d === 'long' ? '↑ Long' : '↓ Short'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-4">
          {/* Primary output */}
          <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">Position Size</p>
                <p className="text-xl font-bold font-mono text-white">
                  {result.size.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500">shares/units</p>
              </div>
              <div className="text-center border-x border-indigo-500/20">
                <p className="text-xs text-gray-400 mb-1">Dollar Risk</p>
                <p className="text-xl font-bold font-mono text-red-400">
                  ${result.dollarRisk.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500">{riskPercent}% of balance</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">Position Value</p>
                <p className="text-xl font-bold font-mono text-white">
                  ${result.posValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500">{result.leverage.toFixed(1)}× leverage</p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-indigo-500/20 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Stop distance</span>
                <span className="font-mono text-gray-300">
                  ${result.stopDist.toFixed(4)} ({((result.stopDist / parseFloat(entry)) * 100).toFixed(2)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Direction</span>
                <span className={`font-medium capitalize ${result.dir === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.dir}
                </span>
              </div>
            </div>

            {onApplySize && (
              <button
                onClick={() => onApplySize(result.size)}
                className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Use this size →
              </button>
            )}
          </div>

          {/* R-target table */}
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">R-Multiple Targets</p>
            <div className="overflow-hidden border border-gray-800 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/30">
                    <th className="text-left text-xs text-gray-500 font-medium py-2.5 px-4">Target</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2.5 px-4">Price</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2.5 px-4">P&L</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2.5 px-4">Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {result.targets.map(t => (
                    <tr key={t.r} className="hover:bg-gray-800/20 transition-colors">
                      <td className="py-2.5 px-4">
                        <span className="text-gray-300 font-medium">{t.r}R</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-300">
                        ${t.targetPrice.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-400">
                        +${t.pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-400">
                        {((t.pnl / parseFloat(balance)) * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                  {/* Break-even / stop row */}
                  <tr className="bg-red-500/5">
                    <td className="py-2.5 px-4"><span className="text-gray-500">Stop</span></td>
                    <td className="py-2.5 px-4 text-right font-mono text-gray-500">${parseFloat(stop).toFixed(4)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-red-400">
                      -${result.dollarRisk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-gray-500">-{riskPercent}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6 text-center">
          <p className="text-gray-500 text-sm">Enter account balance, risk %, entry price, and stop loss to calculate.</p>
        </div>
      )}

      {showProfiles && (
        <ProfileModal
          onClose={() => setShowProfiles(false)}
          onApply={applyProfile}
        />
      )}
    </div>
  )
}
