import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { SavedIosConfig } from '@repositories/state.types'

// iOS worktree build/run IPC (script path, status report, stop, targets, schemes).
class IosClient extends BaseClient {
  worktreeScript = () => this.call(Channel.IosWorktree.ScriptPath)
  worktreeReport = (repoRoot: string, cfg?: SavedIosConfig) =>
    this.call(Channel.IosWorktree.Report, { repoRoot, cfg })
  worktreeStop = (worktreePath: string, cfg?: SavedIosConfig) =>
    this.call(Channel.IosWorktree.Stop, { worktreePath, cfg })
  listTargets = () => this.call(Channel.Ios.ListTargets)
  listSchemes = (repoRoot: string, cfg?: SavedIosConfig) =>
    this.call(Channel.Ios.ListSchemes, { repoRoot, cfg })
}

export const iosService = new IosClient()
