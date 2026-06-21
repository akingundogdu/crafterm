import { CREATE_OPTION } from '../select.state'

// Create option: the trailing "+ New…" (or `createLabel`) choice whose value is
// the CREATE_OPTION sentinel, appended when `allowCreate` is set.
export function createSelectCreateOption(createLabel?: string): HTMLOptionElement {
  return (<option value={CREATE_OPTION}>{createLabel ?? '+ New…'}</option>) as HTMLOptionElement
}
