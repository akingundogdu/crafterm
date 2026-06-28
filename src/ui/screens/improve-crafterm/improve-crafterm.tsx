import './improve-crafterm.css'
import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import ImprovePanel from '@views/screens/improve-crafterm/improve-crafterm'
import store, { type ImproveTab } from '@views/screens/improve-crafterm/improve-crafterm.store'

// ---- Improve Crafterm panel -----------------------------------------
// Modal chrome (overlay, close button, keyboard shortcuts, window mode) for the
// gea Improve panel. The reactive content — stats, the new-feature form, and the
// Todo / Ready / Done tabs — lives in the gea ImprovePanel component, mounted
// into this modal shell. In window mode the panel fills a standalone window.
export function showImproveModal(opts: { windowMode?: boolean } = {}): Promise<void> {
  const windowMode = !!opts.windowMode
  const { overlay, mount, close, onClose } = createOverlay({ closeOnBackdrop: !windowMode })
  if (windowMode) overlay.classList.add('improve-window-overlay')

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // In window mode the close button shuts the host window; Esc is inert.
      if (!windowMode) close()
      return
    }
    // Cmd/Ctrl+N opens the "request new feature" form (no-op without a todo file).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
      if (!store.hasTodoFile) return
      e.preventDefault()
      e.stopPropagation()
      store.openForm()
      return
    }
    // Cmd/Ctrl+1/2/3 switch between Todo / Ready to test / Done tabs.
    if (e.metaKey || e.ctrlKey) {
      const map: Record<string, ImproveTab> = { '1': 'todo', '2': 'ready', '3': 'done' }
      const next = map[e.key]
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        store.setTab(next)
      }
    }
  }
  onClose(() => {
    document.removeEventListener('keydown', onKey, true)
    if (windowMode) window.close()
  })
  document.addEventListener('keydown', onKey, true)

  const modal = (<div class="modal improve-modal" />) as HTMLDivElement
  modal.appendChild(makeCloseButton(close))
  overlay.appendChild(modal)

  store.reset(windowMode, close)
  new ImprovePanel().render(modal)
  mount()

  // Async load resolves the modal promise (window bootstrap awaits it) once the
  // todo store is read; the reactive panel fills in when state lands.
  return store.load()
}
