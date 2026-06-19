// App / misc domain data models (moved out of the former bridge api.d.ts).
export interface BacklogItem {
  id: string
  text: string
  status: string
}
export interface BacklogFile {
  path: string
  items: BacklogItem[]
}

export interface BuildInfo {
  commit: string | null
  commitCount: number | null
}
export interface RepoGit {
  commit: string
  commitCount: number
  dirty: boolean
}

export interface DeployResult {
  ok: boolean
  error?: string
}

export interface ZshCommand {
  name: string
  value: string
}
