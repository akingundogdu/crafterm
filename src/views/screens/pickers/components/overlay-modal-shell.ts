import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { el } from '@views/lib/dom'
import type { OverlayModalHandle } from '../shared.types'

// The bare overlay+modal box with a close button, used by the picker family.
// Built on the @views createOverlay (which owns the `.modal-overlay` backdrop +
// idempotent close), so the picker modals route through one place. Plain-DOM
// (§5): mirrors the legacy overlayModalShell with `el()` instead of JSX.
export function overlayModalShell(extraClass = ''): OverlayModalHandle {
  const base = createOverlay()
  const modal = el('div', { class: 'modal ' + extraClass }, makeCloseButton(base.close))
  base.overlay.appendChild(modal)
  base.mount()
  return { overlay: base.overlay, modal, close: base.close }
}
