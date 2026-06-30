import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'

// Builds the settings overlay + `.settings-modal` shell with its close button,
// returning the overlay/modal handles plus mount/close/onClose for the caller.
export function createSettingsModal(): {
  overlay: HTMLElement
  modal: HTMLDivElement
  mount: () => void
  close: () => void
  onClose: (fn: () => void) => void
} {
  const { overlay, mount, close, onClose } = createOverlay()
  const modal = el('div', { class: 'modal settings-modal' })
  overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(close))
  return { overlay, modal, mount, close, onClose }
}
