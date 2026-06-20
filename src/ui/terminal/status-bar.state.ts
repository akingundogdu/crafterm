import type { Pane } from '@ui/types/types'
import { state, paneActions } from '@ui/state/state'
import { findProjectByPath, findFeature } from '@ui/catalog/catalog'
import type { StatusSegment } from './status-bar.types'

export const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
  '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M3.4 10.4H3a1.5 1.5 0 0 1-1.5-1.5V3a1.5 1.5 0 0 1 1.5-1.5h5.9A1.5 1.5 0 0 1 10.4 3v.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '</svg>'

// Keep only the last `n` path segments, prefixed with an ellipsis when trimmed.
function lastPathSegments(p: string, n: number): string {
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length <= n) return p
  return '…/' + parts.slice(-n).join('/')
}

// Computes the full cwd plus the ordered status segments (tracking · branch ·
// worktree · cwd) for a pane. `cwd` is shortened to its last 4 segments with a
// home prefix collapsed to `~`.
export function buildPaneStatus(pane: Pane): { fullCwd: string | null; segments: StatusSegment[] } {
  const fullCwd = pane.cwd
  const homeShort = fullCwd ? fullCwd.replace(/^\/(Users|home)\/[^/]+/, '~') : null
  const cwd = homeShort ? lastPathSegments(homeShort, 4) : null
  const segments: StatusSegment[] = []
  if (pane.trackProjectPath) {
    const proj = findProjectByPath(state.tree, pane.trackProjectPath)
    const feat = pane.trackFeatureId ? findFeature(state.tree, pane.trackFeatureId)?.feature : null
    segments.push({ cls: 'tracking', text: feat?.name ?? proj?.name ?? 'tracking' })
  }
  if (pane.branch) segments.push({ cls: 'branch', text: pane.branch })
  if (pane.worktree) segments.push({ cls: 'worktree', text: pane.worktree })
  if (cwd) segments.push({ cls: 'cwd', text: cwd })
  return { fullCwd, segments }
}

// Click handler for the branch segment: opens a searchable checkout picker.
export function makeBranchClick(paneId: string): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    paneActions.branchCheckout(paneId)
  }
}

// Click handler for the copy button: copies the full path, flashing a check.
export function makeCopyPath(fullCwd: string): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(fullCwd)
    const btn = e.currentTarget as HTMLButtonElement
    btn.classList.add('copied')
    btn.textContent = '✓'
    window.setTimeout(() => {
      btn.classList.remove('copied')
      btn.innerHTML = COPY_ICON
    }, 1100)
  }
}
