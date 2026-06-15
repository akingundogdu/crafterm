import { call } from './_forward'

// iOS worktree build/run IPC (script path, status report, stop, targets, schemes).
export const iosService = {
  worktreeScript: call('iosWorktreeScript'),
  worktreeReport: call('iosWorktreeReport'),
  worktreeStop: call('iosWorktreeStop'),
  listTargets: call('iosListTargets'),
  listSchemes: call('iosListSchemes')
}
