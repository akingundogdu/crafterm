import { call } from './_forward'

// Claude integration IPC (session detection, status/title/permission, usage).
export const claudeService = {
  latestSession: call('claude', 'latestSession'),
  sessionCwd: call('claude', 'sessionCwd'),
  sessions: call('claude', 'sessions'),
  sessionTitle: call('claude', 'sessionTitle'),
  sessionStatus: call('claude', 'sessionStatus'),
  permissionMode: call('claude', 'permissionMode'),
  watchSessions: call('claude', 'watchSessions'),
  onSessionsChanged: call('claude', 'onSessionsChanged'),
  usageSummary: call('claude', 'usageSummary'),
  realUsage: call('claude', 'realUsage')
}
