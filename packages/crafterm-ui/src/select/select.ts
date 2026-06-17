// Select primitive. Builds a <select> from string options, with an optional
// empty option and an optional "+ New…" create option. Returns the element plus
// the sentinel value used for the create choice.

export const CREATE_OPTION = ' __create__'

// An option is either a bare string (value === label) or an explicit
// value/label pair for when the stored value differs from its display text.
export type SelectOption = string | { value: string; label: string }

export interface SelectOptions {
  options: SelectOption[]
  value?: string
  emptyLabel?: string // when set, prepends a '' option with this label
  allowCreate?: boolean // when true, appends a "+ New…" option (value = CREATE_OPTION)
  createLabel?: string // default '+ New…'
}

export function createSelect(opts: SelectOptions): HTMLSelectElement {
  const sel = document.createElement('select')
  if (opts.emptyLabel != null) {
    const o = document.createElement('option')
    o.value = ''
    o.textContent = opts.emptyLabel
    sel.appendChild(o)
  }
  for (const opt of opts.options) {
    const o = document.createElement('option')
    if (typeof opt === 'string') {
      o.value = opt
      o.textContent = opt
    } else {
      o.value = opt.value
      o.textContent = opt.label
    }
    sel.appendChild(o)
  }
  if (opts.allowCreate) {
    const o = document.createElement('option')
    o.value = CREATE_OPTION
    o.textContent = opts.createLabel ?? '+ New…'
    sel.appendChild(o)
  }
  sel.value = opts.value ?? ''
  return sel
}
