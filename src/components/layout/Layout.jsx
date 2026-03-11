import { Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './Sidebar.jsx'
import { AccountProvider } from '../../contexts/AccountContext.jsx'
import { ThemeProvider } from '../../contexts/ThemeContext.jsx'
import KeyboardShortcutsModal from '../ui/KeyboardShortcutsModal.jsx'
import OnboardingModal, { isOnboarded } from '../onboarding/OnboardingModal.jsx'
import { statsApi } from '../../api/stats.js'

export default function Layout() {
  return (
    <ThemeProvider>
      <AccountProvider>
        <LayoutInner />
      </AccountProvider>
    </ThemeProvider>
  )
}

function LayoutInner() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const keyBuffer = useRef([])
  const keyTimer = useRef(null)

  // Check onboarding on first mount
  useEffect(() => {
    if (isOnboarded()) return
    // Only show if there are no trades
    statsApi.summary({}).then(data => {
      if (!data || data.total_trades === 0) {
        setShowOnboarding(true)
      }
    }).catch(() => {})
  }, [])

  // Responsive: auto-collapse sidebar on small screens
  useEffect(() => {
    function handleResize() {
      setSidebarOpen(window.innerWidth >= 1024)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    // Don't intercept when typing in inputs
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return

    // "?" → show shortcuts
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      setShowShortcuts(prev => !prev)
      return
    }

    // Ctrl+B → toggle sidebar
    if (e.key === 'b' && e.ctrlKey) {
      e.preventDefault()
      setSidebarOpen(prev => !prev)
      return
    }

    // 'n' → new trade
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
      navigate('/trades/new')
      return
    }

    // Two-key combos: g+h, g+t, g+a, g+j, g+p, g+g
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      keyBuffer.current = ['g']
      clearTimeout(keyTimer.current)
      keyTimer.current = setTimeout(() => { keyBuffer.current = [] }, 1000)
      return
    }

    if (keyBuffer.current[0] === 'g') {
      const map = { h: '/', t: '/trades', a: '/analytics', j: '/journal', p: '/playbook', g: '/goals' }
      if (map[e.key]) {
        e.preventDefault()
        navigate(map[e.key])
        keyBuffer.current = []
        clearTimeout(keyTimer.current)
      }
    }
  }, [navigate])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex min-h-screen bg-gray-950" style={{ backgroundColor: 'var(--color-base)' }}>
      {/* Mobile overlay */}
      {!sidebarOpen ? null : (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-30 transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarOpen ? 'lg:block' : 'lg:hidden'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile header bar */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gray-950/95 backdrop-blur border-b border-gray-800/60 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-white font-semibold text-sm">TradeLog</span>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>

      {/* Keyboard shortcuts modal */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Onboarding modal */}
      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* Floating shortcut hint */}
      <button
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-4 right-4 z-20 w-8 h-8 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full text-gray-400 hover:text-white text-sm font-bold transition-colors shadow-lg hidden md:flex items-center justify-center"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
    </div>
  )
}
