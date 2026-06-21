// Field label: the `<label>` holding the label text plus an optional trailing
// `<span class="field-hint">` — matching the app's "Label (comma separated)"
// style hints.
export function createFieldLabel(labelText: string, hint?: string): HTMLLabelElement {
  return (
    <label>
      {labelText}
      {hint ? (
        <>
          {' '}
          <span class="field-hint">{hint}</span>
        </>
      ) : null}
    </label>
  ) as HTMLLabelElement
}
