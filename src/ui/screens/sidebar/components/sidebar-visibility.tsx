import { settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'

// Sidebar visibility / orientation / size / font controls. Returned bound to the
// shell's live `appEl` + `sidebarEl` caches so the public no-arg signatures stay
// identical to the single-file original.
export interface SidebarVisibility {
  applySidebarCollapsed: () => void
  toggleSidebar: () => void
  applyOrientation: () => void
  applySidebarFont: () => void
  adjustSidebarFontSize: (delta: number) => void
  resetSidebarFontSize: () => void
  sidebarHasFocus: () => boolean
  applySidebarSize: () => void
  wireSidebarResizer: (onDone: () => void) => void
}

export function createSidebarVisibility(appEl: HTMLElement, sidebarEl: HTMLElement): SidebarVisibility {
  function applySidebarCollapsed(): void {
    appEl.classList.toggle('sidebar-collapsed', settings.sidebar.collapsed ?? false)
  }

  function toggleSidebar(): void {
    settings.sidebar.collapsed = !(settings.sidebar.collapsed ?? false)
    applySidebarCollapsed()
    persistence.save()
  }

  function applySidebarSize(): void {
    if (settings.sidebar.orientation === 'left') {
      sidebarEl.style.width = settings.sidebar.size + 'px'
      sidebarEl.style.height = ''
    } else {
      sidebarEl.style.height = settings.sidebar.size + 'px'
      sidebarEl.style.width = ''
    }
  }

  function applyOrientation(): void {
    appEl.classList.toggle('orient-top', settings.sidebar.orientation === 'top')
    appEl.classList.toggle('orient-left', settings.sidebar.orientation === 'left')
    applySidebarSize()
  }

  // Sidebar text scales from a single base font-size set on #sidebar (row text
  // uses em). Cmd+/- adjusts it when the sidebar (not a terminal) has focus.
  function applySidebarFont(): void {
    sidebarEl.style.fontSize = (settings.sidebar.fontSize ?? 13) + 'px'
  }

  function adjustSidebarFontSize(delta: number): void {
    const cur = settings.sidebar.fontSize ?? 13
    settings.sidebar.fontSize = Math.max(9, Math.min(22, cur + delta))
    applySidebarFont()
    persistence.save()
  }

  function resetSidebarFontSize(): void {
    settings.sidebar.fontSize = 13
    applySidebarFont()
    persistence.save()
  }

  function sidebarHasFocus(): boolean {
    return sidebarEl.contains(document.activeElement)
  }

  function wireSidebarResizer(onDone: () => void): void {
    const rz = document.getElementById('sidebar-resizer')!
    rz.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const horizontal = settings.sidebar.orientation === 'left'
      const rect = sidebarEl.getBoundingClientRect()
      const onMove = (ev: MouseEvent): void => {
        const size = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top
        settings.sidebar.size = Math.max(120, Math.min(600, size))
        applySidebarSize()
      }
      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        onDone()
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    })
  }

  return {
    applySidebarCollapsed,
    toggleSidebar,
    applyOrientation,
    applySidebarFont,
    adjustSidebarFontSize,
    resetSidebarFontSize,
    sidebarHasFocus,
    applySidebarSize,
    wireSidebarResizer
  }
}
