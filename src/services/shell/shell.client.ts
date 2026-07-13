import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Shell/OS IPC (shell:*): open or reveal a path in Finder.
class ShellClient extends BaseClient {
  openPath = (path: string) => this.send(Channel.Shell.OpenPath, { path })
  revealPath = (path: string) => this.send(Channel.Shell.RevealPath, { path })
}

export const shellService = new ShellClient()
