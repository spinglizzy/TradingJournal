import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Settings, Layers } from 'lucide-react'
import { useAccount } from '../../contexts/AccountContext.jsx'
import { useFlushNavigate } from '../../hooks/useFlushNavigate.js'

const CURRENCY_SYMBOL = { USD: '$', AUD: 'A$', GBP: '£', EUR: '€', CAD: 'C$', JPY: '¥', NZD: 'NZ$' }

export default function AccountSwitcher() {
  const { accounts, selectedAccountId, selectedAccount, selectAccount } = useAccount()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useFlushNavigate()

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const sym = CURRENCY_SYMBOL[selectedAccount?.currency] ?? '$'
  const balance = selectedAccount?.current_balance ?? 0

  return (
    <div className="px-3 py-2 border-b border-gray-800" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-700 transition-all group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
            selectedAccountId === null ? 'bg-indigo-500/15 text-indigo-400' : 'bg-emerald-500/15 text-emerald-400'
          }`}>
            {selectedAccountId === null
              ? <Layers className="w-3.5 h-3.5" />
              : <span className="text-xs font-bold">{(selectedAccount?.name?.[0] ?? 'A').toUpperCase()}</span>
            }
          </div>
          <div className="min-w-0 text-left">
            <div className="text-xs font-semibold text-white truncate">
              {selectedAccountId === null ? 'All Accounts' : (selectedAccount?.name ?? 'Account')}
            </div>
            {selectedAccountId !== null && selectedAccount && (
              <div className="text-[10px] text-gray-500 truncate">
                {sym}{balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} · {selectedAccount.broker_name || selectedAccount.currency}
              </div>
            )}
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1.5 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 relative">
          {/* All Accounts */}
          <button
            onClick={() => { selectAccount(null); setOpen(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
              selectedAccountId === null
                ? 'bg-indigo-600/15 text-indigo-300'
                : 'text-gray-300 hover:bg-gray-700/60'
            }`}
          >
            <div className="w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
              <Layers className="w-3 h-3" />
            </div>
            <span className="font-medium">All Accounts</span>
            {selectedAccountId === null && <span className="ml-auto text-indigo-400 text-xs">✓</span>}
          </button>

          {accounts.length > 0 && <div className="border-t border-gray-700/50 my-0.5" />}

          {/* Individual accounts */}
          {accounts.map(acct => {
            const s = CURRENCY_SYMBOL[acct.currency] ?? '$'
            const bal = acct.current_balance ?? 0
            const isSelected = selectedAccountId === acct.id
            return (
              <button
                key={acct.id}
                onClick={() => { selectAccount(acct.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  isSelected ? 'bg-indigo-600/15 text-indigo-300' : 'text-gray-300 hover:bg-gray-700/60'
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 text-xs font-bold">
                  {(acct.name?.[0] ?? 'A').toUpperCase()}
                </div>
                <div className="min-w-0 text-left">
                  <div className="font-medium truncate">{acct.name}</div>
                  <div className="text-[10px] text-gray-500">{s}{bal.toLocaleString()} · {acct.broker_name || acct.currency}</div>
                </div>
                {isSelected && <span className="ml-auto text-indigo-400 text-xs shrink-0">✓</span>}
              </button>
            )
          })}

          <div className="border-t border-gray-700/50 mt-0.5 p-1.5 flex gap-1">
            <button
              onClick={() => { navigate('/accounts'); setOpen(false) }}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/60 rounded-lg transition-colors"
            >
              <Settings className="w-3 h-3" />
              Manage
            </button>
            <button
              onClick={() => { navigate('/accounts?new=1'); setOpen(false) }}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/60 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" />
              New Account
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
