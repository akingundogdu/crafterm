// Claude picker types.

export interface ClaudeSession {
  paneId: string
  title: string
  group: string
  status: string
  cwd: string | null
  branch: string | null
}

export interface ClaudeAccount {
  name: string
  label: string
  value?: string
}
