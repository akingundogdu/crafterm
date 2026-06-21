import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import type { OverlayModalHandle } from '../shared.types'

// The bare overlay+modal box with a close button, used by the picker family.
// Built on @crafterm/ui's createOverlay (which owns the `.modal-overlay`
// backdrop + idempotent close), so the picker modals route through one place.
export function overlayModalShell(extraClass = ''): OverlayModalHandle {
  const base = createOverlay()
  const modal = (<div class={'modal ' + extraClass}>{makeCloseButton(base.close)}</div>) as HTMLElement
  base.overlay.appendChild(modal)
  base.mount()
  return { overlay: base.overlay, modal, close: base.close }
}
