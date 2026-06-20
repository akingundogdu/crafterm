import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Backlog IPC (backlog:*): read the backlog todo file for the Improve panel.
class BacklogClient extends BaseClient {
  read = () => this.call(Channel.Backlog.Read)
}

export const backlogService = new BacklogClient()
