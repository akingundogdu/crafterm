// Self-update bridge types (deploy:* channels).
export interface DeployBuildRequest {
  repoPath: string
  command: string
}

export interface DeployResult {
  ok: boolean
  error?: string
}
