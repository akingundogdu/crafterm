import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { bindEscapeClose } from './detail-modal.state'

// Read-only text modal for Docker action/prune errors. Title + monospace <pre>,
// closable via the × button, backdrop click, or Escape. Imperative plain-DOM
// (a transient, self-managing overlay — no reactive state).
export function showTextModal(title: string, text: string): void {
  const { overlay, mount, close, onClose } = createOverlay()

  const modal = el(
    'div',
    { class: 'modal docker-text-modal' },
    makeCloseButton(close),
    el('h2', {}, title),
    el('pre', { class: 'docker-pre' }, text || '(empty)')
  )
  overlay.appendChild(modal)

  bindEscapeClose(close, onClose)
  mount()
}
