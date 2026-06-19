import { createOverlay } from '@ui/components'
import { makeCloseButton } from '../../../dialog'

// Read-only text viewer modal (run job/step logs, merge errors). Title + a
// monospace <pre>, closable via the × button, backdrop click, or Escape.
export function showTextModal(title: string, text: string): void {
  const { overlay, mount, close, onClose } = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal docker-text-modal'
  overlay.appendChild(modal)

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))

  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = title
  modal.appendChild(h)
  const pre = document.createElement('pre')
  pre.className = 'docker-pre'
  pre.textContent = text || '(empty)'
  modal.appendChild(pre)

  mount()
}
