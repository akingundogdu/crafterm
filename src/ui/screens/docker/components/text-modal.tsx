import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { bindEscapeClose } from './text-modal.state'

// Read-only text modal for Docker action/prune errors. Title + monospace <pre>,
// closable via the × button, backdrop click, or Escape.
export function showTextModal(title: string, text: string): void {
  const { overlay, mount, close, onClose } = createOverlay()

  const modal = (
    <div class="modal docker-text-modal">
      {makeCloseButton(close)}
      <h2 ref={(el: HTMLHeadingElement) => (el.textContent = title)} />
      <pre class="docker-pre" ref={(el: HTMLPreElement) => (el.textContent = text || '(empty)')} />
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  bindEscapeClose(close, onClose)
  mount()
}
