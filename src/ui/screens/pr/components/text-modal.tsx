import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { bindEscapeClose } from './text-modal.state'

// Read-only text viewer modal (run job/step logs, merge errors). Title + a
// monospace <pre>, closable via the × button, backdrop click, or Escape.
export function showTextModal(title: string, text: string): void {
  const { overlay, mount, close, onClose } = createOverlay()
  bindEscapeClose(close, onClose)

  const modal = (
    <div class="modal docker-text-modal">
      {makeCloseButton(close)}
      <h2>{title}</h2>
      <pre class="docker-pre">{text || '(empty)'}</pre>
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  mount()
}
