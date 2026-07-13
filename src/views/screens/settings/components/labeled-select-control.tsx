import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'

export interface LabeledSelectControlProps {
  label: string
  value: string
  emptyLabel: string
  options: string[]
  onChange: (v: string) => void
}

// gea `.field` row rendered as a JSX child: a label paired with a real dropdown.
// `options` are the selectable values; the current value is always present (legacy
// labels stay selectable) and the empty option (label `emptyLabel`) clears it. The
// selected option is marked with `selected=` (mirrors the legacy `sel.value =
// value`); the change handler sits on the `<select>` — not on a nested element
// inside the option `.map()` — so the gea plugin's keyed-map handler bug can't bite.
export default class LabeledSelectControl extends Component {
  declare props: LabeledSelectControlProps

  template({ label, value, emptyLabel, options, onChange }: this['props']) {
    const all = [...new Set([...options, ...(value ? [value] : [])])]
    return (
      <div class="field">
        <label>{label}</label>
        <select onChange={(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
          <option value="" selected={value === ''}>
            {emptyLabel}
          </option>
          {all.map((v) => (
            <option key={v} value={v} selected={v === value}>
              {v}
            </option>
          ))}
        </select>
      </div>
    )
  }
}
