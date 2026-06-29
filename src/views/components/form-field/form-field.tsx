import { Component } from '@geajs/core'
import './form-field.css'

// Form field primitive (gea): a `.field` row wrapping a <label> + a control
// passed as children — `<FormField label="Title"><Input/></FormField>`. Optional
// trailing `hint` span, `extraClass` on the row, and `column` to wrap the
// control(s) in `.field-control-col`. Mirrors the legacy `div.field > label +
// control` markup exactly. Self-contained — no @ui import (§2.7).
export default class FormField extends Component {
  declare props: {
    label: string
    hint?: string
    extraClass?: string
    column?: boolean
    children?: unknown
  }

  template({ label, hint, extraClass, column, children }: this['props']) {
    const cls = extraClass ? `field ${extraClass}` : 'field'
    return (
      <div class={cls}>
        <label>
          {hint ? `${label} ` : label}
          {hint ? <span class="field-hint">{hint}</span> : null}
        </label>
        {column ? <div class="field-control-col">{children}</div> : children}
      </div>
    )
  }
}
