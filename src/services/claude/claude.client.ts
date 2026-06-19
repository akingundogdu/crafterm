import { call, listen } from '../channels.client'
import type { ClaudeRealUsageOptions } from './claude.types'

// Claude integration IPC (session detection, status/title/permission, usage).
export const claudeService = {
  latestSession: (cwd?: string, since?: number) => call('claude:latestSession', { cwd, since }),
  sessionCwd: (sessionId: string) => call('claude:sessionCwd', { sessionId }),
  sessions: () => call('claude:sessions'),
  sessionTitle: (cwd: string, sessionId: string) => call('claude:sessionTitle', { cwd, sessionId }),
  sessionStatus: (cwd: string, sessionId: string) =>
    call('claude:sessionStatus', { cwd, sessionId }),
  permissionMode: (cwd: string, sessionId: string) =>
    call('claude:permissionMode', { cwd, sessionId }),
  watchSessions: (cwd: string) => call('claude:watchSessions', { cwd }),
  onSessionsChanged: (cb: (cwd: string) => void) =>
    listen('claude:sessionsChanged', (p) => cb(p.cwd)),
  usageSummary: () => call('claude:usageSummary'),
  realUsage: (opts: ClaudeRealUsageOptions) => call('claude:realUsage', opts)
}
