import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { PlansService } from './plans.service'

// Plans IPC adapter (plans:*): maps each channel to a PlansService method; all
// logic lives in plans.service.ts. (The docs/plans fs watcher's lifecycle is owned
// in core/index.ts; PlansService.forBranch only registers dirs via ensure().)
export class PlansController extends BaseService {
  readonly name = 'plans'
  private readonly service = new PlansService()

  register(): void {
    this.handle(Channel.Plans.List, () => this.service.list())
    this.handle(Channel.Plans.Scan, ({ paths }) => this.service.scan(paths))
    this.handle(Channel.Plans.ForBranch, ({ cwd, branch }) => this.service.forBranch(cwd, branch))
  }
}

