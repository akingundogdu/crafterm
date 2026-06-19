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
