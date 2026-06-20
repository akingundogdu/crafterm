import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Directory listing IPC (dir:*): one-level folder listing for the folder picker.
class DirClient extends BaseClient {
  list = (path?: string) => this.call(Channel.Dir.List, { path })
}

export const dirService = new DirClient()
