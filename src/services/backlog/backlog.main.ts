import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { BacklogService } from './backlog.service'

// Backlog IPC adapter (backlog:*): maps the read channel to BacklogService; the
// file read + JSON validation logic lives in backlog.service.ts.
export class BacklogController extends BaseService {
  readonly name = 'backlog'
  private readonly service = new BacklogService()

  register(): void {
    this.handle(Channel.Backlog.Read, () => this.service.read())
  }
}

