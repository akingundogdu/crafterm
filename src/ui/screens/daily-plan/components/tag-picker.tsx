import { TagPickerController } from './tag-picker.controller'

// Tag multi-select picker used inside the task form. Mutates the caller-owned
// `selectedIds` array in place (selections live in the parent task form); this
// factory only owns the DOM + the tag repo reads/writes.
export function buildTagPicker(host: HTMLElement, selectedIds: string[]): void {
  new TagPickerController(host, selectedIds).build()
}
