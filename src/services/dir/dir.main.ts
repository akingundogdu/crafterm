import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { DirService } from './dir.service'

// Directory IPC adapter (dir:*): list sub-directories for the Cmd+P folder picker.
export class DirController extends BaseService {
  readonly name = 'dir'
  private readonly service = new DirService()

  register(): void {
    this.handle(Channel.Dir.List, ({ path }) => this.service.list(path))
  }
}

// Transitional shim so core/index.ts keeps compiling until the bootstrap is
