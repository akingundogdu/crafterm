import type { SelectOptions } from './select.types'
import { CREATE_OPTION, applySelectValue } from './select.state'

export type { SelectOption, SelectOptions } from './select.types'
export { CREATE_OPTION } from './select.state'

// Select primitive. Builds a <select> from string options, with an optional
// empty option and an optional "+ New…" create option. Returns the element plus
// the sentinel value used for the create choice.
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
  applySelectValue(sel, opts.value)
  return sel
}
