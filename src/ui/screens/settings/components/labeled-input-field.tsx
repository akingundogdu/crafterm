import { makeInputChange } from '../shared.state'

// A `.field` row: a label paired with a text input; forwards value changes.
export function labeledInput(
  parent: HTMLElement,
  label: string,
  type: string,
  value: string,
  onChange: (v: string) => void
): HTMLInputElement {
  const input = (<input type={type} onChange={makeInputChange(onChange)} />) as HTMLInputElement
  input.value = value
  const field = (
    <div class="field">
      <label>{label}</label>
      {input}
    </div>
  ) as HTMLDivElement
  parent.appendChild(field)
  return input
}
