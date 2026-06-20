import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Self-update IPC (deploy:*): rebuild from source, swap the installed app, relaunch.
class DeployClient extends BaseClient {
  build = (repoPath: string, command: string) => this.call(Channel.Deploy.Build, { repoPath, command })
  killAllPtys = () => this.call(Channel.Deploy.KillAllPtys)
  swap = (repoPath: string) => this.call(Channel.Deploy.Swap, { repoPath })
  wasUpdating = () => this.call(Channel.Deploy.WasUpdating)
}

export const deployService = new DeployClient()
