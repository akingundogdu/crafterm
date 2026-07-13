import { diffPanes } from '@views/state/spine'
import type { LineRow } from '../diff/line-select'
import type { FileDiff } from './parse-diff'

export const SEARCH_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M11.7 10.3a5 5 0 1 0-1.4 1.4l3 3 1.4-1.4-3-3zM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>'

export const COMMENT_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2v2.2L7.6 12H14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM3.5 6h9v1.2h-9V6zm0 2.6h6V9.8h-6V8.6z"/></svg>'

// Per-pane teardown (engine + key listener + popover), run on close.
const cleanups = new Map<string, () => void>()

export function registerDiffCleanup(id: string, fn: () => void): void {
  cleanups.set(id, fn)
}

export function destroyDiffPane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  diffPanes.delete(id)
}

// Maps a parsed file's rows to the shared line-select engine's row descriptors.
export function fileToLineRows(file: FileDiff): LineRow[] {
  return file.rows.map((r) => ({
    className: 'diff-row ' + r.kind,
    gutter: r.line != null ? String(r.line) : '',
    text: r.text,
    line: r.line
  }))
}

// Click handler wrapper: stop propagation, then run the action.
export function stopAnd(fn: () => void): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    fn()
  }
}

export function preventStop(e: Event): void {
  e.preventDefault()
  e.stopPropagation()
}
