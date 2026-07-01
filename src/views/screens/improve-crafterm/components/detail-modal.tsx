import { Component } from '@geajs/core'

// Read-only detail modal body: shows a single backlog/ready/done entry in full,
// used when a one-line row is truncated and the user needs the whole text. gea
// port of the legacy createElement `.improve-detail-modal`; the overlay backdrop
// + Escape handling stay in the showDetail entry that mounts this. Instantiated
// imperatively, so it reads plain fields (fullText/close), not this.props.
// Self-contained — no @ui (§2.7).
export default class DetailModal extends Component {
  fullText: string
  close: () => void

  constructor(opts: { fullText: string; close: () => void }) {
    super()
    this.fullText = opts.fullText
    this.close = opts.close
  }

  template() {
    return (
      <div class="modal improve-detail-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => this.close()}
        >
          ×
        </button>
        <h2>Item detail</h2>
        <div class="improve-detail-body">{this.fullText}</div>
      </div>
    )
  }
}
