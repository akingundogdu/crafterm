import type { SelectOption } from '../select.types'

// Maps a SelectOption (bare string or value/label pair) to its `<option>`.
export function mapSelectOption(opt: SelectOption): HTMLOptionElement {
  return (typeof opt === 'string' ? (
    <option value={opt}>{opt}</option>
  ) : (
    <option value={opt.value}>{opt.label}</option>
  )) as HTMLOptionElement
}
