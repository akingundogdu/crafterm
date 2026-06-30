import type { FileDiff } from './parse-diff'

interface DiffNavigationOptions {
  // The live file list — read by reference (set via `setFiles`).
  getFiles: () => FileDiff[]
  // Reflects the active file in the header (path, 1-based index, total).
  updateHeader: (path: string, oneBasedIndex: number, total: number) => void
  // Renders the active file's body (or the empty message).
  renderActive: () => void
  // Resets the body scroll to the top after a render.
  resetScroll: () => void
}

interface DiffNavigationEngine {
  activeIdx: () => number
  // Clamp to bounds, update header, render the file, reset scroll.
  showFile: (idx: number) => void
}

// Owns the active-file index + bounds for the diff pane. Clamps navigation to the
// file list, drives the header, and triggers a re-render on every move.
export function createDiffNavigation(opts: DiffNavigationOptions): DiffNavigationEngine {
  let activeIdx = 0

  const showFile = (idx: number): void => {
    const files = opts.getFiles()
    activeIdx = Math.max(0, Math.min(files.length - 1, idx))
    opts.updateHeader(files.length ? files[activeIdx].path : '', activeIdx + 1, files.length)
    opts.renderActive()
    opts.resetScroll()
  }

  return {
    activeIdx: () => activeIdx,
    showFile
  }
}
