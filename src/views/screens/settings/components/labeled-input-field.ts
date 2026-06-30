import { el } from '@views/lib/dom'
import '@views/components/form-field/form-field.css'
import { makeInputChange } from '../shared.state'

// A `.field` row: a label paired with a text input; forwards value changes.
// Inline `.field` markup (§5.9 — no FormField wrapper).
export function labeledInput(
  parent: HTMLElement,
  label: string,
  type: string,
  value: string,
  onChange: (v: string) => void
): HTMLInputElement {
  const input = el('input', { type, onChange: makeInputChange(onChange) })
  input.value = value
  parent.appendChild(el('div', { class: 'field' }, el('label', null, label), input))
  return input
}
