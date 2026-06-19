import { panes, state, paneActions } from '../../state'
import { terminalService } from '@services'

// Shared terminal-targeting helpers for the file/diff viewer panes. They resolve
// which terminal a `path:line` reference should be pasted into and perform the
// paste. Kept apart from the (pure) line-select engine so that engine stays
// free of state/IPC imports and unit-testable in isolation.

// Resolve the terminal to paste into: the captured target if it still exists,
// else the active pane when it is a terminal.
export function resolveTarget(targetPaneId: string | null): string | null {
  if (targetPaneId && panes.has(targetPaneId)) return targetPaneId
  if (state.activePaneId && panes.has(state.activePaneId)) return state.activePaneId
  return null
}

// cwd of the resolved target terminal, for repo-relative ref paths.
export function targetCwd(targetPaneId: string | null): string | null {
  const t = resolveTarget(targetPaneId)
  return t ? (panes.get(t)?.cwd ?? null) : null
}

// Paste a `path:line[-line]` reference into the resolved terminal and focus it.
// Returns false when no terminal is available (the caller flags the + button).
export function sendRef(targetPaneId: string | null, ref: string): boolean {
  const target = resolveTarget(targetPaneId)
  if (!target) return false
  terminalService.input(target, ref + ' ')
  paneActions.select(target)
  panes.get(target)?.term.focus()
  return true
}
