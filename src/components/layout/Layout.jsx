import { Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import TopNav from './TopNav.jsx'
import { StarsBackground } from '../ui/StarsBackground.jsx'
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
  const [showShortcuts,  setShowShortcuts]  = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const keyBuffer = useRef([])
  const keyTimer  = useRef(null)

  // Check onboarding on first mount
  useEffect(() => {
    if (isOnboarded()) return
    statsApi.summary({}).then(data => {
      if (!data || data.total_trades === 0) setShowOnboarding(true)
    }).catch(() => {})
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return

    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      setShowShortcuts(prev => !prev)
      return
    }
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
      flushSync(() => navigate('/trades/new'))
      return
    }
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
        flushSync(() => navigate(map[e.key]))
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-base)' }}>

      {/* ── Layer 0: stars background (fixed, behind everything) ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
        <StarsBackground starDensity={0.00012} minTwinkleSpeed={0.6} maxTwinkleSpeed={1.2} />
      </div>

      {/* ── Layer 50: floating top navigation ── */}
      <TopNav />

      {/* ── Layer 10: page content ── */}
      <main className="relative max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12" style={{ zIndex: 10 }}>
        <Outlet />
      </main>

      {/* ── Modals (z-50 via their own styles) ── */}
      <KeyboardShortcutsModal isOpen={showShortcuts}  onClose={() => setShowShortcuts(false)} />
      <OnboardingModal        isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* Floating shortcuts hint */}
      <button
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-4 right-4 z-20 w-8 h-8 rounded-full text-sm font-bold transition-all hidden md:flex items-center justify-center"
        style={{
          background: '#1a1a1a',
          border:     '1px solid rgba(255,255,255,0.09)',
          color:      '#555',
          boxShadow:  '0 4px 16px rgba(0,0,0,0.4)',
        }}
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
    </div>
  )
}
