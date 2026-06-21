import { FormField } from '@ui/components'
import { makeSelectChange } from '../shared.state'

// A `.field` row: a label paired with a select; forwards value changes.
export function labeledSelect(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  selected: string,
  onChange: (v: string) => void
): HTMLSelectElement {
  const sel = (<select onChange={makeSelectChange(onChange)} />) as HTMLSelectElement
  options.forEach(([val, text]) => {
    const o = (<option value={val}>{text}</option>) as HTMLOptionElement
    if (val === selected) o.selected = true
    sel.appendChild(o)
  })
  const field = (<FormField label={label}>{sel}</FormField>) as HTMLDivElement
  parent.appendChild(field)
  return sel
}
