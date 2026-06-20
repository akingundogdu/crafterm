import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { DbConfig } from './db.types'

// Database tool IPC (connect/introspect/query). Saved .sql queries live in the
// dbq client.
class DbClient extends BaseClient {
  connect = (config: DbConfig) => this.call(Channel.Db.Connect, { config })
  objects = (config: DbConfig) => this.call(Channel.Db.Objects, { config })
  columns = (config: DbConfig, table: string) => this.call(Channel.Db.Columns, { config, table })
  query = (config: DbConfig, sql: string) => this.call(Channel.Db.Query, { config, sql })
  disconnect = (id: string) => this.call(Channel.Db.Disconnect, { id })
}

export const dbService = new DbClient()
