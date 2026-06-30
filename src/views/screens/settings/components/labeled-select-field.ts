import { el } from '@views/lib/dom'
import '@views/components/form-field/form-field.css'
import { makeSelectChange } from '../shared.state'

// A `.field` row: a label paired with a select; forwards value changes.
// Inline `.field` markup (§5.9 — no FormField wrapper).
export function labeledSelect(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  selected: string,
  onChange: (v: string) => void
): HTMLSelectElement {
  const sel = el('select', { onChange: makeSelectChange(onChange) })
  options.forEach(([val, text]) => {
    const o = el('option', { value: val }, text)
    if (val === selected) o.selected = true
    sel.appendChild(o)
  })
  parent.appendChild(el('div', { class: 'field' }, el('label', null, label), sel))
  return sel
}
