import { call, send } from '../channels.client'
import type { SavedState } from '../storage/state.types'

// Persisted app state IPC (load/save the SavedState blob).
export const storeService = {
  load: () => call('store:load'),
  save: (data: SavedState) => send('store:save', data)
}
