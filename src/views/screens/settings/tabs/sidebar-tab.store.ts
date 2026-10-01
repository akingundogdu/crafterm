import { settings, requestSidebar } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { applyOrientation, applySidebarFont } from '../shell-apply'

// `change` handler for the sidebar orientation select.
export function makeOrientationChange(): (v: string) => void {
  return (v) => {
    settings.sidebar.orientation = v as 'left' | 'top'
    applyOrientation()
    persistence.save()
  }
}

// `change` handler for the sidebar font-size input (accepts 9–22).
export function makeFontSizeChange(): (v: string) => void {
  return (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 9 && n <= 22) {
      settings.sidebar.fontSize = n
      applySidebarFont()
      persistence.save()
    }
  }
}

// `change` handler for a sidebar detail-visibility checkbox.
export function makeDetailToggle(
  key: keyof typeof settings.sidebar.details,
  cb: HTMLInputElement
): () => void {
  return () => {
    settings.sidebar.details[key] = cb.checked
    requestSidebar()
    persistence.save()
  }
}

// `change` handler for the "group by recency" checkbox.
export function makeRecencyToggle(cb: HTMLInputElement): () => void {
  return () => {
    settings.sidebar.groupByRecency = cb.checked
    requestSidebar()
    persistence.save()
  }
}
