import { NavLink, Link } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

const mainLinks = [
  { to: '/',            label: 'Dashboard',  end: true },
  { to: '/trades',      label: 'Trades' },
  { to: '/analytics',   label: 'Analytics' },
  { to: '/journal',     label: 'Journal' },
  { to: '/playbook',    label: 'Playbook' },
  { to: '/goals',       label: 'Goals' },
  { to: '/psychology',  label: 'Psychology' },
]

const moreLinks = [
  { to: '/calculator',    label: 'Position Calc' },
  { to: '/import-export', label: 'Import / Export' },
  { to: '/accounts',      label: 'Accounts' },
  { to: '/settings',      label: 'Settings' },
]

export default function TopNav() {
  const [showMore,       setShowMore]       = useState(false)
  const [mobileOpen,     setMobileOpen]     = useState(false)
  const moreRef    = useRef(null)
  const mobileRef  = useRef(null)

  useEffect(() => {
    function handle(e) {
      if (moreRef.current   && !moreRef.current.contains(e.target))   setShowMore(false)
      if (mobileRef.current && !mobileRef.current.contains(e.target)) setMobileOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const navItemCls = ({ isActive }) =>
    `px-3 py-1.5 rounded-full text-sm transition-all whitespace-nowrap select-none ${
      isActive
        ? 'text-white font-medium bg-white/[0.07]'
        : 'text-[#666] hover:text-[#ccc]'
    }`

  return (
    <>
      {/* ── Desktop pill nav ── */}
      <nav
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 hidden md:flex items-center gap-0.5 px-2 py-2"
        style={{
          background:   '#1a1a1a',
          border:       '1px solid rgba(255,255,255,0.09)',
          borderRadius: '999px',
          boxShadow:    '0 8px 40px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset',
          maxWidth:     'calc(100vw - 32px)',
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-0.5 mr-1 select-none"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
              border:     '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: 'var(--color-accent)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="text-white text-sm font-semibold tracking-tight">TradeLog</span>
        </Link>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />

        {/* Main nav links */}
        {mainLinks.map(link => (
          <NavLink key={link.to} to={link.to} end={link.end} className={navItemCls}>
            {link.label}
          </NavLink>
        ))}

        {/* More dropdown */}
        <div ref={moreRef} className="relative">
          <button
            onClick={() => setShowMore(v => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all select-none ${
              showMore ? 'text-white bg-white/[0.07]' : 'text-[#666] hover:text-[#ccc]'
            }`}
          >
            More
            <ChevronDown className={`w-3 h-3 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>

          {showMore && (
            <div
              className="absolute top-full mt-2 right-0 py-1.5 min-w-[168px]"
              style={{
                background:   '#1a1a1a',
                border:       '1px solid rgba(255,255,255,0.09)',
                borderRadius: '16px',
                boxShadow:    '0 16px 48px rgba(0,0,0,0.6)',
              }}
            >
              {moreLinks.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setShowMore(false)}
                  className={({ isActive }) =>
                    `block px-4 py-2 text-sm transition-colors ${
                      isActive ? 'text-white' : 'text-[#666] hover:text-white'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />

        {/* Log Trade CTA */}
        <NavLink
          to="/trades/new"
          className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap select-none"
          style={{ backgroundColor: 'var(--color-accent)', color: '#0a1a0a' }}
        >
          + Log Trade
        </NavLink>
      </nav>

      {/* ── Mobile pill nav ── */}
      <div
        ref={mobileRef}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 md:hidden flex items-center gap-2 px-3 py-2.5"
        style={{
          background:   '#1a1a1a',
          border:       '1px solid rgba(255,255,255,0.09)',
          borderRadius: '999px',
          boxShadow:    '0 8px 40px rgba(0,0,0,0.6)',
          maxWidth:     'calc(100vw - 24px)',
          width:        'calc(100vw - 24px)',
        }}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 flex-1">
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
              border:     '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            }}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: 'var(--color-accent)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="text-white text-sm font-semibold">TradeLog</span>
        </Link>

        {/* Log Trade (mobile) */}
        <NavLink
          to="/trades/new"
          className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: 'var(--color-accent)', color: '#0a1a0a' }}
        >
          + Log
        </NavLink>

        {/* Hamburger */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-1 text-[#666] hover:text-white transition-colors"
        >
          {mobileOpen
            ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
          }
        </button>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div
            className="absolute top-full mt-2 left-0 right-0 py-2"
            style={{
              background:   '#1a1a1a',
              border:       '1px solid rgba(255,255,255,0.09)',
              borderRadius: '20px',
              boxShadow:    '0 16px 48px rgba(0,0,0,0.7)',
            }}
          >
            {[...mainLinks, ...moreLinks].map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-5 py-2.5 text-sm transition-colors ${
                    isActive ? 'text-white font-medium' : 'text-[#666] hover:text-white'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
