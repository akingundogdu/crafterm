import { filePanes, paneActions } from '@ui/state/state'
import { shellService } from '@services'
import { sendRef as sendPaneRef, targetCwd } from '../diff/pane-ref'
import type { LineRow } from '../diff/line-select'

// Per-pane teardown for the line-select engine (run on close).
const cleanups = new Map<string, () => void>()

export function registerFilePaneCleanup(id: string, destroy: () => void): void {
  cleanups.set(id, destroy)
}

export function destroyFilePane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  filePanes.delete(id)
}

// Display path with the home dir collapsed to `~`.
export function shortPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}

// Path to paste into the terminal: relative to the target terminal's cwd when the
// file lives under it (matches the PR-diff repo-relative style), else absolute.
export function refPath(absPath: string, cwd: string | null): string {
  if (cwd) {
    const base = cwd.endsWith('/') ? cwd : cwd + '/'
    if (absPath.startsWith(base)) return absPath.slice(base.length)
  }
  return absPath
}

// Maps file text to line-select rows. A trailing newline yields a final empty
// element; drop it so the gutter count matches the file's line count.
export function buildLineRows(text: string): LineRow[] {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines.map((line, i) => ({
    className: 'diff-row ctx',
    gutter: String(i + 1),
    text: line,
    line: i + 1
  }))
}

// The ref string source for the line-select engine: repo-relative when possible.
export function makeRefFile(path: string, targetPaneId: string | null): () => string {
  return () => refPath(path, targetCwd(targetPaneId))
}

// Routes a selected ref into the target terminal.
export function makeSendRef(targetPaneId: string | null): (ref: string) => boolean {
  return (ref) => sendPaneRef(targetPaneId, ref)
}

// Selects this pane (used by row-select + the pane mousedown).
export function makeSelectPane(id: string): () => void {
  return () => paneActions.select(id)
}

// ---- header button handlers (R4) ----
export function makeCopyPathClick(path: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(path)
    const btn = e.currentTarget as HTMLButtonElement
    const prev = btn.textContent
    btn.textContent = '✓'
    setTimeout(() => (btn.textContent = prev), 1000)
  }
}

export function makeRevealClick(path: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    shellService.revealPath(path)
  }
}

export function makeReloadClick(load: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    load()
  }
}

export function makeCloseClick(id: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    paneActions.close(id)
  }
}
