import { Component } from '@geajs/core'

// A reusable "×" close button pinned to a modal's top-right corner (gea port of
// the @ui dialog makeCloseButton). The exported factory returns a detached
// HTMLButtonElement for the caller to append to its `.modal` element — a gea
// Component rendered into a throwaway host, then extracted (the @views jsx-runtime
// binds real listeners, so the onClick survives the move). Self-contained — no @ui.
class CloseButton extends Component {
  private readonly onClose: () => void

  constructor(onClose: () => void) {
    super()
    this.onClose = onClose
  }

  template() {
    return (
      <button class="modal-close" type="button" aria-label="Close" title="Close (Esc)" onClick={this.onClose}>
        ×
      </button>
    )
  }
}

export function makeCloseButton(onClose: () => void): HTMLButtonElement {
  const host = document.createElement('div')
  new CloseButton(onClose).render(host)
  return host.firstElementChild as HTMLButtonElement
}
