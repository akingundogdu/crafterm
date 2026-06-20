import './field.css'
import type { FieldOptions } from './field.types'
import { resolveFieldProps } from './field.state'

export type { FieldOptions } from './field.types'

// Field primitive: a `.field` row wrapping a <label> + a control (input/select).
// Mirrors the existing `div.field > label + control` markup exactly. An optional
// `hint` renders a trailing `<span class="field-hint">` inside the label, matching
// the app's "Label (comma separated)"-style hints.
export function createField(
  labelText: string,
  control: HTMLElement,
  opts?: FieldOptions
): HTMLDivElement {
  const p = resolveFieldProps(opts)
  return (
    <div class="field">
      <label>
        {labelText}
        {p.hint ? (
          <>
            {' '}
            <span class="field-hint">{p.hint}</span>
          </>
        ) : null}
      </label>
      {control}
    </div>
  ) as HTMLDivElement
}
