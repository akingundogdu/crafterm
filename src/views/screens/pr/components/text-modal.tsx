import { Component } from '@geajs/core'
import { createOverlay } from '@views/components/overlay/overlay'

// Read-only text viewer modal (run job/step logs, merge errors). Title + a
// monospace <pre>, closable via the × button, backdrop click, or Escape. Static
// (props only), so no store — data flows through the constructor into plain
// fields (a gea Component only populates `this.props` when rendered from a parent
// template, not from a manual `new X()`). Self-contained — no @ui (§2.7).
class TextModal extends Component {
  private readonly title: string
  private readonly text: string
  private readonly onCloseFn: () => void

  constructor(opts: { title: string; text: string; onClose: () => void }) {
    super()
    this.title = opts.title
    this.text = opts.text
    this.onCloseFn = opts.onClose
  }

  template() {
    return (
      <div class="modal docker-text-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => this.onCloseFn()}
        >
          ×
        </button>
        <h2>{this.title}</h2>
        <pre class="docker-pre">{this.text || '(empty)'}</pre>
      </div>
    )
  }
}

// Opens the gea text modal: a @views overlay backdrop with the gea TextModal body
// mounted inside. Signature preserved so every consumer resolves unchanged.
export function showTextModal(title: string, text: string): void {
  const ov = createOverlay()

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') ov.close()
  }
  document.addEventListener('keydown', onKey, true)
  ov.onClose(() => document.removeEventListener('keydown', onKey, true))

  new TextModal({ title, text, onClose: () => ov.close() }).render(ov.overlay)
  ov.mount()
}
