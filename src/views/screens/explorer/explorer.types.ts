// Explorer file-tree types.

export interface Entry {
  name: string
  path: string
  isDir: boolean
}

export type GitKind = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
