import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { PaneService } from './pane.service'

// Pane info IPC adapter (pane:*). Thin: maps the channel to a PaneService method;
// the cwd/branch/last-command logic lives in pane.service.ts.
export class PaneController extends BaseService {
  readonly name = 'pane'
  private readonly service = new PaneService()

  register(): void {
    this.handle(Channel.Pane.Info, ({ id, stableId }) => this.service.info(id, stableId))
  }
}

// Transitional shim: keeps the existing core/index.ts bootstrap call working until
// it's switched to the BaseService registry.
