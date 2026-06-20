import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { DbqService } from './dbq.service'

// Saved SQL queries IPC adapter (dbq:*). Thin: maps each channel to a DbqService
// method; the file/slug logic lives in dbq.service.ts.
export class DbqController extends BaseService {
  readonly name = 'dbq'
  private readonly service = new DbqService()

  register(): void {
    this.handle(Channel.Dbq.List, ({ connId }) => this.service.list(connId))
    this.handle(Channel.Dbq.Read, ({ connId, name }) => this.service.read(connId, name))
    this.handle(Channel.Dbq.Write, ({ connId, name, sql }) => this.service.write(connId, name, sql))
    this.handle(Channel.Dbq.Delete, ({ connId, name }) => this.service.delete(connId, name))
  }
}

// Transitional shim: keeps the existing core/index.ts bootstrap call working until
// it's switched to the BaseService registry.
