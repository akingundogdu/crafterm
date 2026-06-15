import { call } from './_forward'

// Secrets/credentials IPC (Electron safeStorage-backed).
export const secretsService = {
  available: call('secretsAvailable'),
  get: call('secretGet'),
  set: call('secretSet'),
  delete: call('secretDelete')
}
