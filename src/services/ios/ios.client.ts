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
  simShutdown = (udid?: string) => this.call(Channel.Ios.SimShutdown, { udid })
  simErase = (udid?: string) => this.call(Channel.Ios.SimErase, { udid })
  appUninstall = (udid: string, bundleId: string, kind: 'simulator' | 'device') =>
    this.call(Channel.Ios.AppUninstall, { udid, bundleId, kind })
}

export const iosService = new IosClient()
