import { Store } from '@geajs/core'
import composerStore from './agent-composer.store'
import type { DailyPlanTag } from '@views/types/types'

// Non-view module for the composer's Labels dropdown. The SELECTION itself lives in
// the composer store (submit() and the "/" menu both act on it); this store owns only
// the popover's open state plus the component's constants and helpers.

export const TAG_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 2.5h5.2L14 9.3l-4.7 4.7L2.5 7.2z"/><circle cx="5" cy="5" r="0.9" fill="currentColor" stroke="none"/></svg>'

export const LABELS_PLACEHOLDER = 'Labels'
export const LABELS_EMPTY_HINT = 'No labels yet — create them on the Daily Plan board.'

// Button caption: the placeholder while nothing is picked, the single name when one
// is, and a count beyond that (names get long and the context row is narrow).
export function labelsButtonText(names: string[]): string {
  if (!names.length) return LABELS_PLACEHOLDER
  if (names.length === 1) return names[0]
  return `${names.length} labels`
}

// Title attribute: the full list, so a collapsed "3 labels" is still readable.
export function labelsButtonTitle(names: string[]): string {
  return names.length ? names.join(', ') : LABELS_EMPTY_HINT
}

class ComposerLabelsStore extends Store {
  isOpen = false

  get labels(): DailyPlanTag[] {
    return composerStore.labels
  }

  isOn(id: string): boolean {
    return composerStore.isLabelOn(id)
  }

  get selectedNames(): string[] {
    return composerStore.selectedLabels.map((tag) => tag.name)
  }

  toggleLabel(id: string): void {
    composerStore.toggleLabel(id)
  }

  toggleOpen(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  open(): void {
    if (this.isOpen) return
    this.isOpen = true
    bindGlobal(true)
  }

  close(): void {
    if (!this.isOpen) return
    this.isOpen = false
    bindGlobal(false)
  }
}

const store = new ComposerLabelsStore()
export default store

// The dropdown renders inside the composer's gea tree, so it is dismissed the same way
// every other popover is: a click outside it, or Escape. The listeners are module-level
// functions (stable identities — a handler read back off the store proxy would not
// necessarily be the same object, and removeEventListener would silently no-op).
function onOutsideDown(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  if (!target?.closest?.('.composer-labels')) store.close()
}

function onEscape(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  store.close()
}

function bindGlobal(on: boolean): void {
  const bind = on ? document.addEventListener : document.removeEventListener
  bind.call(document, 'mousedown', onOutsideDown as EventListener, true)
  bind.call(document, 'keydown', onEscape as EventListener, true)
}
