export interface BuildInfo {
  commit: string | null
  commitCount: number | null
}

export interface RepoGit {
  commit: string
  commitCount: number
  dirty: boolean
}
