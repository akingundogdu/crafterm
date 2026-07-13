import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { ClaudeRealUsageOptions } from './claude.types'

// Claude integration IPC (session detection, status/title/permission, usage).
// Arrow-function fields so call sites can destructure/pass the methods freely.
class ClaudeClient extends BaseClient {
  latestSession = (cwd?: string, since?: number) => this.call(Channel.Claude.LatestSession, { cwd, since })
  sessionCwd = (sessionId: string) => this.call(Channel.Claude.SessionCwd, { sessionId })
  sessions = () => this.call(Channel.Claude.Sessions)
  sessionTitle = (cwd: string, sessionId: string) => this.call(Channel.Claude.SessionTitle, { cwd, sessionId })
  sessionStatus = (cwd: string, sessionId: string) =>
    this.call(Channel.Claude.SessionStatus, { cwd, sessionId })
  permissionMode = (cwd: string, sessionId: string) =>
    this.call(Channel.Claude.PermissionMode, { cwd, sessionId })
  watchSessions = (cwd: string) => this.call(Channel.Claude.WatchSessions, { cwd })
  onSessionsChanged = (cb: (cwd: string) => void) =>
    this.listen(Channel.Claude.SessionsChanged, (p) => cb(p.cwd))
  usageSummary = () => this.call(Channel.Claude.UsageSummary)
  realUsage = (opts: ClaudeRealUsageOptions) => this.call(Channel.Claude.RealUsage, opts)
}

export const claudeService = new ClaudeClient()
