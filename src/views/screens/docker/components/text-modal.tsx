import { Component } from '@geajs/core'
import { createOverlay } from '@views/components/overlay/overlay'
import { bindEscapeClose } from './detail-modal.store'

// Read-only text modal for Docker action/prune errors. Title + monospace <pre>,
// closable via the × button, backdrop click, or Escape. gea Component (§2.7):
// static props via constructor fields (a manual `new X()` never populates
// `this.props`), mounted into a @views overlay backdrop. Self-contained — no @ui.
export default class TextModal extends Component {
  private readonly heading: string
  private readonly bodyText: string
  private readonly onCloseFn: () => void

  constructor(opts: { heading: string; bodyText: string; onClose: () => void }) {
    super()
    this.heading = opts.heading
    this.bodyText = opts.bodyText
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
        <h2>{this.heading}</h2>
        <pre class="docker-pre">{this.bodyText || '(empty)'}</pre>
      </div>
    )
  }
}

// Opens the gea text modal: a @views overlay backdrop with the gea TextModal body
// mounted inside. Signature preserved so docker.store consumers resolve unchanged.
export function showTextModal(title: string, text: string): void {
  const ov = createOverlay()
  new TextModal({ heading: title, bodyText: text, onClose: () => ov.close() }).render(ov.overlay)
  bindEscapeClose(ov.close, ov.onClose)
  ov.mount()
}
