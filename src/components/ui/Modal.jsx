import { createPortal } from 'react-dom'
import { useOverlay } from './useOverlay.js'

/*
 * Rendered through a portal on `document.body`, never in place.
 *
 * Two things in the app shell break an in-place `position: fixed` overlay:
 *   1. The Liquid Dark theme puts `backdrop-filter` on every `.bg-gray-900`
 *      (src/index.css). That makes each card a containing block for fixed
 *      descendants, so a modal opened from inside one — a Wheel cycle card, a
 *      "needs attention" row — was sized and positioned against the card
 *      instead of the viewport, and clipped by the card's `overflow-hidden`.
 *   2. `<main>` carries `z-index: 10` and TopNav `z-50`, both at the root. A
 *      z-50 modal inside main is trapped in main's stacking context and can
 *      never paint above the floating nav pill.
 *
 * The portal escapes both: on `body` the fixed positioning is viewport
 * relative again, and z-100 clears TopNav. It stays under the DatePicker's
 * own portal (z-9999) so date fields inside a modal still work.
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useOverlay(isOpen, onClose)

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
