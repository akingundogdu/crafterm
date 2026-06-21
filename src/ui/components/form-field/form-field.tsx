// A `.field` row used as a JSX component: `<FormField label="Title">{control}</FormField>`.
// Slots: `label` (text), optional trailing `hint` span, optional `extraClass` on the
// row, and `column` to wrap the control(s) in `.field-control-col`. Mirrors the
// `div.field > label + control` markup exactly.
export interface FormFieldProps {
  label: string
  hint?: string
  extraClass?: string
  column?: boolean
  children?: unknown
}

export function FormField({ label, hint, extraClass, column, children }: FormFieldProps): HTMLDivElement {
  const cls = extraClass ? `field ${extraClass}` : 'field'
  return (
    <div class={cls}>
      <label>
        {hint ? `${label} ` : label}
        {hint ? <span class="field-hint">{hint}</span> : null}
      </label>
      {column ? <div class="field-control-col">{children}</div> : children}
    </div>
  ) as HTMLDivElement
}
