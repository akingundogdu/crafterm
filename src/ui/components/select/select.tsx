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
  const sel = (
    <select>
      {opts.emptyLabel != null && <option value="">{opts.emptyLabel}</option>}
      {opts.options.map((opt) =>
        typeof opt === 'string' ? (
          <option value={opt}>{opt}</option>
        ) : (
          <option value={opt.value}>{opt.label}</option>
        )
      )}
      {opts.allowCreate && <option value={CREATE_OPTION}>{opts.createLabel ?? '+ New…'}</option>}
    </select>
  ) as HTMLSelectElement
  // Must run after the options exist, or the value won't take.
  sel.value = opts.value ?? ''
  return sel
}
