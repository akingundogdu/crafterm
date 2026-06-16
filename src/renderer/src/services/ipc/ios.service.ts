import { call } from './_forward'

// iOS worktree build/run IPC (script path, status report, stop, targets, schemes).
export const iosService = {
  worktreeScript: call('ios', 'worktreeScript'),
  worktreeReport: call('ios', 'worktreeReport'),
  worktreeStop: call('ios', 'worktreeStop'),
  listTargets: call('ios', 'listTargets'),
  listSchemes: call('ios', 'listSchemes')
}
