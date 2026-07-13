import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { IdeService } from './ide.service'

// IDE IPC adapter (ide:*): open a path in the user's IDE via their `ide` command.
export class IdeController extends BaseService {
  readonly name = 'ide'
  private readonly service = new IdeService()

  register(): void {
    this.on(Channel.Ide.Open, ({ path, ide }) => this.service.open(path, ide))
  }
}

// Transitional shim so core/index.ts keeps compiling until the bootstrap is
