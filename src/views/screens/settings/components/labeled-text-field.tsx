import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'

export interface LabeledTextFieldProps {
  label: string
  value: string
  placeholder?: string
  textarea?: boolean
  rows?: number
  // Optional inline style for the control (e.g. the iOS fields' `max-width:420px`).
  controlStyle?: Record<string, string>
  onChange: (v: string) => void
}

// gea `.field` row rendered as a JSX child: a label paired with an uncontrolled
// text input or textarea. The control is UNCONTROLLED — seeded imperatively in
// onAfterRender (a `value=` JSX binding would make gea treat it as controlled and
// reset it on every keystroke) and read from the DOM on change. Data arrives via
// `this.props` (gea populates it when rendered from a parent template), so this is
// safe to use as a keyed `.map()` item root: the change handler sits inside this
// child's own template, not on a nested element inside the parent's map.
export default class LabeledTextField extends Component {
  declare props: LabeledTextFieldProps
  private controlEl: HTMLInputElement | HTMLTextAreaElement | null = null

  onAfterRender(): void {
    if (this.controlEl) this.controlEl.value = this.props.value
  }

  template({ label, placeholder, textarea, rows, controlStyle, onChange }: this['props']) {
    return (
      <div class="field">
        <label>{label}</label>
        {textarea ? (
          <textarea
            rows={rows ?? 3}
            placeholder={placeholder}
            style={controlStyle}
            ref={this.controlEl}
            onChange={(e: Event) => onChange((e.target as HTMLTextAreaElement).value)}
          />
        ) : (
          <input
            type="text"
            placeholder={placeholder}
            style={controlStyle}
            ref={this.controlEl}
            onChange={(e: Event) => onChange((e.target as HTMLInputElement).value)}
          />
        )}
      </div>
    )
  }
}
