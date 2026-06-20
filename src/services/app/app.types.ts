// App / misc domain data models (moved out of the former bridge api.d.ts).
// (BacklogItem/BacklogFile → backlog.types; DeployResult → deploy.types;
// ZshCommand → zsh.types.)
export interface BuildInfo {
  commit: string | null
  commitCount: number | null
}
export interface RepoGit {
  commit: string
  commitCount: number
  dirty: boolean
}
