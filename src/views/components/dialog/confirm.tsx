import { Component } from '@geajs/core'
import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'

// Self-contained (§2.7) yes/no confirmation modal. Resolves true if confirmed,
// false on cancel / backdrop / Escape. Byte-faithful to the legacy promptConfirm:
// `.modal-overlay > .modal.modal-prompt` with `h2 → message → actions(Cancel +
// primary confirm)`, modal-scoped Enter=confirm / Escape=cancel, and the confirm
// button focused. The backdrop is built by the @views overlay primitive.
export interface PromptConfirmOptions {
  title: string
  message: string
  confirmText?: string
}

// Static per open (props via constructor fields, no store): a gea Component only
// populates `this.props` when rendered from a parent template, not from a manual
// `new X()`. The confirm button is focused in onAfterRender (fires after the
// overlay is mounted into <body>, so focus lands).
class ConfirmModal extends Component {
  private readonly title: string
  private readonly message: string
  private readonly confirmText: string
  private readonly onResult: (value: boolean) => void
  private confirmBtn: HTMLButtonElement | null = null

  constructor(opts: {
    title: string
    message: string
    confirmText: string
    onResult: (value: boolean) => void
  }) {
    super()
    this.title = opts.title
    this.message = opts.message
    this.confirmText = opts.confirmText
    this.onResult = opts.onResult
  }

  onAfterRender(): void {
    this.confirmBtn?.focus()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Enter') this.onResult(true)
    else if (e.key === 'Escape') this.onResult(false)
  }

  template() {
    return (
      <div class="modal modal-prompt" tabIndex={-1} onKeyDown={this.onKeyDown}>
        <h2>{this.title}</h2>
        <div class="modal-confirm-message">{this.message}</div>
        <div class="modal-actions">
          <button onClick={() => this.onResult(false)}>Cancel</button>
          <button ref={this.confirmBtn} class="button-primary" onClick={() => this.onResult(true)}>
            {this.confirmText}
          </button>
        </div>
      </div>
    )
  }
}

export function promptConfirm(opts: PromptConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    let done = false
    const close = (value: boolean): void => {
      if (done) return
      done = true
      ov.close()
      resolve(value)
    }
    ov.onClose(() => close(false))
    new ConfirmModal({
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'OK',
      onResult: close
    }).render(ov.overlay)
    ov.mount()
  })
}
