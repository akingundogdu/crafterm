import { call } from './_forward'

// Persisted app state IPC (load/save the SavedState blob).
export const storeService = {
  load: call('store', 'load'),
  save: call('store', 'save')
}
