import { Component } from '@geajs/core'
import { createOverlay } from '@views/components/overlay/overlay'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'

// Settings-local gea port of the @ui dialog promptForm (§2.7 self-contained).
// A multi-field modal form: resolves a map of trimmed values, or null when
// cancelled. The first listed field is required (empty first field => null).
// `.modal-overlay > .modal.modal-prompt` with `h2 → .field(label + input)* →
// actions(Cancel + primary confirm)`, Enter=confirm / Escape=cancel.
export interface PromptFormField {
  key: string
  label: string
  value?: string
  placeholder?: string
}

export interface PromptFormOptions {
  title: string
  fields: PromptFormField[]
  confirmText?: string
}

// Static per open (props only, no store) so the template renders once. The inputs
// are UNCONTROLLED: seeded imperatively in onAfterRender and read from the DOM on
// submit via the root ref — a `value=` JSX binding would let gea treat them as
// controlled. Data arrives via the constructor into plain fields (a gea Component
// only populates `this.props` when rendered from a parent template, not from a
// manual `new X()`). Self-contained — no @ui (§2.7).
export default class PromptForm extends Component {
  private readonly title: string
  private readonly fields: PromptFormField[]
  private readonly confirmText: string
  private readonly onResult: (result: Record<string, string> | null) => void
  private modalEl: HTMLElement | null = null

  constructor(opts: {
    title: string
    fields: PromptFormField[]
    confirmText: string
    onResult: (result: Record<string, string> | null) => void
  }) {
    super()
    this.title = opts.title
    this.fields = opts.fields
    this.confirmText = opts.confirmText
    this.onResult = opts.onResult
  }

  private inputs(): HTMLInputElement[] {
    return this.modalEl ? Array.from(this.modalEl.querySelectorAll<HTMLInputElement>('.field input')) : []
  }

  // Seed the uncontrolled inputs and focus/select the first one. Fields render in
  // opts order, so the query result lines up with `this.fields` by index.
  onAfterRender(): void {
    const inputs = this.inputs()
    this.fields.forEach((f, i) => {
      const input = inputs[i]
      if (input && !input.value) input.value = f.value ?? ''
    })
    // Attach keydown on the modal root (bubbles from the inputs) rather than an
    // `onKeyDown` JSX prop on the nested `<input>`: the gea plugin mis-compiles an
    // event handler on a NON-root element inside a keyed `.map()` (references an
    // undefined element var). Root-level delegation is behaviour-equivalent.
    this.modalEl?.addEventListener('keydown', this.onKeyDown)
    const first = inputs[0]
    first?.focus()
    first?.select()
  }

  private submit = (): void => {
    const inputs = this.inputs()
    const out: Record<string, string> = {}
    this.fields.forEach((f, i) => {
      out[f.key] = (inputs[i]?.value ?? '').trim()
    })
    if (!out[this.fields[0].key]) return // first field is required
    this.onResult(out)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Enter') this.submit()
    else if (e.key === 'Escape') this.onResult(null)
  }

  template() {
    return (
      <div class="modal modal-prompt" tabIndex={-1} ref={this.modalEl}>
        <h2>{this.title}</h2>
        {this.fields.map((f) => (
          <div key={f.key} class="field">
            <label>{f.label}</label>
            <input type="text" placeholder={f.placeholder} />
          </div>
        ))}
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

// Opens the gea prompt form inside a @views overlay backdrop and resolves the
// promise once (single-shot `close`). Signature preserved so every consumer
// resolves unchanged.
export function promptForm(opts: PromptFormOptions): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    let done = false
    const close = (result: Record<string, string> | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    ov.onClose(() => close(null))
    new PromptForm({
      title: opts.title,
      fields: opts.fields,
      confirmText: opts.confirmText ?? 'OK',
      onResult: close
    }).render(ov.overlay)
    ov.mount()
  })
}
