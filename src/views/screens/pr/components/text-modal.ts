import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'

// Read-only text viewer modal (run job/step logs, merge errors). Title + a
// monospace <pre>, closable via the × button, backdrop click, or Escape.
// Imperative transient widget → plain DOM via el(); self-contained (§2.7).
export function showTextModal(title: string, text: string): void {
  const { overlay, mount, close, onClose } = createOverlay()

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))

  const modal = el(
    'div',
    { class: 'modal docker-text-modal' },
    makeCloseButton(close),
    el('h2', null, title),
    el('pre', { class: 'docker-pre' }, text || '(empty)')
  )
  overlay.appendChild(modal)

  mount()
}
