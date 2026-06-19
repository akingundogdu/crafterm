import { call } from '../channels.client'
import type { SavedIosConfig } from '../storage/state.types'

// iOS worktree build/run IPC (script path, status report, stop, targets, schemes).
export const iosService = {
  worktreeScript: () => call('iosWorktree:scriptPath'),
  worktreeReport: (repoRoot: string, cfg?: SavedIosConfig) =>
    call('iosWorktree:report', { repoRoot, cfg }),
  worktreeStop: (worktreePath: string, cfg?: SavedIosConfig) =>
    call('iosWorktree:stop', { worktreePath, cfg }),
  listTargets: () => call('ios:listTargets'),
  listSchemes: (repoRoot: string, cfg?: SavedIosConfig) =>
    call('ios:listSchemes', { repoRoot, cfg })
}
