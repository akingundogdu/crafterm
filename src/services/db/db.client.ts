import { call } from '../channels.client'
import type { DbConfig } from './db.types'

// Database tool IPC (connect/introspect/query + saved .sql queries).
export const dbService = {
  connect: (config: DbConfig) => call('db:connect', { config }),
  objects: (config: DbConfig) => call('db:objects', { config }),
  columns: (config: DbConfig, table: string) => call('db:columns', { config, table }),
  query: (config: DbConfig, sql: string) => call('db:query', { config, sql }),
  disconnect: (id: string) => call('db:disconnect', { id }),
  savedList: (connId: string) => call('dbq:list', { connId }),
  savedRead: (connId: string, name: string) => call('dbq:read', { connId, name }),
  savedWrite: (connId: string, name: string, sql: string) =>
    call('dbq:write', { connId, name, sql }),
  savedDelete: (connId: string, name: string) => call('dbq:delete', { connId, name })
}
