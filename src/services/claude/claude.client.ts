import { call, listen, Channel } from '../channels.client'
import type { ClaudeRealUsageOptions } from './claude.types'

// Claude integration IPC (session detection, status/title/permission, usage).
export const claudeService = {
  latestSession: (cwd?: string, since?: number) => call(Channel.Claude.LatestSession, { cwd, since }),
  sessionCwd: (sessionId: string) => call(Channel.Claude.SessionCwd, { sessionId }),
  sessions: () => call(Channel.Claude.Sessions),
  sessionTitle: (cwd: string, sessionId: string) => call(Channel.Claude.SessionTitle, { cwd, sessionId }),
  sessionStatus: (cwd: string, sessionId: string) =>
    call(Channel.Claude.SessionStatus, { cwd, sessionId }),
  permissionMode: (cwd: string, sessionId: string) =>
    call(Channel.Claude.PermissionMode, { cwd, sessionId }),
  watchSessions: (cwd: string) => call(Channel.Claude.WatchSessions, { cwd }),
  onSessionsChanged: (cb: (cwd: string) => void) =>
    listen(Channel.Claude.SessionsChanged, (p) => cb(p.cwd)),
  usageSummary: () => call(Channel.Claude.UsageSummary),
  realUsage: (opts: ClaudeRealUsageOptions) => call(Channel.Claude.RealUsage, opts)
}
