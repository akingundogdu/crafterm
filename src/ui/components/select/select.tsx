import type { SelectOptions } from './select.types'
import { applySelectValue } from './select.state'
import { createSelectEmptyOption } from './components/select-empty-option'
import { mapSelectOption } from './components/select-option-mapper'
import { createSelectCreateOption } from './components/select-create-option'

export type { SelectOption, SelectOptions } from './select.types'
export { CREATE_OPTION } from './select.state'

// Select primitive. Builds a <select> from string options, with an optional
// empty option and an optional "+ New…" create option. Returns the element plus
// the sentinel value used for the create choice.
export function createSelect(opts: SelectOptions): HTMLSelectElement {
  const sel = (
    <select>
      {opts.emptyLabel != null && createSelectEmptyOption(opts.emptyLabel)}
      {opts.options.map((opt) => mapSelectOption(opt))}
      {opts.allowCreate && createSelectCreateOption(opts.createLabel)}
    </select>
  ) as HTMLSelectElement
  applySelectValue(sel, opts.value)
  return sel
}
