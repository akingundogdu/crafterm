import { state } from '@ui/state/state'
import {
  openProject,
  openTerminalRunning,
  openTerminalInDir,
  createWorktreeFromPane
} from '@ui/commands/commands'
import { baseName } from '../shared'

// POSIX single-quote shell escaping.
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// Whether a worktree matches the search query (name / branch / path).
export function worktreeMatches(w: { path: string; branch?: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || `${baseName(w.path)} ${w.branch ?? ''} ${w.path}`.toLowerCase().includes(q)
}

// "+ New worktree": closes the dashboard, then creates one from the active pane.
export function makeAddWorktree(close: () => void): () => void {
  return () => {
    close()
    if (state.activePaneId) void createWorktreeFromPane(state.activePaneId)
  }
}

// "Claude": opens the worktree as a project running Claude.
export function makeOpenClaude(path: string, close: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void openProject({ name: baseName(path), path, command: 'claude' }, null)
    close()
  }
}

// "Remove": runs `git worktree remove` for the worktree in a terminal.
export function makeRemoveWorktree(
  root: string,
  path: string,
  close: () => void
): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void openTerminalRunning(
      `git -C ${shq(root)} worktree remove ${shq(path)}`,
      'worktree remove'
    )
    close()
  }
}

// Row click: opens a terminal in the worktree directory.
export function makeOpenDir(path: string, close: () => void): () => void {
  return () => {
    void openTerminalInDir(path)
    close()
  }
}
