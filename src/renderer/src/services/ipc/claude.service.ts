import { call } from './_forward'

// Claude integration IPC (session detection, status/title/permission, usage).
export const claudeService = {
  latestSession: call('claudeLatestSession'),
  sessionCwd: call('claudeSessionCwd'),
  sessions: call('claudeSessions'),
  sessionTitle: call('claudeSessionTitle'),
  sessionStatus: call('claudeSessionStatus'),
  permissionMode: call('claudePermissionMode'),
  watchSessions: call('watchClaudeSessions'),
  onSessionsChanged: call('onClaudeSessionsChanged'),
  usageSummary: call('claudeUsageSummary'),
  realUsage: call('claudeRealUsage')
}
