import { Component } from '@geajs/core'
import { createOverlay } from '../overlay/overlay'
import { promptText } from './prompt-text'
import '../modal/modal.css'
import '@views/components/form-field/form-field.css'

// Sentinel value carried by the optional "+ New…" choice so callers can detect it.
export const CREATE_OPTION = ' __create__'

// Modal dropdown picker (gea port of the @ui dialog promptSelect). Resolves the
// chosen value ('' for the empty/none option), or null when cancelled. With
// `allowCreate`, a "+ New…" choice opens a text prompt and resolves the typed
// value. `.modal-overlay > .modal.modal-prompt` with `h2 → .field(label + select)
// → actions(Cancel + primary confirm)`, Enter=confirm / Escape=cancel, select
// focused. Self-contained — no @ui (§2.7).
export interface PromptSelectOptions {
  title: string
  label: string
  value?: string
  options: string[]
  emptyLabel?: string // label for the '' option; omit to hide the empty choice
  allowCreate?: boolean
  confirmText?: string
}

interface SelectEntry {
  value: string
  label: string
}

// The optional empty/create entries are resolved in plain JS into a single flat
// list so the template renders ONE keyed `.map()` with no in-JSX conditionals
// (conditionals don't materialise in a manually-mounted root). The select is
// UNCONTROLLED: its value is seeded + focused in onAfterRender (fires after the
// overlay mounts into <body>). Data arrives via constructor fields.
class PromptSelectModal extends Component {
  private readonly title: string
  private readonly label: string
  private readonly value: string
  private readonly entries: SelectEntry[]
  private readonly confirmText: string
  private readonly onResult: (result: string | null) => void
  private selEl: HTMLSelectElement | null = null

  constructor(opts: {
    title: string
    label: string
    value: string
    entries: SelectEntry[]
    confirmText: string
    onResult: (result: string | null) => void
  }) {
    super()
    this.title = opts.title
    this.label = opts.label
    this.value = opts.value
    this.entries = opts.entries
    this.confirmText = opts.confirmText
    this.onResult = opts.onResult
  }

  onAfterRender(): void {
    if (this.selEl) {
      this.selEl.value = this.value
      this.selEl.focus()
    }
  }

  private submit = (): void => {
    const sel = this.selEl
    if (!sel) return
    if (sel.value === CREATE_OPTION) {
      void promptText({
        title: this.title,
        label: 'New ' + this.label,
        placeholder: this.label,
        confirmText: 'Add'
      }).then((v) => this.onResult(v))
      return
    }
    this.onResult(sel.value)
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
          <select ref={this.selEl} onKeyDown={this.onKeyDown}>
            {this.entries.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
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

export function promptSelect(opts: PromptSelectOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const entries: SelectEntry[] = []
    if (opts.emptyLabel != null) entries.push({ value: '', label: opts.emptyLabel })
    for (const opt of opts.options) entries.push({ value: opt, label: opt })
    if (opts.allowCreate) entries.push({ value: CREATE_OPTION, label: '+ New…' })

    const ov = createOverlay()
    let done = false
    const close = (result: string | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    ov.onClose(() => close(null))
    new PromptSelectModal({
      title: opts.title,
      label: opts.label,
      value: opts.value ?? '',
      entries,
      confirmText: opts.confirmText ?? 'OK',
      onResult: close
    }).render(ov.overlay)
    ov.mount()
  })
}
