import { settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { applyTabDisplay } from '../../sidebar/sidebar'

// `change` handler for the tab-display mode select.
export function makeTabDisplayChange(): (v: string) => void {
  return (v) => {
    settings.tabDisplay.mode = v as 'icon' | 'text' | 'both'
    applyTabDisplay()
    persistence.save()
  }
}

// `change` handler for a per-tab visibility checkbox: keeps the strip's hidden
// list in sync (checked = visible), then re-applies + persists.
export function makeHideToggle(
  strip: 'left' | 'right',
  tabId: string,
  cb: HTMLInputElement
): () => void {
  return () => {
    const list = settings.tabDisplay.hidden[strip]
    const idx = list.indexOf(tabId)
    if (cb.checked) {
      if (idx >= 0) list.splice(idx, 1)
    } else if (idx < 0) {
      list.push(tabId)
    }
    applyTabDisplay()
    persistence.save()
  }
}
