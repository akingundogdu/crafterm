import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { StoreService } from './store.service'

// JSON store IPC adapter (store:*). Thin: maps load/save channels to a StoreService
// method; the atomic write + schema-version backup logic lives in store.service.ts.
export class StoreController extends BaseService {
  readonly name = 'store'
  private readonly service = new StoreService()

  register(): void {
    this.handle(Channel.Store.Load, () => this.service.load())
    this.on(Channel.Store.Save, (data) => this.service.save(data))
  }
}

// Transitional shim: keeps the existing core/index.ts bootstrap call working until
// it's switched to the BaseService registry.
