import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { accountsApi } from '../api/accounts.js'

const AccountContext = createContext(null)

export function useAccount() {
  return useContext(AccountContext)
}

const STORAGE_KEY = 'selected_account_id'

export function AccountProvider({ children }) {
  const [accounts, setAccounts]               = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number(stored) : null  // null = All Accounts
  })
  const [loading, setLoading] = useState(true)

  const loadAccounts = useCallback(async () => {
    try {
      const data = await accountsApi.list()
      setAccounts(data)
      // If stored account no longer exists, reset to all
      if (selectedAccountId !== null && !data.find(a => a.id === selectedAccountId)) {
        setSelectedAccountId(null)
        localStorage.removeItem(STORAGE_KEY)
      }
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => { loadAccounts() }, [])

  function selectAccount(id) {
    setSelectedAccountId(id)
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

  return (
    <AccountContext.Provider value={{
      accounts,
      selectedAccountId,
      selectedAccount,
      selectAccount,
      reloadAccounts: loadAccounts,
      loading,
    }}>
      {children}
    </AccountContext.Provider>
  )
}
