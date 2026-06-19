import { call, Channel } from '../channels.client'
import type { DbConfig } from './db.types'

// Database tool IPC (connect/introspect/query + saved .sql queries).
export const dbService = {
  connect: (config: DbConfig) => call(Channel.Db.Connect, { config }),
  objects: (config: DbConfig) => call(Channel.Db.Objects, { config }),
  columns: (config: DbConfig, table: string) => call(Channel.Db.Columns, { config, table }),
  query: (config: DbConfig, sql: string) => call(Channel.Db.Query, { config, sql }),
  disconnect: (id: string) => call(Channel.Db.Disconnect, { id }),
  savedList: (connId: string) => call(Channel.Dbq.List, { connId }),
  savedRead: (connId: string, name: string) => call(Channel.Dbq.Read, { connId, name }),
  savedWrite: (connId: string, name: string, sql: string) =>
    call(Channel.Dbq.Write, { connId, name, sql }),
  savedDelete: (connId: string, name: string) => call(Channel.Dbq.Delete, { connId, name })
}
