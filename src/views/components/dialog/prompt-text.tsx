import { Component } from '@geajs/core'
import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'
import '@views/components/form-field/form-field.css'

// Small modal text prompt (gea port of the @ui dialog promptText). Resolves the
// trimmed value, or null when cancelled / left empty. `.modal-overlay >
// .modal.modal-prompt` with `h2 → .field(label + input) → actions(Cancel + primary
// confirm)`, Enter=confirm / Escape=cancel, input focused+selected. Self-contained
// — no @ui (§2.7).
export interface PromptTextOptions {
  title: string
  label: string
  value?: string
  placeholder?: string
  confirmText?: string
}

// The input is UNCONTROLLED: seeded imperatively in onAfterRender and read from the
// DOM on submit (a `value=` JSX binding would let gea treat it as controlled and
// freeze typing). Data arrives via constructor fields — a gea Component only
// populates `this.props` when rendered from a parent template, not a manual `new`.
class PromptTextModal extends Component {
  private readonly title: string
  private readonly label: string
  private readonly value: string
  private readonly placeholder: string | undefined
  private readonly confirmText: string
  private readonly onResult: (result: string | null) => void
  private inputEl: HTMLInputElement | null = null

  constructor(opts: {
    title: string
    label: string
    value: string
    placeholder: string | undefined
    confirmText: string
    onResult: (result: string | null) => void
  }) {
    super()
    this.title = opts.title
    this.label = opts.label
    this.value = opts.value
    this.placeholder = opts.placeholder
    this.confirmText = opts.confirmText
    this.onResult = opts.onResult
  }

  onAfterRender(): void {
    if (this.inputEl) {
      if (!this.inputEl.value) this.inputEl.value = this.value
      this.inputEl.focus()
      this.inputEl.select()
    }
  }

  private submit = (): void => {
    const v = (this.inputEl?.value ?? '').trim()
    this.onResult(v ? v : null)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Enter') this.submit()
    else if (e.key === 'Escape') this.onResult(null)
  }

  template() {
    return (
      <div class="modal modal-prompt" tabIndex={-1}>
        <h2>{this.title}</h2>
        <div class="field">
          <label>{this.label}</label>
          <input ref={this.inputEl} type="text" placeholder={this.placeholder} onKeyDown={this.onKeyDown} />
        </div>
        <div class="modal-actions">
          <button onClick={() => this.onResult(null)}>Cancel</button>
          <button class="button-primary" onClick={this.submit}>
            {this.confirmText}
          </button>
        </div>
      </div>
    )
  }
}

export function promptText(opts: PromptTextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    let done = false
    const close = (result: string | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    ov.onClose(() => close(null))
    new PromptTextModal({
      title: opts.title,
      label: opts.label,
      value: opts.value ?? '',
      placeholder: opts.placeholder,
      confirmText: opts.confirmText ?? 'OK',
      onResult: close
    }).render(ov.overlay)
    ov.mount()
  })
}
