import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { SavedState } from '@repositories/state.types'

// Persisted app state IPC (load/save the SavedState blob).
class StoreClient extends BaseClient {
  load = () => this.call(Channel.Store.Load)
  save = (data: SavedState) => this.send(Channel.Store.Save, data)
}

export const storeService = new StoreClient()
