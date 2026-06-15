// Select primitive. Builds a <select> from string options, with an optional
// empty option and an optional "+ New…" create option. Returns the element plus
// the sentinel value used for the create choice.

export const CREATE_OPTION = ' __create__'

export interface SelectOptions {
  options: string[]
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
  for (const v of opts.options) {
    const o = document.createElement('option')
    o.value = v
    o.textContent = v
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
