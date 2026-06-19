import { call } from '../channels.client'

// Secrets/credentials IPC (Electron safeStorage-backed).
export const secretsService = {
  available: () => call('secrets:available'),
  get: (entryId: string, key: string) => call('secrets:get', { entryId, key }),
  set: (entryId: string, key: string, value: string) =>
    call('secrets:set', { entryId, key, value }),
  delete: (entryId: string, key?: string) => call('secrets:delete', { entryId, key })
}
