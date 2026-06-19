import { call, send, Channel } from '../channels.client'
import type { SavedState } from '../storage/state.types'

// Persisted app state IPC (load/save the SavedState blob).
export const storeService = {
  load: () => call(Channel.Store.Load),
  save: (data: SavedState) => send(Channel.Store.Save, data)
}
