import { Component } from '@geajs/core'
import { CREATE_OPTION, type SelectOption } from './select.types'

// Select primitive (gea). Builds a <select> from string|value/label options,
// with an optional leading empty option and an optional trailing "+ New…" create
// option. The selected option is marked via the `selected` attribute (robust
// regardless of child render order, unlike setting `select.value`). Self-contained
// — no @ui import (§2.7).
export default class Select extends Component {
  declare props: {
    options: SelectOption[]
    value?: string
    emptyLabel?: string
    allowCreate?: boolean
    createLabel?: string
    onChange?: (e: Event) => void
  }

  template(p: this['props']) {
    const current = p.value ?? ''
    return (
      <select onChange={p.onChange}>
        {p.emptyLabel != null && (
          <option value="" selected={current === ''}>
            {p.emptyLabel}
          </option>
        )}
        {p.options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value
          const label = typeof opt === 'string' ? opt : opt.label
          return (
            <option value={value} selected={value === current}>
              {label}
            </option>
          )
        })}
        {p.allowCreate && <option value={CREATE_OPTION}>{p.createLabel ?? '+ New…'}</option>}
      </select>
    )
  }
}
