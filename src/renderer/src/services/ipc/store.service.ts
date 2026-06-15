import { call } from './_forward'

// Persisted app state IPC (load/save the SavedState blob).
export const storeService = {
  load: call('loadState'),
  save: call('saveState')
}
