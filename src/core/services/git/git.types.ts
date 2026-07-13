export type GitStatusKind = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'

export interface Worktree {
  path: string
  branch: string | null
}
