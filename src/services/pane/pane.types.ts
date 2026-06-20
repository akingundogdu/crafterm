// Pane-info bridge types (pane:* channels). Cwd/branch/worktree + the last
// command captured by the zsh preexec hook, surfaced for the sidebar.
export interface PaneInfo {
  cwd: string | null
  branch: string | null
  worktree: string | null // basename of the git toplevel (worktree/repo folder), or null
  // Literal last command captured by the zsh preexec hook (keyed by stableId),
  // or null when none recorded yet. Only read when a stableId is passed.
  lastCommand?: string | null
}

export interface PaneInfoRequest {
  id: string
  stableId?: string
}
