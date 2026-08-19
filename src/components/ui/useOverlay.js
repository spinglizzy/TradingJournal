import { useEffect, useRef } from 'react'

/*
 * Body-scroll lock, refcounted so a ConfirmDialog opened on top of a Modal
 * does not unlock the page when only one of them closes.
 */
let openCount = 0
let savedOverflow = ''
let savedPadding  = ''

function lock() {
  if (openCount++ > 0) return
  const body = document.body
  savedOverflow = body.style.overflow
  savedPadding  = body.style.paddingRight
  // Compensate for the scrollbar we are about to remove, or the page shifts.
  const gutter = window.innerWidth - document.documentElement.clientWidth
  body.style.overflow = 'hidden'
  if (gutter > 0) body.style.paddingRight = `${gutter}px`
}

function unlock() {
  if (--openCount > 0) return
  openCount = 0
  document.body.style.overflow    = savedOverflow
  document.body.style.paddingRight = savedPadding
}

/**
 * Shared behaviour for every full-screen overlay: Escape to dismiss, and the
 * scroll lock above. `onClose` is held in a ref so an inline arrow function
 * from the caller does not re-run the effect — and thrash the lock — on every
 * render.
 */
export function useOverlay(isOpen, onClose) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', handler)
    lock()
    return () => {
      document.removeEventListener('keydown', handler)
      unlock()
    }
  }, [isOpen])
}
