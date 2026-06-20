// Select primitive types.

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
