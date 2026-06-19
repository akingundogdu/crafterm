import { call, Channel } from '../channels.client'

// Secrets/credentials IPC (Electron safeStorage-backed).
export const secretsService = {
  available: () => call(Channel.Secrets.Available),
  get: (entryId: string, key: string) => call(Channel.Secrets.Get, { entryId, key }),
  set: (entryId: string, key: string, value: string) =>
    call(Channel.Secrets.Set, { entryId, key, value }),
  delete: (entryId: string, key?: string) => call(Channel.Secrets.Delete, { entryId, key })
}
