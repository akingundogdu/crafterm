// Empty option: a leading `<option value="">` shown when `emptyLabel` is set.
export function createSelectEmptyOption(emptyLabel: string): HTMLOptionElement {
  return (<option value="">{emptyLabel}</option>) as HTMLOptionElement
}
