import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Saved-query IPC (dbq:*): list/read/write/delete .sql files per connection.
class DbqClient extends BaseClient {
  list = (connId: string) => this.call(Channel.Dbq.List, { connId })
  read = (connId: string, name: string) => this.call(Channel.Dbq.Read, { connId, name })
  write = (connId: string, name: string, sql: string) => this.call(Channel.Dbq.Write, { connId, name, sql })
  delete = (connId: string, name: string) => this.call(Channel.Dbq.Delete, { connId, name })
}

export const dbqService = new DbqClient()
