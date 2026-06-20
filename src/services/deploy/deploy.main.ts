import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { DeployService } from './deploy.service'

// Self-update IPC adapter (deploy:*): maps each channel to a DeployService method;
// all logic lives in deploy.service.ts.
export class DeployController extends BaseService {
  readonly name = 'deploy'
  private readonly service = new DeployService()

  register(): void {
    this.handle(Channel.Deploy.Build, ({ repoPath, command }) => this.service.build(repoPath, command))
    this.handle(Channel.Deploy.KillAllPtys, () => this.service.killAllPtys())
    this.handle(Channel.Deploy.Swap, ({ repoPath }) => this.service.swap(repoPath))
    this.handle(Channel.Deploy.WasUpdating, () => this.service.wasUpdating())
  }
}

