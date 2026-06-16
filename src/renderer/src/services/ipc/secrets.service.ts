import { call } from './_forward'

// Secrets/credentials IPC (Electron safeStorage-backed).
export const secretsService = {
  available: call('secrets', 'available'),
  get: call('secrets', 'get'),
  set: call('secrets', 'set'),
  delete: call('secrets', 'delete')
}
