import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'
import { makeInputChange } from '../shared.state'

// gea `.field` row: a label paired with a text input; forwards value changes.
// Inline `.field` markup (§5.9 — no FormField wrapper). One-shot field builder
// (rebuilt when a tab re-renders), so no reactive store is needed — opts arrive
// via the constructor into plain fields because a gea Component only populates
// `this.props` when rendered from a parent template, not from a manual `new X()`.
class LabeledInputFieldView extends Component {
  private readonly label: string
  private readonly type: string
  private readonly value: string
  private readonly onChange: (v: string) => void
  inputEl: HTMLInputElement | null = null

  constructor(opts: { label: string; type: string; value: string; onChange: (v: string) => void }) {
    super()
    this.label = opts.label
    this.type = opts.type
    this.value = opts.value
    this.onChange = opts.onChange
  }

  // Seed the value imperatively: a `value=` JSX binding would make gea treat the
  // input as controlled and reset it to the bound value on every keystroke. The
  // field is uncontrolled — the user types freely and the value is read on change.
  onAfterRender(): void {
    if (this.inputEl) this.inputEl.value = this.value
  }

  template() {
    return (
      <div class="field">
        <label>{this.label}</label>
        <input type={this.type} ref={this.inputEl} onChange={makeInputChange(this.onChange)} />
      </div>
    )
  }
}

// A `.field` row: a label paired with a text input; forwards value changes.
// Signature preserved so every settings tab that imports `labeledInput` resolves
// unchanged; returns the input element (not the `.field` wrapper), as before.
export function labeledInput(
  parent: HTMLElement,
  label: string,
  type: string,
  value: string,
  onChange: (v: string) => void
): HTMLInputElement {
  const host = document.createElement('div')
  new LabeledInputFieldView({ label, type, value, onChange }).render(host)
  const field = host.firstElementChild as HTMLElement
  parent.appendChild(field)
  return field.querySelector('input') as HTMLInputElement
}
