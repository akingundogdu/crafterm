import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { ZshService } from './zsh.service'

// Zsh IPC adapter (zsh:*): list the user's aliases + functions for the palette.
export class ZshController extends BaseService {
  readonly name = 'zsh'
  private readonly service = new ZshService()

  register(): void {
    this.handle(Channel.Zsh.Commands, () => this.service.commands())
  }
}

// Transitional shim so core/index.ts keeps compiling until the bootstrap is
