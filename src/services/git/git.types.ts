// Git domain data models (moved out of the former bridge api.d.ts).
export interface Worktree {
  path: string
  branch: string | null
}
export interface WorktreeListing {
  root: string | null
  worktrees: Worktree[]
}

// Git working-tree status for Files-tree decorations: absolute path → kind.
export type GitFileChange = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
export type GitFileStatus = Record<string, GitFileChange>

export interface GitStash {
  ref: string
  description: string
}

// What a worktree looks like right before it is removed (todomrkkvspyax): the
// pre-checks that decide whether `git worktree remove` can succeed at all.
export interface WorktreeState {
  branch: string | null
  // Tracked files with uncommitted changes, and files git has never seen.
  changed: number
  untracked: number
  // Commits on this branch that the upstream does not have (lost with the branch).
  ahead: number
  hasUpstream: boolean
}
