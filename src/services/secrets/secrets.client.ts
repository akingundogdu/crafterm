import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Secrets/credentials IPC (Electron safeStorage-backed).
class SecretsClient extends BaseClient {
  available = () => this.call(Channel.Secrets.Available)
  get = (entryId: string, key: string) => this.call(Channel.Secrets.Get, { entryId, key })
  set = (entryId: string, key: string, value: string) =>
    this.call(Channel.Secrets.Set, { entryId, key, value })
  delete = (entryId: string, key?: string) => this.call(Channel.Secrets.Delete, { entryId, key })
}

export const secretsService = new SecretsClient()
