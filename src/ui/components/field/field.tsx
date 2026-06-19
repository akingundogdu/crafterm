// Field primitive: a `.field` row wrapping a <label> + a control (input/select).
// Mirrors the existing `div.field > label + control` markup exactly. An optional
// `hint` renders a trailing `<span class="field-hint">` inside the label, matching
// the app's "Label (comma separated)"-style hints.

import './field.css'

export function createField(
  labelText: string,
  control: HTMLElement,
  opts?: { hint?: string }
): HTMLDivElement {
  return (
    <div class="field">
      <label>
        {labelText}
        {opts?.hint ? (
          <>
            {' '}
            <span class="field-hint">{opts.hint}</span>
          </>
        ) : null}
      </label>
      {control}
    </div>
  ) as HTMLDivElement
}
