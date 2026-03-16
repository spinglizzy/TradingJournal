import { NavLink } from 'react-router-dom'
import AccountSwitcher from './AccountSwitcher.jsx'
import {
  LayoutDashboard, ClipboardList, PlusCircle, BarChart3,
  BookOpen, BookMarked, Target, Brain,
  Calculator, ArrowLeftRight, CreditCard, Settings,
  X
} from 'lucide-react'
import { PulseJournalLogo } from '../ui/PulseJournalLogo.jsx'

const links = [
  { to: '/dashboard',   label: 'Dashboard',  icon: <LayoutDashboard className="w-4 h-4 flex-shrink-0" /> },
  { to: '/trades',      label: 'Trade Log',  icon: <ClipboardList   className="w-4 h-4 flex-shrink-0" /> },
  { to: '/trades/new',  label: 'Log Trade',  icon: <PlusCircle      className="w-4 h-4 flex-shrink-0" />, highlight: true },
  { to: '/analytics',   label: 'Analytics',  icon: <BarChart3       className="w-4 h-4 flex-shrink-0" /> },
  { to: '/journal',     label: 'Journal',    icon: <BookOpen        className="w-4 h-4 flex-shrink-0" /> },
  { to: '/playbook',    label: 'Playbook',   icon: <BookMarked      className="w-4 h-4 flex-shrink-0" /> },
  { to: '/goals',       label: 'Goals',      icon: <Target          className="w-4 h-4 flex-shrink-0" /> },
  { to: '/psychology',  label: 'Psychology', icon: <Brain           className="w-4 h-4 flex-shrink-0" /> },
]

const toolLinks = [
  { to: '/calculator',    label: 'Position Calc',   icon: <Calculator      className="w-4 h-4 flex-shrink-0" /> },
  { to: '/import-export', label: 'Import / Export', icon: <ArrowLeftRight  className="w-4 h-4 flex-shrink-0" /> },
  { to: '/accounts',      label: 'Accounts',        icon: <CreditCard      className="w-4 h-4 flex-shrink-0" /> },
  { to: '/settings',      label: 'Settings',        icon: <Settings        className="w-4 h-4 flex-shrink-0" /> },
]

export default function Sidebar({ onClose }) {
  return (
    <aside
      className="w-60 shrink-0 h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--color-sidebar)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <PulseJournalLogo size="sm" />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Account Switcher */}
      <AccountSwitcher />

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/dashboard'}
            onClick={() => onClose?.()}
            className={({ isActive }) =>
              link.highlight
                ? 'nav-item nav-item-highlight'
                : isActive
                  ? 'nav-item nav-item-active'
                  : 'nav-item'
            }
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}

        {/* Tools section */}
        <div className="mt-4 mb-1.5 px-3">
          <span
            className="text-[10px] uppercase tracking-widest font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Tools
          </span>
        </div>
        {toolLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={() => onClose?.()}
            className={({ isActive }) =>
              isActive ? 'nav-item nav-item-active' : 'nav-item'
            }
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-5 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PulseJournal v1.0</p>
      </div>
    </aside>
  )
}
