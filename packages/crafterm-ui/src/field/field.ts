// Field primitive: a `.field` row wrapping a <label> + a control (input/select).
// Mirrors the existing `div.field > label + control` markup exactly.

export function createField(labelText: string, control: HTMLElement): HTMLDivElement {
  const field = document.createElement('div')
  field.className = 'field'
  const label = document.createElement('label')
  label.textContent = labelText
  field.append(label, control)
  return field
}
