import { state } from '@views/state/spine'

interface DiffKeyboardOptions {
  paneId: string
  // Skip while the comment popover keeps its own typing focus.
  isPopoverOpen: () => boolean
  getActiveIdx: () => number
  showFile: (idx: number) => void
}

// Cmd+←/→ steps prev/next while this diff pane is the active one. Capture phase so
// it wins before xterm or the global grid; the comment popover keeps its own
// typing focus, so skip while it's open. Returns a teardown that removes the
// listener.
export function createDiffKeyboard(opts: DiffKeyboardOptions): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (!e.metaKey || e.altKey || e.shiftKey || opts.isPopoverOpen()) return
    if (state.activePaneId !== opts.paneId) return
    if (e.key === 'ArrowLeft') opts.showFile(opts.getActiveIdx() - 1)
    else if (e.key === 'ArrowRight') opts.showFile(opts.getActiveIdx() + 1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
