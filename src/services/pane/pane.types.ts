// Pane-info bridge types (pane:* channels). Cwd/branch/worktree + the last
// command captured by the zsh preexec hook, surfaced for the sidebar.
export interface PaneInfo {
  cwd: string | null
  branch: string | null
  worktree: string | null // basename of the git toplevel (worktree/repo folder), or null
  // Literal last command captured by the zsh preexec hook (keyed by stableId),
  // or null when none recorded yet. Only read when a stableId is passed.
  lastCommand?: string | null
  // The pane's CURRENT Claude session id, recorded by the SessionStart hook
  // (keyed by stableId/CRAFTERM_PANE_ID). Follows a /clear or compact roll, so the
  // renderer can re-point a locked pane off its stale launch-time session id.
  // Null when the hook has written nothing (non-Claude pane, or hook not updated).
  claudeSessionId?: string | null
}

export interface PaneInfoRequest {
  id: string
  stableId?: string
}
