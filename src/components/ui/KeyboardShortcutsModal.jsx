import { useEffect } from 'react'

const SHORTCUTS = [
  {
    section: 'Navigation',
    items: [
      { keys: ['g', 'h'], description: 'Go to Dashboard' },
      { keys: ['g', 't'], description: 'Go to Trade Log' },
      { keys: ['g', 'a'], description: 'Go to Analytics' },
      { keys: ['g', 'j'], description: 'Go to Journal' },
      { keys: ['g', 'p'], description: 'Go to Playbook' },
      { keys: ['g', 'g'], description: 'Go to Goals' },
    ],
  },
  {
    section: 'Actions',
    items: [
      { keys: ['n'], description: 'New trade' },
      { keys: ['Esc'], description: 'Close modal / go back' },
      { keys: ['/'], description: 'Focus search (Trade Log)' },
    ],
  },
  {
    section: 'General',
    items: [
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Ctrl', 'B'], description: 'Toggle sidebar' },
    ],
  },
]

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 bg-gray-800 border border-gray-600 rounded text-xs font-mono text-gray-200">
      {children}
    </kbd>
  )
}

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold text-lg">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {SHORTCUTS.map((section) => (
            <div key={section.section}>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                {section.section}
              </p>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-300">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 && <span className="text-gray-600 text-xs">+</span>}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">Press <Kbd>?</Kbd> at any time to show this modal</p>
        </div>
      </div>
    </div>
  )
}
