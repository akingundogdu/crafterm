import './pickers.css'
import { createOverlay } from '@ui/components'
import { makeCloseButton } from '../../dialog'

// Shared primitive for the picker family: a bare overlay+modal box with a close
// button. Built on @crafterm/ui's createOverlay (which owns the `.modal-overlay`
// backdrop + idempotent close), so the picker modals route through one place.
export function overlayModal(extraClass = ''): {
  overlay: HTMLElement
  modal: HTMLElement
  close: () => void
} {
  const base = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal ' + extraClass
  base.overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(base.close))
  base.mount()
  return { overlay: base.overlay, modal, close: base.close }
}

// Last path segment (the directory/file name), tolerant of a trailing slash.
export function baseName(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}

// The pickers' "contains" search box is exactly @crafterm/ui's search-box —
// re-exported under the legacy name so the per-picker modules consume one impl.
export { createSearchBox as makeSearchInput } from '@ui/components'
