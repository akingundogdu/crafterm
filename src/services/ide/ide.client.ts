import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// IDE IPC (ide:*): open a path in the user's IDE via their `ide` command.
class IdeClient extends BaseClient {
  open = (path: string, ide: string) => this.send(Channel.Ide.Open, { path, ide })
}

export const ideService = new IdeClient()
