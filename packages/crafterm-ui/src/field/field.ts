// Field primitive: a `.field` row wrapping a <label> + a control (input/select).
// Mirrors the existing `div.field > label + control` markup exactly. An optional
// `hint` renders a trailing `<span class="field-hint">` inside the label, matching
// the app's "Label (comma separated)"-style hints.

export function createField(
  labelText: string,
  control: HTMLElement,
  opts?: { hint?: string }
): HTMLDivElement {
  const field = document.createElement('div')
  field.className = 'field'
  const label = document.createElement('label')
  label.textContent = labelText
  if (opts?.hint) {
    const hint = document.createElement('span')
    hint.className = 'field-hint'
    hint.textContent = opts.hint
    label.append(' ', hint)
  }
  field.append(label, control)
  return field
}
