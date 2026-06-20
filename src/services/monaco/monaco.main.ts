import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { MonacoService } from './monaco.service'

// Monaco IPC adapter (monaco:*): load a monaco-themes theme JSON by display name.
export class MonacoController extends BaseService {
  readonly name = 'monaco'
  private readonly service = new MonacoService()

  register(): void {
    this.handle(Channel.Monaco.Theme, ({ name }) => this.service.theme(name))
  }
}

// Transitional shim so core/index.ts keeps compiling until the bootstrap is
