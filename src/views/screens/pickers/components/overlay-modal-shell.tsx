import { createOverlay } from '@views/components/overlay/overlay'
import type { OverlayModalHandle } from '../shared.types'

// The bare overlay+modal box with a close button, used by the picker family.
// Built on the @views createOverlay (which owns the `.modal-overlay` backdrop +
// idempotent close). The modal + close button are created synchronously
// (document.createElement in this .tsx) — pickers and happy-dom unit tests read
// the `.modal` node in the same tick, which gea's deferred render cannot promise.
export function overlayModalShell(extraClass = ''): OverlayModalHandle {
  const base = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal ' + extraClass

  const close = document.createElement('button')
  close.className = 'modal-close'
  close.type = 'button'
  close.setAttribute('aria-label', 'Close')
  close.title = 'Close (Esc)'
  close.textContent = '×'
  close.addEventListener('click', base.close)

  modal.appendChild(close)
  base.overlay.appendChild(modal)
  base.mount()
  return { overlay: base.overlay, modal, close: base.close }
}
