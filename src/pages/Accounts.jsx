import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { accountsApi } from '../api/accounts.js'
import { useAccount } from '../contexts/AccountContext.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Modal from '../components/ui/Modal.jsx'

const CURRENCIES = ['USD', 'AUD', 'GBP', 'EUR', 'CAD', 'JPY', 'NZD', 'CHF', 'SGD', 'HKD']
const CURRENCY_SYMBOL = { USD: '$', AUD: 'A$', GBP: '£', EUR: '€', CAD: 'C$', JPY: '¥', NZD: 'NZ$', CHF: 'Fr', SGD: 'S$', HKD: 'HK$' }
const inputCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors`

function AccountForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', broker_name: '', currency: 'USD', starting_balance: 0,
    commission_type: 'fixed', commission_value: 0, pnl_method: 'basic', is_default: 0,
    ...initial,
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    await onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Account Name *</label>
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Main Trading Account" required />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Broker Name</label>
          <input className={inputCls} value={form.broker_name} onChange={e => set('broker_name', e.target.value)}
            placeholder="e.g. Interactive Brokers" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Currency</label>
          <select className={inputCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Starting Balance</label>
          <input type="number" step="0.01" min="0" className={inputCls} value={form.starting_balance}
            onChange={e => set('starting_balance', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">P&L Method</label>
          <select className={inputCls} value={form.pnl_method} onChange={e => set('pnl_method', e.target.value)}>
            <option value="basic">Basic (entry × exit)</option>
            <option value="fifo">FIFO</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Default Commission Type</label>
          <select className={inputCls} value={form.commission_type} onChange={e => set('commission_type', e.target.value)}>
            <option value="fixed">Fixed per trade</option>
            <option value="per_share">Per share</option>
            <option value="percent">Percentage</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Commission Value</label>
          <input type="number" step="0.001" min="0" className={inputCls} value={form.commission_value}
            onChange={e => set('commission_value', e.target.value)} placeholder="0.00" />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(form.is_default)}
              onChange={e => set('is_default', e.target.checked ? 1 : 0)}
              className="w-4 h-4 accent-indigo-600" />
            <span className="text-sm text-gray-300">Set as default account for new trades</span>
          </label>
        </div>
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
          {initial?.id ? 'Update Account' : 'Create Account'}
        </button>
      </div>
    </form>
  )
}

function TransactionModal({ account, onClose, onAdded }) {
  const [form, setForm] = useState({ type: 'deposit', amount: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const sym = CURRENCY_SYMBOL[account.currency] ?? '$'

  useEffect(() => {
    accountsApi.transactions(account.id).then(setTransactions).finally(() => setLoading(false))
  }, [account.id])

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.amount || !form.date) return
    await accountsApi.addTransaction(account.id, { ...form, amount: Number(form.amount) })
    const data = await accountsApi.transactions(account.id)
    setTransactions(data)
    setForm(f => ({ ...f, amount: '', notes: '' }))
    onAdded()
  }

  async function handleDelete() {
    await accountsApi.delTransaction(account.id, deleteId)
    setTransactions(t => t.filter(x => x.id !== deleteId))
    setDeleteId(null)
    onAdded()
  }

  return (
    <Modal isOpen onClose={onClose} title={`Transactions — ${account.name}`}>
      <div className="space-y-5">
        {/* Add transaction form */}
        <form onSubmit={handleAdd} className="bg-gray-800/50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Add Transaction</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount ({sym})</label>
              <input type="number" step="0.01" min="0" required className={inputCls} value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" required className={inputCls} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <input className={inputCls} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)" />
          <button type="submit"
            className="w-full py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
            Add {form.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
          </button>
        </form>

        {/* Transaction history */}
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">History</h3>
          {loading ? <LoadingSpinner className="h-20" /> : transactions.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">No transactions yet</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-800/50 text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {tx.type}
                    </span>
                    <span className="text-gray-400">{tx.date}</span>
                    {tx.notes && <span className="text-gray-500 text-xs">{tx.notes}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-medium ${tx.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.type === 'deposit' ? '+' : '-'}{sym}{Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <button onClick={() => setDeleteId(tx.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Transaction"
        message="Remove this transaction? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </Modal>
  )
}

export default function Accounts() {
  const [searchParams] = useSearchParams()
  const { accounts, reloadAccounts } = useAccount()
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1')
  const [editAccount, setEditAccount] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [txAccount, setTxAccount] = useState(null)

  async function handleCreate(form) {
    await accountsApi.create(form)
    await reloadAccounts()
    setShowForm(false)
  }

  async function handleUpdate(form) {
    await accountsApi.update(editAccount.id, form)
    await reloadAccounts()
    setEditAccount(null)
  }

  async function handleDelete() {
    await accountsApi.delete(deleteId)
    await reloadAccounts()
    setDeleteId(null)
  }

  const sym = (acc) => CURRENCY_SYMBOL[acc.currency] ?? '$'
  const fmt = (n) => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your trading accounts and track balances</p>
        </div>
        {!showForm && !editAccount && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Account
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">New Account</h2>
          <AccountForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Account list */}
      {accounts.length === 0 && !showForm ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center card-glow">
          <div className="text-4xl mb-3">🏦</div>
          <h3 className="text-lg font-semibold text-white mb-1">No accounts yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first account to start tracking per-account performance</p>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            Create Account
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts.map(account => {
            const s = sym(account)
            const balance = account.current_balance ?? 0
            const pnl = account.realized_pnl ?? 0
            const positive = balance >= account.starting_balance
            return (
              <div key={account.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-glow">
                {editAccount?.id === account.id ? (
                  <>
                    <h3 className="text-sm font-semibold text-gray-300 mb-4">Edit Account</h3>
                    <AccountForm initial={account} onSave={handleUpdate} onCancel={() => setEditAccount(null)} />
                  </>
                ) : (
                  <div className="flex items-start gap-5">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 text-xl font-bold">
                      {(account.name?.[0] ?? 'A').toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-base font-semibold text-white">{account.name}</h3>
                        {account.is_default ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-medium">Default</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-500">{account.broker_name || 'No broker'} · {account.currency} · {account.pnl_method.toUpperCase()} · {account.commission_type}</p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-0.5">Balance</div>
                        <div className={`text-lg font-bold font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {s}{fmt(balance)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-0.5">Realized P&L</div>
                        <div className={`text-sm font-mono font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnl >= 0 ? '+' : ''}{s}{fmt(pnl)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-0.5">Trades</div>
                        <div className="text-sm font-medium text-white">{account.trade_count ?? 0}</div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button onClick={() => setTxAccount(account)}
                          className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                          Transactions
                        </button>
                        <button onClick={() => setEditAccount(account)}
                          className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                          Edit
                        </button>
                        <button onClick={() => setDeleteId(account.id)}
                          className="px-2.5 py-1.5 text-xs text-red-500 hover:text-red-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Account"
        message="This will permanently delete the account and all its transactions. Trades will not be deleted but will be unlinked. This cannot be undone."
        confirmLabel="Delete Account"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {txAccount && (
        <TransactionModal
          account={txAccount}
          onClose={() => setTxAccount(null)}
          onAdded={reloadAccounts}
        />
      )}
    </div>
  )
}
