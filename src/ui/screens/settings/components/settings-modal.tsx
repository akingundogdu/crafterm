import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'

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
  const modal = (<div class="modal settings-modal" />) as HTMLDivElement
  overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(close))
  return { overlay, modal, mount, close, onClose }
}
