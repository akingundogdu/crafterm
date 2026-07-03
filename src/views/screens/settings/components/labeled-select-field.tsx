import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'
import { makeSelectChange } from '../shared.state'

// gea `.field` row: a label paired with a select; forwards value changes. Inline
// `.field` markup (§5.9 — no FormField wrapper). One-shot field builder (rebuilt
// when a tab re-renders), so no reactive store is needed — opts arrive via the
// constructor into plain fields because a gea Component only populates `this.props`
// when rendered from a parent template, not from a manual `new X()`.
class LabeledSelectFieldView extends Component {
  private readonly label: string
  private readonly options: [string, string][]
  private readonly selected: string
  private readonly onChange: (v: string) => void

  constructor(opts: {
    label: string
    options: [string, string][]
    selected: string
    onChange: (v: string) => void
  }) {
    super()
    this.label = opts.label
    this.options = opts.options
    this.selected = opts.selected
    this.onChange = opts.onChange
  }

  template() {
    return (
      <div class="field">
        <label>{this.label}</label>
        <select onChange={makeSelectChange(this.onChange)}>
          {this.options.map((opt) => (
            <option key={opt[0]} value={opt[0]} selected={opt[0] === this.selected}>
              {opt[1]}
            </option>
          ))}
        </select>
      </div>
    )
  }
}

// A `.field` row: a label paired with a select; forwards value changes. Signature
// preserved so every settings tab that imports `labeledSelect` resolves unchanged;
// returns the select element (not the `.field` wrapper), as before.
export function labeledSelect(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  selected: string,
  onChange: (v: string) => void
): HTMLSelectElement {
  const host = document.createElement('div')
  new LabeledSelectFieldView({ label, options, selected, onChange }).render(host)
  const field = host.firstElementChild as HTMLElement
  parent.appendChild(field)
  return field.querySelector('select') as HTMLSelectElement
}
