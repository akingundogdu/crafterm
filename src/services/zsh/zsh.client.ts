import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Zsh IPC (zsh:*): list the user's aliases + functions for the palette.
class ZshClient extends BaseClient {
  commands = () => this.call(Channel.Zsh.Commands)
}

export const zshService = new ZshClient()
