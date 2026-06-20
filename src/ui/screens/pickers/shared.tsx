import './pickers.css'
import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import type { OverlayModalHandle } from './shared.types'

export type { OverlayModalHandle } from './shared.types'
export { baseName } from './shared.state'

// The pickers' "contains" search box is exactly @crafterm/ui's search-box —
// re-exported under the legacy name so the per-picker modules consume one impl.
export { createSearchBox as makeSearchInput } from '@ui/components'

// Shared primitive for the picker family: a bare overlay+modal box with a close
// button. Built on @crafterm/ui's createOverlay (which owns the `.modal-overlay`
// backdrop + idempotent close), so the picker modals route through one place.
export function overlayModal(extraClass = ''): OverlayModalHandle {
  const base = createOverlay()
  const modal = (<div class={'modal ' + extraClass}>{makeCloseButton(base.close)}</div>) as HTMLElement
  base.overlay.appendChild(modal)
  base.mount()
  return { overlay: base.overlay, modal, close: base.close }
}
