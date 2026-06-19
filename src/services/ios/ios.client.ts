import { call, Channel } from '../channels.client'
import type { SavedIosConfig } from '../storage/state.types'

// iOS worktree build/run IPC (script path, status report, stop, targets, schemes).
export const iosService = {
  worktreeScript: () => call(Channel.IosWorktree.ScriptPath),
  worktreeReport: (repoRoot: string, cfg?: SavedIosConfig) =>
    call(Channel.IosWorktree.Report, { repoRoot, cfg }),
  worktreeStop: (worktreePath: string, cfg?: SavedIosConfig) =>
    call(Channel.IosWorktree.Stop, { worktreePath, cfg }),
  listTargets: () => call(Channel.Ios.ListTargets),
  listSchemes: (repoRoot: string, cfg?: SavedIosConfig) =>
    call(Channel.Ios.ListSchemes, { repoRoot, cfg })
}
